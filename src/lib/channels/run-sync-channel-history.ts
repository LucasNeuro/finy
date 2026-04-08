import { insertHistoryMessagesFromUazapiForConversation } from "@/lib/conversations/insert-remote-chat-messages";
import { invalidateConversationDetail, invalidateConversationList } from "@/lib/redis/inbox-state";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { toCanonicalJid } from "@/lib/phone-canonical";
import { findChats, type UazapiChat } from "@/lib/uazapi/client";
import { isQueueOpen, type BusinessHoursItem, type SpecialDateItem } from "@/lib/queue-hours";

export type RunSyncChannelHistoryResult = {
  ok: boolean;
  chats_processed: number;
  conversations_created: number;
  messages_processed: number;
  error?: string;
};

/**
 * Sincroniza histórico de mensagens (UAZAPI) para todas as conversas do canal.
 * Mesma lógica de POST /api/channels/[id]/sync-history — uso in-process evita fetch+APP_URL+INTERNAL_SYNC_SECRET no Render.
 */
export async function runSyncChannelHistory(params: {
  channelId: string;
  companyId: string;
  token: string;
  createMissingConversations: boolean;
  targetMessagesPerChat: number;
}): Promise<RunSyncChannelHistoryResult> {
  const { channelId, companyId, token, createMissingConversations, targetMessagesPerChat } = params;
  const supabase = createServiceRoleClient();

  const CHAT_PAGE_SIZE = 100;
  const MAX_CHAT_PAGES = 50;
  const chats: UazapiChat[] = [];
  let chatsError: string | undefined;
  for (let page = 0; page < MAX_CHAT_PAGES; page++) {
    const { data: chatsData, ok: chatsOk, error: pageErr } = await findChats(token, {
      limit: CHAT_PAGE_SIZE,
      offset: page * CHAT_PAGE_SIZE,
      sort: "-wa_lastMsgTimestamp",
    });
    if (!chatsOk) {
      chatsError = pageErr;
      break;
    }
    const batch = (chatsData?.chats ?? []) as UazapiChat[];
    if (batch.length === 0) break;
    chats.push(...batch);
    if (batch.length < CHAT_PAGE_SIZE) break;
  }

  if (chats.length === 0) {
    return {
      ok: true,
      chats_processed: 0,
      conversations_created: 0,
      messages_processed: 0,
      error: chatsError ?? undefined,
    };
  }

  const { data: channelRow } = await supabase
    .from("channels")
    .select("id, company_id")
    .eq("id", channelId)
    .eq("company_id", companyId)
    .single();
  if (!channelRow) {
    return {
      ok: false,
      chats_processed: 0,
      conversations_created: 0,
      messages_processed: 0,
      error: "Channel not found",
    };
  }

  const { data: cqData } = await supabase
    .from("channel_queues")
    .select("queue_id, is_default")
    .eq("channel_id", channelId)
    .order("is_default", { ascending: false });
  const cqList = (cqData ?? []) as { queue_id: string; is_default: boolean }[];
  const queueIds = cqList.map((cq) => cq.queue_id);
  let queues = [] as {
    id: string;
    kind: string;
    business_hours?: BusinessHoursItem[] | null;
    special_dates?: SpecialDateItem[] | null;
  }[];
  if (queueIds.length > 0) {
    const { data: queuesData } = await supabase
      .from("queues")
      .select("id, kind, business_hours, special_dates")
      .in("id", queueIds);
    queues = (queuesData ?? []) as typeof queues;
  }

  const queueHoursAt = new Date();

  const { data: convRows } = await supabase
    .from("conversations")
    .select("id, external_id, kind")
    .eq("channel_id", channelId);
  const conversationIdByKey = new Map<string, string>();
  for (const row of convRows ?? []) {
    const r = row as { id: string; external_id?: string | null; kind?: string | null };
    if (!r.external_id || (r.kind !== "group" && r.kind !== "ticket")) continue;
    conversationIdByKey.set(`${r.external_id}\t${r.kind}`, r.id);
  }

  const convKey = (externalId: string, kind: "group" | "ticket") => `${externalId}\t${kind}`;

  function pickQueueId(isGroup: boolean): string | null {
    let queueId: string | null = null;
    if (isGroup) {
      const gq = cqList.find((cq) => queues.find((q) => q.id === cq.queue_id && q.kind === "group"));
      if (gq) queueId = gq.queue_id;
    } else {
      const ticketCqList = cqList.filter((cq) => {
        const q = queues.find((r) => r.id === cq.queue_id);
        return q && (q.kind === "ticket" || !q.kind);
      });
      for (const cq of ticketCqList) {
        const q = queues.find((r) => r.id === cq.queue_id);
        if (
          q &&
          isQueueOpen(
            {
              business_hours: (q.business_hours ?? []) as BusinessHoursItem[],
              special_dates: (q.special_dates ?? []) as SpecialDateItem[],
            },
            queueHoursAt
          )
        ) {
          queueId = cq.queue_id;
          break;
        }
      }
      if (!queueId && ticketCqList.length > 0) queueId = ticketCqList[0].queue_id;
      if (!queueId && cqList.length > 0) queueId = cqList[0].queue_id;
    }
    return queueId;
  }

  const MAX_MESSAGES_PER_INSTANCE = 15_000;
  let conversationsCreated = 0;
  let messagesInserted = 0;
  const touchedConversationIds = new Set<string>();

  for (const chat of chats) {
    if (messagesInserted >= MAX_MESSAGES_PER_INSTANCE) break;

    const waChatid = (chat.wa_chatid ?? "").toString().trim();
    if (!waChatid) continue;

    const isGroup = chat.wa_isGroup === true || waChatid.endsWith("@g.us");
    const canonicalChatId = toCanonicalJid(waChatid, isGroup) || waChatid;
    const kind: "group" | "ticket" = isGroup ? "group" : "ticket";
    const queueId = pickQueueId(isGroup);

    let conversationId: string | null = conversationIdByKey.get(convKey(canonicalChatId, kind)) ?? null;

    if (!conversationId) {
      if (isGroup) {
        await supabase.from("channel_groups").upsert(
          {
            channel_id: channelId,
            company_id: companyId,
            jid: waChatid,
            name: (chat.wa_name ?? chat.wa_contactName ?? null) ?? null,
            synced_at: new Date().toISOString(),
          },
          { onConflict: "channel_id,jid" }
        );
      }

      if (!createMissingConversations) {
        continue;
      }

      if (isGroup) {
        if (!queueId) continue;
        const { data: insertedConv } = await supabase
          .from("conversations")
          .insert({
            company_id: companyId,
            channel_id: channelId,
            external_id: canonicalChatId,
            wa_chat_jid: canonicalChatId,
            kind: "group",
            is_group: true,
            customer_phone: canonicalChatId,
            customer_name: (chat.wa_name ?? chat.wa_contactName ?? "Grupo") as string,
            queue_id: queueId,
            status: "open",
            assigned_to: null,
            last_message_at: new Date().toISOString(),
          })
          .select("id")
          .single();
        const newGroupConvId = insertedConv?.id;
        if (!newGroupConvId) continue;
        conversationId = newGroupConvId;
        conversationIdByKey.set(convKey(canonicalChatId, kind), newGroupConvId);
        conversationsCreated++;
      } else {
        const digits = waChatid.replace(/@.*$/, "").replace(/\D/g, "");
        const displayPhone = digits || null;
        await supabase.from("channel_contacts").upsert(
          {
            channel_id: channelId,
            company_id: companyId,
            jid: canonicalChatId,
            phone: displayPhone,
            contact_name: ((chat.wa_name ?? chat.wa_contactName ?? null) as string | null) ?? null,
            first_name: ((chat.wa_contactName ?? chat.wa_name ?? null) as string | null) ?? null,
            synced_at: new Date().toISOString(),
          },
          { onConflict: "channel_id,jid", ignoreDuplicates: false }
        );
        if (!queueId) continue;
        const { data: insertedConv } = await supabase
          .from("conversations")
          .insert({
            company_id: companyId,
            channel_id: channelId,
            external_id: canonicalChatId,
            wa_chat_jid: canonicalChatId,
            kind: "ticket",
            is_group: false,
            customer_phone: displayPhone,
            customer_name: (chat.wa_name ?? chat.wa_contactName ?? null) as string | null,
            queue_id: queueId,
            assigned_to: null,
            status: "open",
            last_message_at: new Date().toISOString(),
          })
          .select("id")
          .single();
        const newTicketConvId = insertedConv?.id;
        if (!newTicketConvId) continue;
        conversationId = newTicketConvId;
        conversationIdByKey.set(convKey(canonicalChatId, kind), newTicketConvId);
        conversationsCreated++;
      }
    }

    if (!conversationId) continue;

    const budget = Math.min(targetMessagesPerChat, MAX_MESSAGES_PER_INSTANCE - messagesInserted);
    if (budget < 1) continue;

    const { inserted, resolvedChatJid } = await insertHistoryMessagesFromUazapiForConversation(
      supabase,
      token,
      conversationId,
      waChatid,
      budget
    );

    if (resolvedChatJid?.trim()) {
      const next = resolvedChatJid.trim();
      if (next.toLowerCase() !== waChatid.trim().toLowerCase()) {
        await supabase
          .from("conversations")
          .update({
            wa_chat_jid: next,
            external_id: next,
            updated_at: new Date().toISOString(),
          })
          .eq("id", conversationId)
          .eq("company_id", companyId);
      }
    }

    if (inserted > 0) {
      touchedConversationIds.add(conversationId);
    }
    messagesInserted += inserted;
  }

  if (touchedConversationIds.size > 0) {
    const ids = [...touchedConversationIds];
    const CHUNK = 150;
    for (let i = 0; i < ids.length; i += CHUNK) {
      const slice = ids.slice(i, i + CHUNK);
      await supabase
        .from("conversations")
        .update({ messages_snapshot: null, updated_at: new Date().toISOString() })
        .eq("company_id", companyId)
        .in("id", slice);
      await Promise.all(slice.map((convId) => invalidateConversationDetail(convId, companyId)));
    }
  }

  await invalidateConversationList(companyId);

  return {
    ok: true,
    chats_processed: chats.length,
    conversations_created: conversationsCreated,
    messages_processed: messagesInserted,
    error: chatsError ?? undefined,
  };
}
