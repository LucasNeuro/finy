import { getCompanyIdFromRequest } from "@/lib/auth/get-company";
import { requirePermission } from "@/lib/auth/get-profile";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { isQueueOpen, type BusinessHoursItem, type SpecialDateItem } from "@/lib/queue-hours";
import { invalidateConversationList } from "@/lib/redis/inbox-state";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { getChannelToken } from "@/lib/uazapi/channel-token";
import { toCanonicalJid } from "@/lib/phone-canonical";
import { findChats, findMessages, type UazapiChat, type UazapiMessage } from "@/lib/uazapi/client";
import { NextResponse } from "next/server";

/**
 * POST /api/channels/[id]/sync-history
 * Sincroniza histórico de mensagens apenas para conversas que já existem (criadas pelo webhook).
 * Não cria conversas novas: assim Novos/Filas só recebem chamados de mensagens novas.
 * Atualiza channel_groups com nome de grupos; mensagens antigas são inseridas só em conversas existentes.
 * Pode ser chamado pelo usuário (auth + permission) ou internamente (X-Internal-Sync-Secret).
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

  const { data: chatsData, ok: chatsOk, error: chatsError } = await findChats(token, {
    limit: 100,
    offset: 0,
    sort: "-wa_lastMsgTimestamp",
  });

  if (!chatsOk || !chatsData?.chats?.length) {
    return NextResponse.json({
      ok: true,
      chats_processed: 0,
      messages_processed: 0,
      error: chatsError ?? undefined,
    });
  }

  const MAX_MESSAGES_PER_INSTANCE = 15_000;
  const MESSAGES_PAGE_SIZE = 100;

  const chats = chatsData.chats as UazapiChat[];
  let conversationsCreated = 0;
  let messagesInserted = 0;

  for (const chat of chats) {
    if (messagesInserted >= MAX_MESSAGES_PER_INSTANCE) break;

    const waChatid = (chat.wa_chatid ?? "").toString().trim();
    if (!waChatid) continue;

    const isGroup = chat.wa_isGroup === true || waChatid.endsWith("@g.us");
    const canonicalChatId = toCanonicalJid(waChatid, isGroup) || waChatid;

    const { data: channelRow } = await supabase
      .from("channels")
      .select("id, company_id")
      .eq("id", channelId)
      .eq("company_id", companyId)
      .single();

    if (!channelRow) continue;

    const { data: cqData } = await supabase
      .from("channel_queues")
      .select("queue_id, is_default")
      .eq("channel_id", channelId)
      .order("is_default", { ascending: false });
    const cqList = (cqData ?? []) as { queue_id: string; is_default: boolean }[];
    const { data: queuesData } = await supabase
      .from("queues")
      .select("id, kind, business_hours, special_dates")
      .in("id", cqList.map((cq) => cq.queue_id));

    const queues = (queuesData ?? []) as { id: string; kind: string; business_hours?: BusinessHoursItem[] | null; special_dates?: SpecialDateItem[] | null }[];
    let queueId: string | null = null;
    if (isGroup) {
      const gq = cqList.find((cq) => queues.find((q) => q.id === cq.queue_id && q.kind === "group"));
      if (gq) queueId = gq.queue_id;
    } else {
      const ticketCqList = cqList.filter((cq) => {
        const q = queues.find((r) => r.id === cq.queue_id);
        return q && (q.kind === "ticket" || !q.kind);
      });
      const at = new Date();
      for (const cq of ticketCqList) {
        const q = queues.find((r) => r.id === cq.queue_id);
        if (q && isQueueOpen(
          {
            business_hours: (q.business_hours ?? []) as BusinessHoursItem[],
            special_dates: (q.special_dates ?? []) as SpecialDateItem[],
          },
          at
        )) {
          queueId = cq.queue_id;
          break;
        }
      }
      if (!queueId && ticketCqList.length > 0) queueId = ticketCqList[0].queue_id;
      if (!queueId && cqList.length > 0) queueId = cqList[0].queue_id;
    }

    let conversationId: string | null = null;
    const { data: existing } = await supabase
      .from("conversations")
      .select("id")
      .eq("channel_id", channelId)
      .eq("external_id", canonicalChatId)
      .eq("kind", isGroup ? "group" : "ticket")
      .single();

    if (existing) {
      conversationId = existing.id;
    } else {
      // Não criar conversas novas no sync: só preencher histórico em conversas já existentes
      // (criadas pelo webhook quando chega mensagem nova). Assim Novos/Filas só recebem chamados novos.
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
      continue; // pula este chat: não criar conversa nem buscar mensagens
    }

    if (!conversationId) continue;

    const mediaTypeMap: Record<string, string> = {
      image: "image", video: "video", audio: "audio", myaudio: "audio", ptt: "ptt", ptv: "video",
      document: "document", sticker: "sticker",
    };
    let msgOffset = 0;
    let latestSentAt = 0;

    while (messagesInserted < MAX_MESSAGES_PER_INSTANCE) {
      const { data: msgData, ok: msgOk } = await findMessages(token, waChatid, {
        limit: MESSAGES_PAGE_SIZE,
        offset: msgOffset,
      });
      const messages = (msgOk && msgData?.messages ? msgData.messages : []) as UazapiMessage[];
      if (messages.length === 0) break;

      for (const msg of messages) {
        const fromMe = msg.fromMe === true;
        const body = (msg.body ?? msg.text ?? "").toString().trim();
        const rawType = (msg.type ?? msg.mediaType ?? "") as string;
        const msgMediaUrl = (msg.mediaUrl ?? msg.file ?? msg.url ?? msg.image ?? msg.base64 ?? (msg as { media?: { url?: string } }).media?.url ?? "") as string;
        const msgCaption = (msg.caption ?? msg.body ?? msg.text ?? "").toString().trim();
        const msgFileName = (msg.fileName ?? msg.filename ?? msg.docName ?? "") as string;
        const messageType = rawType ? (mediaTypeMap[String(rawType).toLowerCase()] ?? "text") : "text";
        const isMedia = messageType !== "text" && msgMediaUrl;
        const content = body || (isMedia ? `[${messageType}]` : "");
        const rawTs = msg.timestamp;
        const sentAt =
          rawTs != null && typeof rawTs === "number"
            ? new Date(rawTs * 1000).toISOString()
            : new Date().toISOString();
        if (typeof rawTs === "number" && rawTs * 1000 > latestSentAt) latestSentAt = rawTs * 1000;
        const extId = (msg.id ?? "").toString() || null;

        if (extId) {
          const { data: existingByExt } = await supabase
            .from("messages")
            .select("id")
            .eq("conversation_id", conversationId)
            .eq("external_id", extId)
            .limit(1)
            .single();
          if (existingByExt) continue;
        } else {
          const { data: existingBySent } = await supabase
            .from("messages")
            .select("id")
            .eq("conversation_id", conversationId)
            .eq("sent_at", sentAt)
            .limit(1)
            .single();
          if (existingBySent) continue;
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

        const { error: msgInsErr } = await supabase.from("messages").insert(insertPayload);
        if (!msgInsErr) messagesInserted++;
      }

      if (messages.length < MESSAGES_PAGE_SIZE) break;
      msgOffset += MESSAGES_PAGE_SIZE;
    }

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
