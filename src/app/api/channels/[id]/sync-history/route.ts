import { getCompanyIdFromRequest } from "@/lib/auth/get-company";
import { requirePermission } from "@/lib/auth/get-profile";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { isQueueOpen, type BusinessHoursItem, type SpecialDateItem } from "@/lib/queue-hours";
import { invalidateConversationList } from "@/lib/redis/inbox-state";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { getChannelToken } from "@/lib/uazapi/channel-token";
import { toCanonicalJid } from "@/lib/phone-canonical";
import { findChats, findMessages, type UazapiChat, type UazapiMessage } from "@/lib/uazapi/client";
import { uazapiMessageBelongsToChat } from "@/lib/conversations/uazapi-message-belongs-to-chat";
import { NextResponse } from "next/server";

/** Vercel / plataformas com limite — sync pode levar vários minutos. */
export const maxDuration = 300;

/**
 * POST /api/channels/[id]/sync-history
 * Sincroniza histórico de mensagens via UAZAPI (lista de chats e mensagens por chat).
 * Por padrão só preenche conversas que já existem. Com body { create_missing: true } ou
 * ?create_missing=1, cria conversa/contato faltante e importa até messages_per_chat (default 200, max 1000).
 * Atualiza channel_groups para grupos mesmo quando não cria conversa.
 * Auth: usuário com channels.manage, ou chamada interna com X-Internal-Sync-Secret.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: channelId } = await params;
  if (!channelId) {
    return NextResponse.json({ error: "channel id required" }, { status: 400 });
  }

  const internalSecret = request.headers.get("X-Internal-Sync-Secret");
  const expectedSecret = process.env.INTERNAL_SYNC_SECRET;
  const isInternalCall = Boolean(expectedSecret && internalSecret === expectedSecret);

  let companyId: string | null = null;

  if (isInternalCall) {
    const supabaseAdmin = createServiceRoleClient();
    const { data: ch } = await supabaseAdmin
      .from("channels")
      .select("company_id")
      .eq("id", channelId)
      .single();
    companyId = (ch as { company_id?: string } | null)?.company_id ?? null;
    if (!companyId) {
      return NextResponse.json({ error: "Channel not found" }, { status: 404 });
    }
  } else {
    companyId = await getCompanyIdFromRequest(request);
    if (!companyId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const permErr = await requirePermission(companyId, PERMISSIONS.channels.manage);
    if (permErr) {
      return NextResponse.json({ error: permErr.error }, { status: permErr.status });
    }
  }

  const resolved = await getChannelToken(channelId, companyId!);
  if (!resolved) {
    return NextResponse.json({ error: "Channel not found" }, { status: 404 });
  }

  const token = resolved.token;
  const supabase = createServiceRoleClient();
  let body: Record<string, unknown> = {};
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    body = {};
  }
  const url = new URL(request.url);
  const createMissingConversations =
    String(body.create_missing ?? url.searchParams.get("create_missing") ?? "").toLowerCase() === "true" ||
    String(body.create_missing ?? url.searchParams.get("create_missing") ?? "") === "1";
  const envDefault = Number(process.env.SYNC_HISTORY_MAX_MESSAGES_PER_CHAT);
  const defaultPerChat =
    Number.isFinite(envDefault) && envDefault > 0 ? Math.min(5000, Math.floor(envDefault)) : 200;
  const targetMessagesPerChatRaw = Number(
    body.messages_per_chat ?? url.searchParams.get("messages_per_chat") ?? defaultPerChat
  );
  const targetMessagesPerChat =
    Number.isFinite(targetMessagesPerChatRaw) && targetMessagesPerChatRaw > 0
      ? Math.min(Math.max(Math.floor(targetMessagesPerChatRaw), 1), 1000)
      : 200;

  /** uazapi devolve chats paginados. */
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
    return NextResponse.json({
      ok: true,
      chats_processed: 0,
      messages_processed: 0,
      error: chatsError ?? undefined,
    });
  }

  const { data: channelRow } = await supabase
    .from("channels")
    .select("id, company_id")
    .eq("id", channelId)
    .eq("company_id", companyId)
    .single();
  if (!channelRow) {
    return NextResponse.json({ error: "Channel not found" }, { status: 404 });
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
  const MESSAGES_PAGE_SIZE = 100;
  const MESSAGE_INSERT_BATCH = 40;
  const MAX_MESSAGE_FIND_PAGES_PER_CHAT = 80;
  let conversationsCreated = 0;
  let messagesInserted = 0;

  const mediaTypeMap: Record<string, string> = {
    image: "image",
    video: "video",
    audio: "audio",
    myaudio: "audio",
    ptt: "ptt",
    ptv: "video",
    document: "document",
    sticker: "sticker",
  };

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

    const { data: existMsgRows } = await supabase
      .from("messages")
      .select("external_id, sent_at")
      .eq("conversation_id", conversationId)
      .limit(8000);
    const seenExt = new Set<string>();
    const seenSent = new Set<string>();
    for (const r of existMsgRows ?? []) {
      const row = r as { external_id?: string | null; sent_at?: string };
      if (row.external_id) seenExt.add(row.external_id);
      else if (row.sent_at) seenSent.add(row.sent_at);
    }

    let msgOffset = 0;
    let latestSentAt = 0;
    let chatMessagesInserted = 0;
    let msgPagesForChat = 0;
    const pendingInserts: Record<string, unknown>[] = [];

    const flushMessages = async () => {
      if (pendingInserts.length === 0) return;
      const batch = pendingInserts.splice(0, pendingInserts.length);
      const { error: batchErr } = await supabase.from("messages").insert(batch);
      if (!batchErr) {
        messagesInserted += batch.length;
        chatMessagesInserted += batch.length;
        return;
      }
      for (const row of batch) {
        const { error: oneErr } = await supabase.from("messages").insert(row);
        if (!oneErr) {
          messagesInserted++;
          chatMessagesInserted++;
        }
      }
    };

    while (
      messagesInserted < MAX_MESSAGES_PER_INSTANCE &&
      chatMessagesInserted < targetMessagesPerChat &&
      msgPagesForChat < MAX_MESSAGE_FIND_PAGES_PER_CHAT
    ) {
      msgPagesForChat += 1;
      const { data: msgData, ok: msgOk } = await findMessages(token, waChatid, {
        limit: MESSAGES_PAGE_SIZE,
        offset: msgOffset,
      });
      const rawNext =
        msgOk && msgData && typeof msgData.nextOffset === "number" && Number.isFinite(msgData.nextOffset)
          ? msgData.nextOffset
          : undefined;
      const messages = (msgOk && msgData?.messages ? msgData.messages : []) as UazapiMessage[];
      if (messages.length === 0) {
        if (typeof rawNext === "number" && rawNext > msgOffset) {
          msgOffset = rawNext;
          continue;
        }
        break;
      }

      for (const msg of messages) {
        if (chatMessagesInserted >= targetMessagesPerChat) break;
        if (!uazapiMessageBelongsToChat(msg, waChatid)) continue;
        const fromMe = msg.fromMe === true;
        const bodyText = (msg.body ?? msg.text ?? "").toString().trim();
        const rawType = (msg.type ?? msg.mediaType ?? "") as string;
        const msgMediaUrl = (msg.mediaUrl ??
          msg.file ??
          msg.url ??
          msg.image ??
          msg.base64 ??
          (msg as { media?: { url?: string } }).media?.url ??
          "") as string;
        const msgCaption = (msg.caption ?? msg.body ?? msg.text ?? "").toString().trim();
        const msgFileName = (msg.fileName ?? msg.filename ?? msg.docName ?? "") as string;
        const messageType = rawType ? (mediaTypeMap[String(rawType).toLowerCase()] ?? "text") : "text";
        const isMedia = messageType !== "text" && msgMediaUrl;
        const content = bodyText || (isMedia ? `[${messageType}]` : "");
        const rawTs = msg.timestamp;
        const sentAt =
          rawTs != null && typeof rawTs === "number"
            ? new Date(rawTs * 1000).toISOString()
            : new Date().toISOString();
        if (typeof rawTs === "number" && rawTs * 1000 > latestSentAt) latestSentAt = rawTs * 1000;
        const extId = (msg.id ?? "").toString() || null;

        if (extId) {
          if (seenExt.has(extId)) continue;
        } else {
          if (seenSent.has(sentAt)) continue;
        }

        const insertPayload: Record<string, unknown> = {
          conversation_id: conversationId,
          direction: fromMe ? "out" : "in",
          content: content.slice(0, 10000),
          message_type: isMedia ? messageType : "text",
          external_id: extId,
          sent_at: sentAt,
        };
        if (isMedia && msgMediaUrl.trim()) insertPayload.media_url = msgMediaUrl.trim().slice(0, 10000);
        if (isMedia && msgCaption) insertPayload.caption = msgCaption.slice(0, 2000);
        if (msgFileName && typeof msgFileName === "string") insertPayload.file_name = msgFileName.slice(0, 255);

        pendingInserts.push(insertPayload);
        if (extId) seenExt.add(extId);
        else seenSent.add(sentAt);

        if (pendingInserts.length >= MESSAGE_INSERT_BATCH) {
          await flushMessages();
        }
        if (chatMessagesInserted >= targetMessagesPerChat) break;
      }

      await flushMessages();

      if (chatMessagesInserted >= targetMessagesPerChat) break;
      if (typeof rawNext === "number" && rawNext > msgOffset) {
        msgOffset = rawNext;
      } else if (msgData?.hasMore === false) {
        break;
      } else {
        msgOffset += MESSAGES_PAGE_SIZE;
      }
    }

    await flushMessages();

    if (latestSentAt > 0) {
      await supabase
        .from("conversations")
        .update({
          last_message_at: new Date(latestSentAt).toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", conversationId);
    }
  }

  await invalidateConversationList(companyId);
  return NextResponse.json({
    ok: true,
    chats_processed: chats.length,
    conversations_created: conversationsCreated,
    messages_processed: messagesInserted,
    error: chatsError ?? undefined,
  });
}
