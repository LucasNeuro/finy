import { createServiceRoleClient } from "@/lib/supabase/admin";
import { isQueueOpen, type BusinessHoursItem, type SpecialDateItem } from "@/lib/queue-hours";
import {
  normalizeWhatsAppJid,
  phoneDigitsOnly,
  toCanonicalPhone,
  toCanonicalJid,
} from "@/lib/phone-canonical";
import { getRedisClient } from "@/lib/redis/client";
import { invalidateConversationDetail, invalidateConversationList } from "@/lib/redis/inbox-state";
import { NextResponse } from "next/server";

/**
 * Remove contatos duplicados do mesmo número (JID em outro formato).
 * Ex.: sync gravou 4184727733@s.whatsapp.net e o webhook usa 554184727733@s.whatsapp.net —
 * ficamos só com o canônico e evitamos dois cards "Vô Dos Meninos".
 */
async function mergeDuplicateContacts(
  supabase: ReturnType<typeof createServiceRoleClient>,
  channelId: string,
  companyId: string,
  canonicalDigits: string,
  canonicalExternalId: string
): Promise<void> {
  if (!canonicalDigits || !canonicalExternalId) return;
  const { data: rows } = await supabase
    .from("channel_contacts")
    .select("id, jid")
    .eq("channel_id", channelId)
    .eq("company_id", companyId);
  for (const row of rows ?? []) {
    const jid = (row as { jid?: string }).jid ?? "";
    const digits = jid.replace(/\D/g, "").replace(/@.*$/, "").trim();
    const rowCanonical = toCanonicalPhone(digits, false);
    if (rowCanonical === canonicalDigits && jid !== canonicalExternalId) {
      await supabase.from("channel_contacts").delete().eq("id", (row as { id: string }).id);
    }
  }
}

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
 * Só roda se ENABLE_SYNC_HISTORY_ON_CONNECT=true (por padrão desligado: fluxo é só fila por chamado;
 * histórico/contatos antigos entram apenas quando o usuário clicar em Sincronizar).
 */
function triggerSyncHistoryForInstance(instanceId: string): void {
  if (process.env.ENABLE_SYNC_HISTORY_ON_CONNECT !== "true") return;

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
      // ignorar erros; sync pode ser refeito manualmente na tela de Conexões
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
 * - connection / connected / onconnection → 200 (não dispara mais sync automático; histórico só ao clicar em Sincronizar).
 * - history           → processamos só para conversas que JÁ EXISTEM (não criamos conversa nem contato; evita encher Novos/Contatos ao conectar). Novas conversas/contatos só quando chega evento "messages".
 *
 * Manter "wasSentByApi" excluído no painel para não entrar em loop.
 */
export async function POST(request: Request) {
  try {
    const body = (await request.json()) as WebhookPayload & Record<string, unknown>;
    
    // Tentar extrair instance ID de diferentes lugares
    // Formato 1: { instance: "...", event: "...", data: {...} }
    // Formato 2: { instanceId: "...", ... }
    // Formato 3: { instanceName: "...", EventType: "messages", chat, message } (UAZAPI/Go)
    // Formato 4: Headers ou query params
    let instanceId = body?.instance as string | undefined;
    if (!instanceId) {
      instanceId = (body as { instanceId?: string }).instanceId;
    }
    if (!instanceId) {
      instanceId = (body as { Instance?: string }).Instance;
    }
    if (!instanceId && typeof (body as { instanceName?: string }).instanceName === "string") {
      instanceId = (body as { instanceName: string }).instanceName.trim();
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
    const eventTypeFromBody = (body as { EventType?: string }).EventType;
    let data = (body?.data ?? {}) as WebhookPayload["data"];
    const bodyChat = (body as { chat?: Record<string, unknown> }).chat;
    const bodyMessage = (body as { message?: Record<string, unknown> }).message;
    const bodyChatSource = (body as { chatSource?: string }).chatSource;
    // Payload no formato { EventType: "messages", chat, message } sem body.data: montar um item a partir de chat + message
    if ((!data || Object.keys(data).length === 0) && bodyChat && bodyMessage && typeof bodyMessage === "object") {
      const fromRaw = (bodyMessage as { from?: string }).from ?? (bodyMessage as { number?: string }).number ?? "";
      const from = normalizeWhatsAppJid(fromRaw);
      const chatIdRaw =
        (typeof bodyChatSource === "string" && bodyChatSource.trim()) ||
        (typeof (bodyChat as { wa_chatid?: string }).wa_chatid === "string" && (bodyChat as { wa_chatid: string }).wa_chatid) ||
        (typeof (bodyChat as { id?: string }).id === "string" && (bodyChat as { id: string }).id?.includes("@") && normalizeWhatsAppJid((bodyChat as { id: string }).id)) ||
        "";
      const chatId = chatIdRaw || (from || (fromRaw ? `${phoneDigitsOnly(fromRaw)}@s.whatsapp.net` : ""));
      const pushName = (bodyMessage as { pushName?: string }).pushName ?? (bodyChat as { name?: string }).name ?? (bodyChat as { wa_contactName?: string }).wa_contactName ?? "";
      const msgObj = bodyMessage as Record<string, unknown>;
      const inferredMsgType = msgObj.audio ? "audio" : msgObj.ptt ? "ptt" : msgObj.image ? "image" : msgObj.video ? "video" : msgObj.document ? "document" : msgObj.sticker ? "sticker" : "";
      data = {
        ...msgObj,
        chatId: chatId || from,
        chatid: chatId || from,
        from: from || (bodyMessage as { sender?: string }).sender,
        number: from,
        pushName: pushName || undefined,
        text: (bodyMessage as { text?: string }).text ?? (bodyMessage as { body?: string }).body ?? (bodyMessage as { content?: string }).content,
        body: (bodyMessage as { body?: string }).body ?? (bodyMessage as { text?: string }).text,
        fromMe: (bodyMessage as { fromMe?: boolean }).fromMe === true,
        isGroup: (bodyChat as { wa_isGroup?: boolean })?.wa_isGroup === true || (typeof chatId === "string" && chatId.endsWith("@g.us")),
        timestamp: (bodyMessage as { timestamp?: number }).timestamp ?? (bodyMessage as { sent_at?: number }).sent_at,
        type: (bodyMessage as { type?: string }).type ?? inferredMsgType,
        chatImagePreview: (bodyChat as { imagePreview?: string }).imagePreview ?? (bodyChat as { image?: string }).image ?? "",
        chatImage: (bodyChat as { image?: string }).image ?? (bodyChat as { imagePreview?: string }).imagePreview ?? "",
      } as WebhookPayload["data"];
    }

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
        // Tentar identificar canal pelo chatId/JID (fallback para webhook global)
        const msg = (body as { message?: { from?: string; number?: string } }).message;
        const chatId = (body as { Chat?: string; chatid?: string; chatId?: string }).Chat ||
                       (body as { chatid?: string }).chatid ||
                       (body as { chatId?: string }).chatId ||
                       (typeof (body as { chatSource?: string }).chatSource === "string" && (body as { chatSource: string }).chatSource.trim()) ||
                       (bodyChat && typeof (bodyChat as { wa_chatid?: string }).wa_chatid === "string" && (bodyChat as { wa_chatid: string }).wa_chatid) ||
                       (bodyChat && typeof (bodyChat as { id?: string }).id === "string" && (bodyChat as { id: string }).id?.includes("@") && (bodyChat as { id: string }).id) ||
                       (msg && typeof msg.from === "string" && (msg.from.includes("@") ? msg.from : `${String(msg.from).replace(/\D/g, "")}@s.whatsapp.net`)) ||
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

    const eventName = (typeof eventTypeFromBody === "string" ? eventTypeFromBody : undefined) ?? (typeof event === "string" ? event : undefined);
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
       data?.mediaUrl != null || data?.file != null || (data?.type && data?.type !== "conversation") ||
       (data && typeof (data as Record<string, unknown>).audio === "object") ||
       (data && typeof (data as Record<string, unknown>).ptt === "object") ||
       (data && typeof (data as Record<string, unknown>).image === "object") ||
       (data && typeof (data as Record<string, unknown>).video === "object") ||
       (data && typeof (data as Record<string, unknown>).document === "object"));
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
      const ok = await processOneMessage(instanceId, item ?? {}, isHistory, isHistory);
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
  allowFromMe: boolean,
  isHistoryEvent: boolean
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

  let externalId = (data.chatId ?? data.chatid ?? "") as string;
  let customerPhone = (data.from ?? data.number ?? data.wa_id ?? "") as string;
  externalId = normalizeWhatsAppJid(externalId);
  customerPhone = normalizeWhatsAppJid(customerPhone);
  // Para ticket: preferir sender_pn (PN resolvido) para evitar duplicata LID vs PN (ex.: mesmo contato 554184727733 vs 104570038571120@lid)
  const senderPn = (data as { sender_pn?: string }).sender_pn?.trim();
  if (senderPn && senderPn.endsWith("@s.whatsapp.net")) {
    externalId = senderPn;
    customerPhone = senderPn;
  }
  if (!externalId && customerPhone) externalId = customerPhone;
  if (!customerPhone && externalId) customerPhone = externalId;
  const invalidExternalIds = ["updated", "undefined", ""];
  const externalIdInvalid = invalidExternalIds.includes(externalId) || !externalId || externalId.length < 5;
  if (externalIdInvalid && customerPhone && (customerPhone.endsWith("@s.whatsapp.net") || customerPhone.endsWith("@g.us"))) {
    externalId = customerPhone;
  } else if (invalidExternalIds.includes(externalId) || !externalId || externalId.length < 5) {
    console.warn("[WEBHOOK] processOneMessage: externalId inválido ignorado", { rawChatId: (data.chatId ?? data.chatid) as string, rawFrom: (data.from ?? data.number) as string });
    return true;
  }
  const rawType = (data.type ?? data.mediaType ?? data.messageType ?? "") as string;
  const dataObj = data as Record<string, unknown>;
  const nestedMedia =
    (typeof dataObj.audio === "object" && dataObj.audio && ((dataObj.audio as { url?: string }).url ?? (dataObj.audio as { base64?: string }).base64)) ||
    (typeof dataObj.ptt === "object" && dataObj.ptt && ((dataObj.ptt as { url?: string }).url ?? (dataObj.ptt as { base64?: string }).base64)) ||
    (typeof dataObj.image === "object" && dataObj.image && ((dataObj.image as { url?: string }).url ?? (dataObj.image as { base64?: string }).base64)) ||
    (typeof dataObj.video === "object" && dataObj.video && ((dataObj.video as { url?: string }).url ?? (dataObj.video as { base64?: string }).base64)) ||
    (typeof dataObj.document === "object" && dataObj.document && ((dataObj.document as { url?: string }).url ?? (dataObj.document as { base64?: string }).base64)) ||
    (typeof dataObj.sticker === "object" && dataObj.sticker && ((dataObj.sticker as { url?: string }).url ?? (dataObj.sticker as { base64?: string }).base64));
  const mediaUrl = (
    data.mediaUrl ?? data.file ?? data.url ?? data.image ?? data.base64 ??
    (typeof nestedMedia === "string" ? nestedMedia : null) ??
    (data as { media?: { url?: string } }).media?.url ?? ""
  ) as string;
  const inferredType = !rawType && nestedMedia
    ? (dataObj.audio ? "audio" : dataObj.ptt ? "ptt" : dataObj.image ? "image" : dataObj.video ? "video" : dataObj.document ? "document" : dataObj.sticker ? "sticker" : "")
    : rawType;
  const caption = (data.caption ?? data.text ?? data.body ?? data.content ?? "") as string;
  const textContent = (data.text ?? data.body ?? data.content ?? "") as string;
  const content = textContent || caption || (inferredType && mediaUrl ? `[${inferredType}]` : "") || (inferredType ? `[${inferredType}]` : "");
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
    document: "document", sticker: "sticker", media: "document",
  };
  const effectiveType = inferredType || rawType;
  const messageType = effectiveType ? (mediaTypeMap[String(effectiveType).toLowerCase()] ?? "text") : "text";
  const isMedia = messageType !== "text" && (mediaUrl || content === `[${effectiveType}]`);
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
      let chList: unknown[] | null = null;
      let err: Error | null = null;
      const { data: chListByInstance, error: errByInstance } = await supabase
        .from("channels")
        .select("id, company_id, queue_id")
        .eq("uazapi_instance_id", instanceId)
        .eq("is_active", true)
        .limit(1);
      chList = Array.isArray(chListByInstance) ? chListByInstance : null;
      err = errByInstance ?? null;
      if ((!chList || chList.length === 0) && !err) {
        const { data: chListByName, error: errByName } = await supabase
          .from("channels")
          .select("id, company_id, queue_id")
          .eq("name", instanceId)
          .eq("is_active", true)
          .limit(1);
        if (Array.isArray(chListByName) && chListByName.length > 0) {
          chList = chListByName;
          err = errByName ?? null;
          if (process.env.NODE_ENV !== "test") console.log("[WEBHOOK] Canal encontrado por nome (fallback):", instanceId);
        }
      }
      const chData = Array.isArray(chList) && chList.length > 0 ? chList[0] : null;
      if (err || !chData) {
        console.error("[WEBHOOK] Canal não encontrado:", { instanceId, error: err?.message, chData: chList });
        return true;
      }

      console.log("[WEBHOOK] Canal encontrado:", { channelId: (chData as { id: string }).id, companyId: (chData as { company_id: string }).company_id, queueId: (chData as { queue_id?: string }).queue_id });

      channel = {
        id: (chData as { id: string }).id,
        company_id: (chData as { company_id: string }).company_id,
        queue_id: ((chData as { queue_id?: string }).queue_id as string | null) ?? null,
      };

      if (redis) {
        await redis.set(cacheKey, JSON.stringify(channel), { EX: 300 }).catch(() => {});
      }
    }

    const companyId = channel.company_id;
    const channelId = channel.id;

    // Evento de reação: atualizar a mensagem alvo e não inserir nova mensagem
    const reactionPayload = dataObj.reaction && typeof dataObj.reaction === "object" ? (dataObj.reaction as { id?: string; emoji?: string }) : null;
    const isReactionEvent = (rawType === "reaction" || reactionPayload?.id) && reactionPayload?.id;
    if (isReactionEvent && reactionPayload) {
      const canonicalExtId = toCanonicalJid(externalId, isGroup) || externalId;
      const { data: conv } = await supabase
        .from("conversations")
        .select("id")
        .eq("channel_id", channelId)
        .eq("company_id", companyId)
        .eq("external_id", canonicalExtId)
        .eq("kind", isGroup ? "group" : "ticket")
        .maybeSingle();
      if (conv?.id) {
        const { data: msg } = await supabase
          .from("messages")
          .select("id")
          .eq("conversation_id", (conv as { id: string }).id)
          .eq("external_id", reactionPayload.id)
          .maybeSingle();
        if (msg?.id) {
          await supabase
            .from("messages")
            .update({ reaction: reactionPayload.emoji ?? null })
            .eq("id", (msg as { id: string }).id);
          await invalidateConversationDetail((conv as { id: string }).id);
          await invalidateConversationList(companyId);
        }
      }
      return true;
    }

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

      const { data: existing } = await supabase
        .from("conversations")
        .select("id")
        .eq("channel_id", channelId)
        .eq("external_id", externalId)
        .eq("kind", "group")
        .single();

      if (isHistoryEvent && !existing) {
        return true;
      }

      if (existing && messageExternalId) {
        const { data: existingMsg } = await supabase
          .from("messages")
          .select("id")
          .eq("conversation_id", existing.id)
          .eq("external_id", messageExternalId)
          .limit(1)
          .maybeSingle();
        if (existingMsg) {
          return true;
        }
      }

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

      const { data: insertedGroupMsg, error: groupMsgErr } = await supabase
        .from("messages")
        .insert({
          conversation_id: conversationId,
          direction: fromMe ? "out" : "in",
          content: finalContent,
          message_type: finalMessageType,
          ...(finalMediaUrl && { media_url: finalMediaUrl }),
          ...(finalCaption && { caption: finalCaption }),
          ...(finalFileName && { file_name: finalFileName }),
          external_id: messageExternalId,
          sent_at: sentAt,
        })
        .select("id, direction, content, external_id, sent_at, created_at, message_type, media_url, caption, file_name")
        .single();
      if (!groupMsgErr && insertedGroupMsg) {
        const { data: gConv } = await supabase.from("conversations").select("messages_snapshot").eq("id", conversationId).single();
        const gPrev = Array.isArray((gConv as { messages_snapshot?: unknown } | null)?.messages_snapshot) ? (gConv as { messages_snapshot: unknown[] }).messages_snapshot : [];
        const gNew = [...gPrev, insertedGroupMsg].slice(-1000);
        await supabase.from("conversations").update({ messages_snapshot: gNew, updated_at: new Date().toISOString() }).eq("id", conversationId);
      }
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

    const digitsForCanonical = phoneDigitsOnly(externalId) || phoneDigitsOnly(customerPhone);
    const canonicalExternalId = toCanonicalJid(externalId, isGroup) || externalId;
    const canonicalDigits = toCanonicalPhone(digitsForCanonical, isGroup) || phoneDigitsOnly(canonicalExternalId);

    let existingTicket: { id: string; status?: string } | null = null;
    const { data: byExternal } = await supabase
      .from("conversations")
      .select("id, status")
      .eq("channel_id", channelId)
      .eq("external_id", canonicalExternalId)
      .eq("kind", "ticket")
      .neq("status", "closed")
      .order("last_message_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (byExternal) existingTicket = byExternal;
    if (!existingTicket && canonicalDigits) {
      const { data: byPhone } = await supabase
        .from("conversations")
        .select("id, status")
        .eq("channel_id", channelId)
        .eq("company_id", companyId)
        .eq("customer_phone", canonicalDigits)
        .eq("kind", "ticket")
        .neq("status", "closed")
        .order("last_message_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (byPhone) existingTicket = byPhone;
      // Mesmo contato pode estar gravado sem 55 (ex.: 4184727733) — evita duplicata na lista
      if (!existingTicket && canonicalDigits.length === 12 && canonicalDigits.startsWith("55")) {
        const without55 = canonicalDigits.slice(2);
        const { data: byPhoneAlt } = await supabase
          .from("conversations")
          .select("id, status")
          .eq("channel_id", channelId)
          .eq("company_id", companyId)
          .eq("customer_phone", without55)
          .eq("kind", "ticket")
          .neq("status", "closed")
          .order("last_message_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (byPhoneAlt) existingTicket = byPhoneAlt;
      }
    }
    // Só reutilizamos conversas abertas (closed já excluído no filtro acima); se não houver, criamos novo chamado.

    if (isHistoryEvent && !existingTicket) {
      return true;
    }

    const displayPhone = canonicalDigits || digitsForCanonical || phoneDigitsOnly(customerPhone);
    const contactAvatarUrl =
      ((data as { chatImagePreview?: string }).chatImagePreview?.trim() ||
        (data as { chatImage?: string }).chatImage?.trim() ||
        null) || null;

    let conversationId: string;
    if (existingTicket) {
      conversationId = existingTicket.id;
      if (messageExternalId) {
        const { data: existingMsg } = await supabase
          .from("messages")
          .select("id")
          .eq("conversation_id", conversationId)
          .eq("external_id", messageExternalId)
          .limit(1)
          .maybeSingle();
        if (existingMsg) {
          return true;
        }
      }
      await supabase
        .from("conversations")
        .update({
          last_message_at: sentAt,
          updated_at: new Date().toISOString(),
          wa_chat_jid: canonicalExternalId,
          external_id: canonicalExternalId,
          customer_phone: (canonicalDigits ?? displayPhone) || undefined,
          ...(customerName && customerName.trim() && { customer_name: customerName.trim() }),
        })
        .eq("id", conversationId);
      console.log("[WEBHOOK] Conversa existente atualizada:", { conversationId });
      if (externalId !== canonicalExternalId) {
        await supabase.from("channel_contacts").delete().eq("channel_id", channelId).eq("jid", externalId);
      }
      await mergeDuplicateContacts(supabase, channelId, companyId, canonicalDigits ?? "", canonicalExternalId);
      await supabase.from("channel_contacts").upsert(
        {
          channel_id: channelId,
          company_id: companyId,
          jid: canonicalExternalId,
          phone: displayPhone || null,
          contact_name: customerName || null,
          first_name: (customerName || (data as { pushName?: string }).pushName) || null,
          ...(contactAvatarUrl && { avatar_url: contactAvatarUrl }),
        },
        { onConflict: "channel_id,jid", ignoreDuplicates: false }
      );
    } else {
      // Nova conversa: fica em "Novos" (não atribuir). Só vai para fila/Meus quando o atendente clicar para pegar.
      const assignedTo: string | null = null;

      const { data: inserted, error: insertConvError } = await supabase
        .from("conversations")
        .insert({
          company_id: companyId,
          channel_id: channelId,
          external_id: canonicalExternalId,
          wa_chat_jid: canonicalExternalId,
          kind: "ticket",
          is_group: false,
          customer_phone: displayPhone,
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
      console.log("[WEBHOOK] Conversa criada (Novos):", { conversationId, queueId });
      if (externalId !== canonicalExternalId) {
        await supabase.from("channel_contacts").delete().eq("channel_id", channelId).eq("jid", externalId);
      }
      await mergeDuplicateContacts(supabase, channelId, companyId, canonicalDigits ?? "", canonicalExternalId);
      await supabase.from("channel_contacts").upsert(
        {
          channel_id: channelId,
          company_id: companyId,
          jid: canonicalExternalId,
          phone: displayPhone || null,
          contact_name: customerName || null,
          first_name: (customerName || (data as { pushName?: string }).pushName) || null,
          ...(contactAvatarUrl && { avatar_url: contactAvatarUrl }),
        },
        { onConflict: "channel_id,jid", ignoreDuplicates: false }
      );
      console.log("[WEBHOOK] Contato criado/atualizado:", { jid: canonicalExternalId, phone: displayPhone, name: customerName });
    }

    const { data: insertedMsg, error: msgError } = await supabase
      .from("messages")
      .insert({
        conversation_id: conversationId,
        direction: fromMe ? "out" : "in",
        content: finalContent,
        message_type: finalMessageType,
        ...(finalMediaUrl && { media_url: finalMediaUrl }),
        ...(finalCaption && { caption: finalCaption }),
        ...(finalFileName && { file_name: finalFileName }),
        external_id: messageExternalId,
        sent_at: sentAt,
      })
      .select("id, direction, content, external_id, sent_at, created_at, message_type, media_url, caption, file_name")
      .single();

    if (msgError || !insertedMsg) {
      console.error("[WEBHOOK] Erro ao inserir mensagem:", msgError);
      return false;
    }

    const SNAPSHOT_MAX = 1000;
    const { data: convRow } = await supabase
      .from("conversations")
      .select("messages_snapshot")
      .eq("id", conversationId)
      .single();
    const prevSnapshot = Array.isArray((convRow as { messages_snapshot?: unknown } | null)?.messages_snapshot)
      ? ((convRow as { messages_snapshot: unknown[] }).messages_snapshot)
      : [];
    const hasDuplicate = prevSnapshot.some((m: unknown) => {
      const row = m as { id?: string; external_id?: string };
      return (insertedMsg.id && row.id === insertedMsg.id) || (messageExternalId && row.external_id === messageExternalId);
    });
    const newSnapshot = hasDuplicate ? prevSnapshot : [...prevSnapshot, insertedMsg].slice(-SNAPSHOT_MAX);
    await supabase
      .from("conversations")
      .update({ messages_snapshot: newSnapshot, updated_at: new Date().toISOString() })
      .eq("id", conversationId);

    console.log("[WEBHOOK] Mensagem inserida com sucesso:", { conversationId, direction: fromMe ? "out" : "in" });

    await Promise.all([
      invalidateConversationList(companyId),
      invalidateConversationDetail(conversationId),
    ]);
    console.log("[WEBHOOK] Cache invalidado, processamento concluído");
    return true;
}
