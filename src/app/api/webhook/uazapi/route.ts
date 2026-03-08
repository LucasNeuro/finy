import { createServiceRoleClient } from "@/lib/supabase/admin";
import { isQueueOpen, type BusinessHoursItem, type SpecialDateItem } from "@/lib/queue-hours";
import { getRedisClient } from "@/lib/redis/client";
import { invalidateConversationDetail, invalidateConversationList } from "@/lib/redis/inbox-state";
import { getNextAgentForQueue } from "@/lib/queue/round-robin";
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
    const body = (await request.json()) as WebhookPayload & Record<string, unknown>;
    
    // Tentar extrair instance ID de diferentes lugares
    // Formato 1: { instance: "...", event: "...", data: {...} }
    // Formato 2: { instanceId: "...", ... }
    // Formato 3: Headers ou query params
    let instanceId = body?.instance as string | undefined;
    if (!instanceId) {
      instanceId = (body as { instanceId?: string }).instanceId;
    }
    if (!instanceId) {
      instanceId = (body as { Instance?: string }).Instance;
    }
    
    // Tentar extrair de headers ou query params
    if (!instanceId) {
      const url = new URL(request.url);
      instanceId = url.searchParams.get("instance") || undefined;
    }
    if (!instanceId) {
      const headers = request.headers;
      instanceId = headers.get("x-instance-id") || headers.get("instance") || undefined;
    }
    
    const event = body?.event as string | Record<string, unknown> | undefined;
    const data = (body?.data ?? {}) as WebhookPayload["data"];

    // UAZAPI pode enviar event como objeto (ex.: { Type: 'Delivered', Chat: '...' }) sem enviar instance.
    // Detectar tipo do evento tanto no topo quanto dentro de body.event
    const eventObj = typeof event === "object" && event !== null ? event : undefined;
    const eventTypeFromObj = eventObj && typeof eventObj === "object"
      ? (eventObj as { Type?: string; type?: string }).Type ?? (eventObj as { type?: string }).type
      : undefined;
    const eventTypeTop = (body as { Type?: string; type?: string }).Type ?? (body as { type?: string }).type;
    const eventType = eventTypeTop ?? eventTypeFromObj;

    // Se não tem instance, tratar primeiro eventos de status (não precisam de instance)
    if (!instanceId) {
      if (eventType === "Delivered" || eventType === "Read" || eventType === "Sent") {
        console.log("[WEBHOOK] Evento de status ignorado:", eventType);
        return NextResponse.json({ ok: true });
      }
    }

    // Log completo do payload para debug
    console.log("[WEBHOOK] Recebido:", { 
      event: typeof event === "string" ? event : eventType ?? "object", 
      instanceId, 
      hasData: !!data,
      bodyKeys: Object.keys(body),
      payloadPreview: JSON.stringify(body).slice(0, 800)
    });

    // Se ainda não tem instance ID, tentar outras fontes
    if (!instanceId) {
      // Tentar buscar instance dentro do payload (pode estar em diferentes lugares)
      const possibleInstance = (body as Record<string, unknown>).instanceId || 
                               (body as Record<string, unknown>).InstanceId ||
                               (body as Record<string, unknown>).instance ||
                               (body as Record<string, unknown>).Instance;
      
      if (possibleInstance && typeof possibleInstance === "string") {
        instanceId = possibleInstance;
        console.log("[WEBHOOK] Instance encontrado dentro do payload:", instanceId);
      } else {
        // Tentar identificar canal pelo chatId (fallback para webhook global)
        const chatId = (body as { Chat?: string; chatid?: string; chatId?: string }).Chat ||
                       (body as { chatid?: string }).chatid ||
                       (body as { chatId?: string }).chatId ||
                       (eventObj && typeof eventObj === "object" && "Chat" in eventObj && (eventObj as { Chat?: string }).Chat) ||
                       (eventObj && typeof eventObj === "object" && "chatid" in eventObj && (eventObj as { chatid?: string }).chatid);
        
        if (chatId) {
          console.log("[WEBHOOK] Tentando identificar canal por chatId:", chatId);
          const supabase = createServiceRoleClient();
          const { data: convData } = await supabase
            .from("conversations")
            .select("channel_id, channels!inner(uazapi_instance_id)")
            .eq("external_id", chatId)
            .limit(1)
            .single();
          
          if (convData) {
            const channelsData = convData as unknown as { channels?: { uazapi_instance_id?: string } | Array<{ uazapi_instance_id?: string }> };
            const channels = Array.isArray(channelsData.channels) ? channelsData.channels[0] : channelsData.channels;
            if (channels && typeof channels === "object" && "uazapi_instance_id" in channels && channels.uazapi_instance_id) {
              instanceId = channels.uazapi_instance_id;
              console.log("[WEBHOOK] Instance identificado via chatId:", instanceId);
            }
          }
        }
        
        if (!instanceId) {
          console.error("[WEBHOOK] ERRO: Missing instance - payload:", JSON.stringify(body).slice(0, 1000));
          return NextResponse.json(
            { error: "Missing instance" },
            { status: 400 }
          );
        }
      }
    }

    const eventName = typeof event === "string" ? event : undefined;
    const isHistory = eventName === "history";
    const isMessageEvent =
      eventName === "messages" ||
      eventName === "message" ||
      eventName === "onmessage" ||
      eventName === "message.update" ||
      eventName === "message_create" ||
      eventName === "message.create";
    const hasMessageLikeData =
      (data?.chatId || data?.chatid) &&
      (data?.text != null || data?.body != null || data?.content != null || data?.caption != null ||
       data?.mediaUrl != null || data?.file != null || (data?.type && data?.type !== "conversation"));
    const treatAsMessage = isMessageEvent || isHistory || (!eventName && hasMessageLikeData);

    if (!treatAsMessage) {
      console.log("[WEBHOOK] Não é mensagem, evento:", eventName ?? eventType ?? "object", "payload:", JSON.stringify(body).slice(0, 500));
      if (eventName === "connection" || eventName === "connected" || eventName === "onconnection") {
        triggerSyncHistoryForInstance(instanceId);
      }
      return NextResponse.json({ ok: true });
    }

    console.log("[WEBHOOK] Processando mensagem(s)");

    const items: WebhookPayload["data"][] =
      isHistory && Array.isArray(body.data)
        ? (body.data as WebhookPayload["data"][])
        : Array.isArray((body as { messages?: unknown }).messages)
          ? ((body as { messages: WebhookPayload["data"][] }).messages)
          : [data];

    const MAX_ITEMS_PER_REQUEST = 80;
    const toProcess = items.slice(0, MAX_ITEMS_PER_REQUEST);

    console.log("[WEBHOOK] Itens para processar:", toProcess.length);

    for (const item of toProcess) {
      const ok = await processOneMessage(instanceId, item ?? {}, isHistory);
      if (!ok) {
        console.warn("[WEBHOOK] processOneMessage retornou false, parando processamento");
        break;
      }
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[WEBHOOK] ERRO ao processar:", error);
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
  if (!data) {
    console.warn("[WEBHOOK] processOneMessage: sem data");
    return true;
  }

  const fromMe = data.fromMe === true;
  if (fromMe && !allowFromMe) {
    console.log("[WEBHOOK] processOneMessage: mensagem fromMe ignorada");
    return true;
  }

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

  console.log("[WEBHOOK] processOneMessage:", { 
    instanceId, 
    externalId, 
    customerPhone, 
    hasContent: !!content, 
    hasMediaUrl: !!mediaUrl,
    content: content?.slice(0, 50) 
  });

  if (!externalId || (!content && !mediaUrl)) {
    console.warn("[WEBHOOK] processOneMessage: sem externalId ou conteúdo", { externalId, hasContent: !!content, hasMediaUrl: !!mediaUrl });
    return true;
  }

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

      if (error || !chData) {
        console.error("[WEBHOOK] Canal não encontrado:", { instanceId, error: error?.message, chData });
        return true;
      }

      console.log("[WEBHOOK] Canal encontrado:", { channelId: chData.id, companyId: chData.company_id, queueId: chData.queue_id });

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
    if (cqList.length === 0 && !channel.queue_id) {
      console.error("[WEBHOOK] Sem filas configuradas:", { channelId, queueId: channel.queue_id, cqListLength: cqList.length });
      return true;
    }

    console.log("[WEBHOOK] Filas encontradas:", { channelId, queueId: channel.queue_id, cqListLength: cqList.length });

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
      console.log("[WEBHOOK] Conversa existente atualizada:", { conversationId });
    } else {
      // Distribuição automática round-robin por fila (Redis + Supabase)
      let assignedTo: string | null = null;
      if (queueId) {
        assignedTo = await getNextAgentForQueue(companyId, queueId);
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

      if (insertConvError || !inserted) {
        console.error("[WEBHOOK] Erro ao criar conversa:", { insertConvError, inserted });
        return false;
      }
      conversationId = inserted.id;
      console.log("[WEBHOOK] Conversa criada:", { conversationId, queueId, assignedTo });
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
      console.log("[WEBHOOK] Contato criado/atualizado:", { jid: externalId, phone: customerPhone, name: customerName });
    }

    const { error: msgError } = await supabase.from("messages").insert({
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

    if (msgError) {
      console.error("[WEBHOOK] Erro ao inserir mensagem:", msgError);
      return false;
    }

    console.log("[WEBHOOK] Mensagem inserida com sucesso:", { conversationId, direction: fromMe ? "out" : "in" });

    await Promise.all([
      invalidateConversationList(companyId),
      invalidateConversationDetail(conversationId),
    ]);
    console.log("[WEBHOOK] Cache invalidado, processamento concluído");
    return true;
}
