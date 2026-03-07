import { createServiceRoleClient } from "@/lib/supabase/admin";
import { isQueueOpen, type BusinessHoursItem, type SpecialDateItem } from "@/lib/queue-hours";
import { getRedisClient } from "@/lib/redis/client";
import { invalidateConversationDetail, invalidateConversationList } from "@/lib/redis/inbox-state";
import { NextResponse } from "next/server";

type WebhookPayload = {
  event?: string;
  instance?: string;
  data?: {
    chatId?: string;
    chatid?: string;
    from?: string;
    number?: string;
    text?: string;
    body?: string;
    fromMe?: boolean;
    isGroup?: boolean;
    timestamp?: number;
    wa_contactName?: string;
    pushName?: string;
    name?: string;
    id?: string;
    key?: { id?: string };
    [key: string]: unknown;
  };
};

type QueueRow = {
  id: string;
  kind: string;
  business_hours?: BusinessHoursItem[] | null;
  special_dates?: SpecialDateItem[] | null;
};

type ChannelQueueRow = { queue_id: string; is_default: boolean; kind?: string };

/** Evita disparar sync de histórico várias vezes seguidas para o mesmo canal (várias empresas/conexões). */
const lastSyncTriggerByInstance = new Map<string, number>();
const SYNC_DEBOUNCE_MS = 5 * 60 * 1000; // 5 minutos

/**
 * Dispara sincronização de histórico em background quando o WhatsApp conecta.
 * Chamado sem await para o webhook responder 200 rápido.
 * Debounce: mesmo canal não dispara de novo antes de 5 min (evita gargalo com muitas empresas).
 * No deploy (ex.: Render) defina: APP_URL=https://clicvend.onrender.com e INTERNAL_SYNC_SECRET=<senha secreta>.
 */
function triggerSyncHistoryForInstance(instanceId: string): void {
  const now = Date.now();
  const last = lastSyncTriggerByInstance.get(instanceId) ?? 0;
  if (now - last < SYNC_DEBOUNCE_MS) return;
  lastSyncTriggerByInstance.set(instanceId, now);

  const baseUrl = process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL;
  const secret = process.env.INTERNAL_SYNC_SECRET;
  if (!baseUrl || !secret) return;

  void (async () => {
    try {
      const supabase = createServiceRoleClient();
      const { data: ch } = await supabase
        .from("channels")
        .select("id")
        .eq("uazapi_instance_id", instanceId)
        .eq("is_active", true)
        .single();
      const channelId = (ch as { id?: string } | null)?.id;
      if (!channelId) return;

      const url = `${baseUrl.replace(/\/$/, "")}/api/channels/${channelId}/sync-history`;
      await fetch(url, {
        method: "POST",
        headers: { "X-Internal-Sync-Secret": secret, "Content-Type": "application/json" },
      });
    } catch {
      // ignorar erros; sync pode ser refeito manualmente ou na próxima conexão
    }
  })();
}

/**
 * Webhook global UAZAPI — uma URL para todas as empresas (ex.: 300 corretores).
 *
 * Eventos que ESCUTAMOS no painel e o que fazemos:
 * - messages          → processamos: cria/atualiza conversa, insere mensagem, distribui fila (até 80 itens/request).
 * - messages_update   → só 200 (status lido/entregue; não grava no nosso DB para não sobrecarregar).
 * - contacts, groups, chats, chat_labels, leads → só 200 (não processamos; evita gargalo).
 * - connection / connected / onconnection → 200 + dispara sync de histórico em background (com debounce 5 min).
 * - history           → processamos como lote de mensagens (até 80 itens).
 *
 * Manter "wasSentByApi" excluído no painel para não entrar em loop.
 */
export async function POST(request: Request) {
  try {
    const body = (await request.json()) as WebhookPayload;
    const event = body?.event;
    const instanceId = body?.instance;
    const data = body?.data ?? {};

    if (!instanceId) {
      return NextResponse.json(
        { error: "Missing instance" },
        { status: 400 }
      );
    }

    const isHistory = event === "history";
    const isMessageEvent =
      event === "messages" ||
      event === "message" ||
      event === "onmessage" ||
      event === "message.update" ||
      event === "message_create" ||
      event === "message.create";
    const hasMessageLikeData =
      (data?.chatId || data?.chatid) &&
      (data?.text != null || data?.body != null || data?.content != null || data?.caption != null ||
       data?.mediaUrl != null || data?.file != null || (data?.type && data?.type !== "conversation"));
    const treatAsMessage = isMessageEvent || isHistory || (!event && hasMessageLikeData);

    if (!treatAsMessage) {
      if (event === "connection" || event === "connected" || event === "onconnection") {
        triggerSyncHistoryForInstance(instanceId);
      }
      return NextResponse.json({ ok: true });
    }

    const items: WebhookPayload["data"][] =
      isHistory && Array.isArray(body.data)
        ? (body.data as WebhookPayload["data"][])
        : Array.isArray((body as { messages?: unknown }).messages)
          ? ((body as { messages: WebhookPayload["data"][] }).messages)
          : [data];

    const MAX_ITEMS_PER_REQUEST = 80;
    const toProcess = items.slice(0, MAX_ITEMS_PER_REQUEST);

    for (const item of toProcess) {
      const ok = await processOneMessage(instanceId, item ?? {}, isHistory);
      if (!ok) break;
    }
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json(
      { error: "Invalid payload" },
      { status: 400 }
    );
  }
}

async function processOneMessage(
  instanceId: string,
  data: WebhookPayload["data"],
  allowFromMe: boolean
): Promise<boolean> {
  if (!data) return true;

  const fromMe = data.fromMe === true;
  if (fromMe && !allowFromMe) return true;

  const externalId = (data.chatId ?? data.chatid ?? "") as string;
  const customerPhone = (data.from ?? data.number ?? data.wa_id ?? "") as string;
  const rawType = (data.type ?? data.mediaType ?? data.messageType ?? "") as string;
  const mediaUrl = (
    data.mediaUrl ?? data.file ?? data.url ?? data.image ?? data.base64 ?? (data as { media?: { url?: string } }).media?.url ?? ""
  ) as string;
  const caption = (data.caption ?? data.text ?? data.body ?? data.content ?? "") as string;
  const textContent = (data.text ?? data.body ?? data.content ?? "") as string;
  const content = textContent || caption || (rawType && mediaUrl ? `[${rawType}]` : "");
  const rawTs = data.timestamp ?? data.sent_at;
  const sentAt =
    rawTs != null && (typeof rawTs === "number" || typeof rawTs === "string")
      ? new Date(typeof rawTs === "number" ? rawTs * 1000 : rawTs).toISOString()
      : new Date().toISOString();

  if (!externalId || (!content && !mediaUrl)) return true;

  const mediaTypeMap: Record<string, string> = {
    image: "image", video: "video", audio: "audio", myaudio: "audio", ptt: "ptt", ptv: "video",
    document: "document", sticker: "sticker",
  };
  const messageType = rawType ? (mediaTypeMap[String(rawType).toLowerCase()] ?? "text") : "text";
  const isMedia = messageType !== "text" && (mediaUrl || content === `[${rawType}]`);
  const finalContent = isMedia ? (caption || textContent || `[${messageType}]`).slice(0, 10000) : content.slice(0, 10000);
  const finalMessageType = isMedia ? messageType : "text";
  const finalMediaUrl = isMedia && mediaUrl ? String(mediaUrl).trim() : null;
  const finalCaption = isMedia && (caption || textContent) ? (caption || textContent).slice(0, 2000) : null;
  const fileName = (data.fileName ?? data.filename ?? data.docName) as string | undefined;
  const finalFileName = fileName && typeof fileName === "string" ? fileName.slice(0, 255) : null;

    const isGroup =
      data.isGroup === true ||
      (typeof externalId === "string" && externalId.endsWith("@g.us"));

    const supabase = createServiceRoleClient();

    type CachedChannel = { id: string; company_id: string; queue_id: string | null };
    let channel: CachedChannel | null = null;

    // Cache Redis aqui só para o fluxo de atendimento (evitar hit no banco a cada mensagem). Telas de Conexões/canais não usam Redis.
    const redis = await getRedisClient();
    const cacheKey = `uaz:instance:${instanceId}`;

    if (redis) {
      const cached = await redis.get(cacheKey);
      if (cached) {
        try {
          channel = JSON.parse(cached) as CachedChannel;
        } catch {
          channel = null;
        }
      }
    }

    if (!channel) {
      const { data: chData, error } = await supabase
        .from("channels")
        .select("id, company_id, queue_id")
        .eq("uazapi_instance_id", instanceId)
        .eq("is_active", true)
        .single();

      if (error || !chData) return true;

      channel = {
        id: chData.id as string,
        company_id: chData.company_id as string,
        queue_id: (chData.queue_id as string | null) ?? null,
      };

      if (redis) {
        await redis.set(cacheKey, JSON.stringify(channel), { EX: 300 }).catch(() => {});
      }
    }

    const companyId = channel.company_id;
    const channelId = channel.id;

    // Carrega channel_queues + queues com kind (ticket | group)
    const { data: cqData } = await supabase
      .from("channel_queues")
      .select("queue_id, is_default")
      .eq("channel_id", channelId)
      .order("is_default", { ascending: false });

    const cqList = (cqData ?? []) as ChannelQueueRow[];
  if (cqList.length === 0 && !channel.queue_id) return true;

    const queueIds = cqList.length > 0
      ? cqList.map((cq) => cq.queue_id)
      : channel.queue_id
        ? [channel.queue_id]
        : [];

    const { data: queuesData } = await supabase
      .from("queues")
      .select("id, kind, business_hours, special_dates")
      .in("id", queueIds);

    let queues: QueueRow[] = [];
    if (queuesData) {
      const withSpecial = queuesData as (QueueRow & { special_dates?: unknown })[];
      queues = withSpecial.map((q) => ({
        id: q.id,
        kind: q.kind ?? "ticket",
        business_hours: q.business_hours ?? null,
        special_dates: q.special_dates ?? null,
      }));
    }

    const customerName = (data.wa_contactName ?? data.pushName ?? data.name) ?? null;
    const messageExternalId =
      (data as { id?: string }).id ?? (data as { key?: { id?: string } }).key?.id ?? null;

    if (isGroup) {
      // --- Fluxo GRUPO ---
      const groupQueueId = (() => {
        for (const cq of cqList) {
          const q = queues.find((r) => r.id === cq.queue_id && r.kind === "group");
          if (q) return q.id;
        }
        return null;
      })();

      if (!groupQueueId) return true;

      await supabase.from("channel_groups").upsert(
        {
          channel_id: channelId,
          company_id: companyId,
          jid: externalId,
          name: (data.chatName ?? data.subject ?? customerName) ?? null,
          synced_at: new Date().toISOString(),
        },
        { onConflict: "channel_id,jid" }
      );

      const { data: existing } = await supabase
        .from("conversations")
        .select("id")
        .eq("channel_id", channelId)
        .eq("external_id", externalId)
        .eq("kind", "group")
        .single();

      let conversationId: string;
      if (existing) {
        conversationId = existing.id;
        await supabase
          .from("conversations")
          .update({
            last_message_at: sentAt,
            updated_at: new Date().toISOString(),
            wa_chat_jid: externalId,
          })
          .eq("id", conversationId);
      } else {
        const { data: inserted, error: insertErr } = await supabase
          .from("conversations")
          .insert({
            company_id: companyId,
            channel_id: channelId,
            external_id: externalId,
            wa_chat_jid: externalId,
            kind: "group",
            is_group: true,
            customer_phone: customerPhone,
            customer_name: customerName,
            queue_id: groupQueueId,
            status: "open",
            last_message_at: sentAt,
          })
          .select("id")
          .single();
        if (insertErr || !inserted) return false;
        conversationId = inserted.id;
      }

      await supabase.from("messages").insert({
        conversation_id: conversationId,
        direction: fromMe ? "out" : "in",
        content: finalContent,
        message_type: finalMessageType,
        ...(finalMediaUrl && { media_url: finalMediaUrl }),
        ...(finalCaption && { caption: finalCaption }),
        ...(finalFileName && { file_name: finalFileName }),
        external_id: messageExternalId,
        sent_at: sentAt,
      });
      await Promise.all([
        invalidateConversationList(companyId),
        invalidateConversationDetail(conversationId),
      ]);
      return true;
    }

    // --- Fluxo TICKET (contato) ---
    const ticketCqList = cqList.filter((cq) => {
      const q = queues.find((r) => r.id === cq.queue_id);
      return q && (q.kind === "ticket" || !q.kind);
    });
    const fallbackCq = channel.queue_id
      ? [{ queue_id: channel.queue_id, is_default: true }]
      : [];

    const listForHours = ticketCqList.length > 0 ? ticketCqList : fallbackCq;
    let queueId: string | null = null;
    const at = new Date(sentAt);
    for (const cq of listForHours) {
      const q = queues.find((r) => r.id === cq.queue_id);
      if (
        q &&
        isQueueOpen(
          {
            business_hours: (q.business_hours ?? []) as BusinessHoursItem[],
            special_dates: (q.special_dates ?? []) as SpecialDateItem[],
          },
          at
        )
      ) {
        queueId = cq.queue_id;
        break;
      }
    }
    if (!queueId && listForHours.length > 0) {
      queueId = listForHours[0].queue_id;
    }

    const { data: existingTicket } = await supabase
      .from("conversations")
      .select("id")
      .eq("channel_id", channelId)
      .eq("external_id", externalId)
      .eq("kind", "ticket")
      .single();

    let conversationId: string;
    if (existingTicket) {
      conversationId = existingTicket.id;
      await supabase
        .from("conversations")
        .update({
          last_message_at: sentAt,
          updated_at: new Date().toISOString(),
          wa_chat_jid: externalId,
        })
        .eq("id", conversationId);
    } else {
      let assignedTo: string | null = null;
      if (queueId) {
        const { data: assignments } = await supabase
          .from("queue_assignments")
          .select("user_id")
          .eq("queue_id", queueId)
          .eq("company_id", companyId)
          .order("last_assigned_at", { ascending: true, nullsFirst: true })
          .limit(1);

        const first = (assignments ?? []) as { user_id: string }[];
        if (first.length > 0) {
          assignedTo = first[0].user_id;
          await supabase
            .from("queue_assignments")
            .update({ last_assigned_at: new Date().toISOString() })
            .eq("queue_id", queueId)
            .eq("user_id", assignedTo)
            .eq("company_id", companyId);
        }
      }

      const { data: inserted, error: insertConvError } = await supabase
        .from("conversations")
        .insert({
          company_id: companyId,
          channel_id: channelId,
          external_id: externalId,
          wa_chat_jid: externalId,
          kind: "ticket",
          is_group: false,
          customer_phone: customerPhone,
          customer_name: customerName,
          queue_id: queueId,
          assigned_to: assignedTo,
          status: "open",
          last_message_at: sentAt,
        })
        .select("id")
        .single();

      if (insertConvError || !inserted) return false;
      conversationId = inserted.id;
      // Garante que o contato exista em channel_contacts para depois preencher avatar_url (sync-contacts ou chat-details).
      await supabase.from("channel_contacts").upsert(
        {
          channel_id: channelId,
          company_id: companyId,
          jid: externalId,
          phone: customerPhone || null,
          contact_name: customerName || null,
        },
        { onConflict: "channel_id,jid", ignoreDuplicates: false }
      );
    }

  await supabase.from("messages").insert({
    conversation_id: conversationId,
    direction: fromMe ? "out" : "in",
    content: finalContent,
    message_type: finalMessageType,
    ...(finalMediaUrl && { media_url: finalMediaUrl }),
    ...(finalCaption && { caption: finalCaption }),
    ...(finalFileName && { file_name: finalFileName }),
    external_id: messageExternalId,
    sent_at: sentAt,
  });
  await Promise.all([
    invalidateConversationList(companyId),
    invalidateConversationDetail(conversationId),
  ]);
  return true;
}
