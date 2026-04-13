import { getCompanyIdFromRequest } from "@/lib/auth/get-company";
import { requirePermission } from "@/lib/auth/get-profile";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { withMetricsHeaders } from "@/lib/api/metrics";
import { sendAutoConsentIfNeeded } from "@/lib/consent/auto-consent";
import {
  getCachedConversationDetail,
  invalidateConversationList,
  setCachedConversationDetail,
  invalidateConversationDetail,
} from "@/lib/redis/inbox-state";
import { getCachedMediaUrlsBulk } from "@/lib/redis/media-cache";
import { toCanonicalDigits } from "@/lib/phone-canonical";
import { isCommercialQueue } from "@/lib/queue/commercial";
import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { getChannelToken } from "@/lib/uazapi/channel-token";
import { getChatDetails, extractContactNameFromDetails } from "@/lib/uazapi/client";
import { NextResponse } from "next/server";

const VIDEO_EXT = /\.(mp4|webm|mov|avi|mkv|m4v|3gp)(\?|$)/i;
const AUDIO_EXT = /\.(mp3|ogg|m4a|wav|opus|aac|oga|weba)(\?|$)/i;
/** Janela inicial no chat — alinhar melhor ao que o usuário vê no WhatsApp (antes 50 cortava o fio). */
const INITIAL_MESSAGES_LIMIT = 80;

const MESSAGES_LIST_SELECT =
  "id, direction, content, external_id, sent_at, created_at, message_type, media_url, caption, file_name, reaction";

/** Fonte de verdade: tabela `messages` (não usar só messages_snapshot — fica desatualizado vs webhook/import). */
async function fetchRecentMessagesFromDb(
  conversationId: string,
  limit: number,
  supabase: Awaited<ReturnType<typeof createClient>>
): Promise<unknown[]> {
  if (process.env.SUPABASE_SERVICE_ROLE_KEY) {
    try {
      const admin = createServiceRoleClient();
      const res = await admin
        .from("messages")
        .select(MESSAGES_LIST_SELECT)
        .eq("conversation_id", conversationId)
        .order("sent_at", { ascending: false })
        .limit(limit);
      if (!res.error && res.data && res.data.length > 0) {
        return [...res.data].reverse();
      }
    } catch {
      // fallback abaixo
    }
  }
  const res = await supabase
    .from("messages")
    .select(MESSAGES_LIST_SELECT)
    .eq("conversation_id", conversationId)
    .order("sent_at", { ascending: false })
    .limit(limit);
  if (res.error) return [];
  return Array.isArray(res.data) ? [...res.data].reverse() : [];
}

const MEDIA_MESSAGE_TYPES = ["image", "video", "audio", "ptt", "document", "sticker"] as const;

/** Enriquece mensagens com media_cached_url do Redis (evita chamadas /download no frontend). */
async function enrichMessagesWithCachedMedia(
  companyId: string,
  conversationId: string,
  messages: Record<string, unknown>[]
): Promise<Record<string, unknown>[]> {
  const mediaIds = messages
    .filter((m) => {
      const id = m?.id as string | undefined;
      const mt = String(m?.message_type ?? m?.messageType ?? "").toLowerCase();
      return id && !String(id).startsWith("temp-") && MEDIA_MESSAGE_TYPES.includes(mt as (typeof MEDIA_MESSAGE_TYPES)[number]);
    })
    .map((m) => m.id as string);
  if (mediaIds.length === 0) return messages;
  const urlMap = await getCachedMediaUrlsBulk(conversationId, mediaIds, companyId);
  if (Object.keys(urlMap).length === 0) return messages;
  return messages.map((m) => {
    const id = m?.id as string | undefined;
    const url = id ? urlMap[id] : null;
    return url ? { ...m, media_cached_url: url } : m;
  });
}

/** Normaliza message_type para exibir miniplayers: document → video/audio quando houver file_name, media_url ou content indicando. */
function normalizeMessageTypes(messages: unknown[]): Record<string, unknown>[] {
  const list = messages as Record<string, unknown>[];
  const out = list.map((m) => {
    const msg = { ...m };
    const currentType = String(msg.message_type ?? msg.messageType ?? "").trim().toLowerCase();
    if (currentType === "video" || currentType === "audio" || currentType === "ptt" || currentType === "ptv" || currentType === "myaudio") {
      return msg;
    }
    const fileName = String(msg.file_name ?? msg.fileName ?? "").toLowerCase();
    const mediaUrl = String(msg.media_url ?? msg.mediaUrl ?? "");
    if (fileName && VIDEO_EXT.test(fileName)) {
      msg.message_type = "video";
      return msg;
    }
    if (fileName && AUDIO_EXT.test(fileName)) {
      msg.message_type = "audio";
      return msg;
    }
    if (mediaUrl) {
      const prefix = mediaUrl.slice(0, 80);
      if (/data:video\//i.test(prefix) || (mediaUrl.length < 2000 && VIDEO_EXT.test(mediaUrl))) {
        msg.message_type = "video";
        return msg;
      }
      if (/data:audio\//i.test(prefix) || (mediaUrl.length < 2000 && AUDIO_EXT.test(mediaUrl))) {
        msg.message_type = "audio";
        return msg;
      }
    }
    const content = String(msg.content ?? msg.caption ?? "").trim();
    if (/^\[?(vídeo|video)\]?$/i.test(content)) {
      msg.message_type = "video";
      return msg;
    }
    if (/^\[?(áudio|audio|ptt)\]?$/i.test(content)) {
      msg.message_type = "audio";
      return msg;
    }
    return msg;
  });

  // Fallback: duas "document" seguidas do mesmo remetente no mesmo minuto → 1º vídeo, 2º áudio
  const sentAtMinute = (m: Record<string, unknown>) => String(m.sent_at ?? "").slice(0, 16);
  for (let i = 0; i < out.length - 1; i++) {
    const a = out[i];
    const b = out[i + 1];
    const typeA = String(a.message_type ?? a.messageType ?? "").toLowerCase();
    const typeB = String(b.message_type ?? b.messageType ?? "").toLowerCase();
    if (typeA !== "document" || typeB !== "document") continue;
    if (a.direction !== b.direction || sentAtMinute(a) !== sentAtMinute(b)) continue;
    a.message_type = "video";
    b.message_type = "audio";
  }
  return out;
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const startTime = performance.now();
  const companyId = await getCompanyIdFromRequest(request);
  if (!companyId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const readErr = await requirePermission(companyId, PERMISSIONS.inbox.read);
  if (readErr) {
    return NextResponse.json({ error: readErr.error }, { status: readErr.status });
  }
  const { id } = await params;
  const skipCache = new URL(request.url).searchParams.get("skip_cache") === "1" || new URL(request.url).searchParams.get("nocache") === "1";

  if (!skipCache) {
      const cached = await getCachedConversationDetail(companyId, id);
    if (cached) {
      const supabaseFresh = await createClient();
      let messages = (await fetchRecentMessagesFromDb(id, INITIAL_MESSAGES_LIMIT, supabaseFresh)) as Record<
        string,
        unknown
      >[];

      const notesClientCached = process.env.SUPABASE_SERVICE_ROLE_KEY ? createServiceRoleClient() : supabaseFresh;
      const { data: notesCached } = await notesClientCached
        .from("internal_notes")
        .select("id, content, created_at, author_id")
        .eq("conversation_id", id)
        .order("created_at", { ascending: false })
        .limit(INITIAL_MESSAGES_LIMIT);
      if (notesCached && notesCached.length > 0) {
        const formattedNotes = notesCached.map(
          (n: { id: string; content: string; created_at: string; author_id: string }) => ({
            id: n.id,
            direction: "out",
            content: n.content,
            sent_at: n.created_at,
            message_type: "internal_note",
            created_at: n.created_at,
          })
        );
        messages = [...messages, ...formattedNotes].sort(
          (a, b) =>
            new Date(String((a as { sent_at?: string }).sent_at ?? 0)).getTime() -
            new Date(String((b as { sent_at?: string }).sent_at ?? 0)).getTime()
        ) as Record<string, unknown>[];
      }

      const seenIdsC = new Set<string>();
      const seenExternalC = new Set<string>();
      const seenContentKeyC = new Set<string>();
      messages = (messages as Record<string, unknown>[]).filter((m) => {
        const mid = m?.id as string | undefined;
        const ext = m?.external_id as string | undefined;
        if (mid && seenIdsC.has(mid)) return false;
        if (mid) seenIdsC.add(mid);
        if (ext && ext.trim()) {
          const key = `${String(ext)}|${m?.sent_at}|${m?.direction}`;
          if (seenExternalC.has(key)) return false;
          seenExternalC.add(key);
        }
        const sentAt = String(m?.sent_at ?? "");
        const contentKey = `${m?.direction}|${String(m?.content ?? m?.caption ?? "").trim().slice(0, 100)}|${sentAt.slice(0, 19)}`;
        if (seenContentKeyC.has(contentKey)) return false;
        seenContentKeyC.add(contentKey);
        return true;
      });

      messages = (messages as Record<string, unknown>[]).sort(
        (a, b) =>
          new Date(String(a.sent_at ?? 0)).getTime() - new Date(String(b.sent_at ?? 0)).getTime()
      );

      messages = normalizeMessageTypes(messages as unknown[]) as Record<string, unknown>[];
      messages = await enrichMessagesWithCachedMedia(companyId, id, messages);
      const slicedMessages = Array.isArray(messages)
        ? (messages as Record<string, unknown>[])
            .slice()
            .sort(
              (a, b) =>
                new Date(String(a.sent_at ?? 0)).getTime() - new Date(String(b.sent_at ?? 0)).getTime()
            )
            .slice(-INITIAL_MESSAGES_LIMIT)
        : messages;
      const rawStatusCached = (cached.status ?? "open").toString().toLowerCase().trim();
      const effectiveStatusCached =
        rawStatusCached === "closed"
          ? "closed"
          : (cached.assigned_to != null && cached.assigned_to !== "")
            ? "in_progress"
            : rawStatusCached === "in_queue"
              ? "in_queue"
              : rawStatusCached === "waiting"
                ? "waiting"
                : "open";
      const supabaseCache = await createClient();
      const queueIdCached = (cached.queue_id as string | null) ?? null;
      let ticket_status_color_hex_cached: string | null = null;
      let ticket_status_name_cached: string | null = null;
      const { data: statusRowCache } = await supabaseCache
        .from("company_ticket_statuses")
        .select("name, color_hex")
        .eq("company_id", companyId)
        .eq("slug", effectiveStatusCached)
        .or(queueIdCached ? `queue_id.eq.${queueIdCached},queue_id.is.null` : "queue_id.is.null")
        .limit(1)
        .maybeSingle();
      if (statusRowCache) {
        const row = statusRowCache as { name?: string; color_hex?: string };
        if (row.color_hex) ticket_status_color_hex_cached = row.color_hex.trim() || null;
        if (row.name) ticket_status_name_cached = row.name.trim() || null;
      }
      if (!ticket_status_color_hex_cached || !ticket_status_name_cached) {
        const { data: fallbackRowCache } = await supabaseCache
          .from("company_ticket_statuses")
          .select("name, color_hex")
          .eq("company_id", companyId)
          .eq("slug", effectiveStatusCached)
          .limit(1)
          .maybeSingle();
        if (fallbackRowCache) {
          const row = fallbackRowCache as { name?: string; color_hex?: string };
          if (!ticket_status_color_hex_cached && row.color_hex) ticket_status_color_hex_cached = row.color_hex.trim() || null;
          if (!ticket_status_name_cached && row.name) ticket_status_name_cached = row.name.trim() || null;
        }
      }
      const res = NextResponse.json({
        ...cached,
        messages: slicedMessages,
        ticket_status_name: ticket_status_name_cached,
        ticket_status_color_hex: ticket_status_color_hex_cached,
        has_more_messages: await (async () => {
          const chatOnly = (slicedMessages as Record<string, unknown>[]).filter(
            (m) => String(m.message_type ?? "") !== "internal_note"
          );
          const sorted = [...chatOnly].sort(
            (a, b) =>
              new Date(String(a.sent_at ?? 0)).getTime() - new Date(String(b.sent_at ?? 0)).getTime()
          );
          const oldest = sorted.length > 0 ? String(sorted[0]?.sent_at ?? "").trim() : "";
          if (!oldest) {
            const client = process.env.SUPABASE_SERVICE_ROLE_KEY ? createServiceRoleClient() : supabaseFresh;
            const { count } = await client
              .from("messages")
              .select("id", { count: "exact", head: true })
              .eq("conversation_id", id);
            return (count ?? 0) > 0;
          }
          const client = process.env.SUPABASE_SERVICE_ROLE_KEY ? createServiceRoleClient() : supabaseFresh;
          const { count } = await client
            .from("messages")
            .select("id", { count: "exact", head: true })
            .eq("conversation_id", id)
            .lt("sent_at", oldest);
          return (count ?? 0) > 0;
        })(),
      });
      return withMetricsHeaders(res, { cacheHit: true, startTime, route: "/api/conversations/[id]", payload: { messages: Array.isArray(slicedMessages) ? slicedMessages.length : 0 } });
    }
  }

  const supabase = await createClient();
  const { data: conversation, error: convError } = await supabase
    .from("conversations")
    .select("id, channel_id, external_id, wa_chat_jid, kind, is_group, customer_phone, customer_name, queue_id, assigned_to, status, last_message_at, created_at, messages_snapshot")
    .eq("id", id)
    .eq("company_id", companyId)
    .single();
  if (convError || !conversation) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const { data: { user } } = await supabase.auth.getUser();
  const [seeAllErr, manageErr] = await Promise.all([
    requirePermission(companyId, PERMISSIONS.inbox.see_all),
    requirePermission(companyId, PERMISSIONS.inbox.manage_tickets),
  ]);
  const canBypassCommercial = seeAllErr === null || manageErr === null;
  if (user && !canBypassCommercial && conversation.queue_id) {
    const commercial = await isCommercialQueue(supabase, companyId, conversation.queue_id);
    if (commercial && conversation.assigned_to !== user.id) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
  }

  const [channelRes, queueRes, assigneeRes] = await Promise.all([
    conversation.channel_id
      ? supabase.from("channels").select("name").eq("id", conversation.channel_id).eq("company_id", companyId).single()
      : { data: null },
    conversation.queue_id
      ? supabase.from("queues").select("name").eq("id", conversation.queue_id).single()
      : { data: null },
    conversation.assigned_to
      ? supabase.from("profiles").select("full_name").eq("user_id", conversation.assigned_to).eq("company_id", companyId).single()
      : { data: null },
  ]);

  const channel_name = (channelRes.data as { name?: string } | null)?.name ?? null;
  const queue_name = (queueRes.data as { name?: string } | null)?.name ?? null;
  const assigned_to_name = (assigneeRes.data as { full_name?: string } | null)?.full_name ?? null;

  const rawStatus = (conversation.status ?? "open").toString().toLowerCase().trim();
  const effectiveStatus =
    rawStatus === "closed"
      ? "closed"
      : conversation.assigned_to
        ? "in_progress"
        : rawStatus === "in_queue"
          ? "in_queue"
          : rawStatus === "waiting"
            ? "waiting"
            : "open";
  let ticket_status_color_hex: string | null = null;
  let ticket_status_name: string | null = null;
  const queueId = conversation.queue_id ?? null;
  const slugForColor = effectiveStatus;
  const { data: statusRow } = await supabase
    .from("company_ticket_statuses")
    .select("name, color_hex")
    .eq("company_id", companyId)
    .eq("slug", slugForColor)
    .or(queueId ? `queue_id.eq.${queueId},queue_id.is.null` : "queue_id.is.null")
    .limit(1)
    .maybeSingle();
  if (statusRow) {
    const row = statusRow as { name?: string; color_hex?: string };
    if (row.color_hex) ticket_status_color_hex = row.color_hex.trim() || null;
    if (row.name) ticket_status_name = row.name.trim() || null;
  }
  if (!ticket_status_color_hex || !ticket_status_name) {
    const { data: fallbackRow } = await supabase
      .from("company_ticket_statuses")
      .select("name, color_hex")
      .eq("company_id", companyId)
      .eq("slug", slugForColor)
      .limit(1)
      .maybeSingle();
    if (fallbackRow) {
      const row = fallbackRow as { name?: string; color_hex?: string };
      if (!ticket_status_color_hex && row.color_hex) ticket_status_color_hex = row.color_hex.trim() || null;
      if (!ticket_status_name && row.name) ticket_status_name = row.name.trim() || null;
    }
  }

  const jid = conversation.wa_chat_jid || conversation.external_id || conversation.customer_phone || "";
  const jidNorm = jid && !jid.includes("@") ? `${jid.replace(/\D/g, "")}@s.whatsapp.net` : jid;
  const canonicalDigits = toCanonicalDigits(conversation.customer_phone || jid);
  const canonicalJid = canonicalDigits ? `${canonicalDigits}@s.whatsapp.net` : null;
  const jids = [...new Set([jid, jidNorm, canonicalJid, canonicalDigits].filter(Boolean))] as string[];
  let contact_avatar_url: string | null = null;
  let contact_name_from_cc: string | null = null;
  let contact_phone_from_cc: string | null = null;
  if (conversation.channel_id && jids.length > 0) {
    const { data: ccList } = await supabase
      .from("channel_contacts")
      .select("avatar_url, contact_name, first_name, phone")
      .eq("channel_id", conversation.channel_id)
      .eq("company_id", companyId)
      .in("jid", jids)
      .limit(1);
    const cc = Array.isArray(ccList) ? ccList[0] : null;
    const row = cc as { avatar_url?: string; contact_name?: string; first_name?: string; phone?: string } | null;
    contact_avatar_url = row?.avatar_url?.trim() ?? null;
    const name = row?.contact_name?.trim() || row?.first_name?.trim() || null;
    if (name) contact_name_from_cc = name;
    if (row?.phone?.trim()) contact_phone_from_cc = row.phone.trim();
  }

  // Se ainda não temos nome ou foto (nem na conversa nem em channel_contacts), buscar na UAZAPI e gravar
  const effectiveNameSoFar = contact_name_from_cc || (conversation.customer_name?.trim() || null);
  if ((!effectiveNameSoFar || !contact_avatar_url) && conversation.channel_id && jids.length > 0) {
    try {
      const resolved = await getChannelToken(conversation.channel_id, companyId);
      if (resolved) {
        const numberForApi = jidNorm || canonicalDigits || conversation.customer_phone || jid;
        const detailRes = await getChatDetails(resolved.token, numberForApi, { preview: true });
        const data = detailRes.data;
        const fetchedName = extractContactNameFromDetails(data);
        const fetchedImage =
          String(data?.imagePreview ?? data?.image ?? data?.picture ?? "")
            .trim() || null;

        if (fetchedName || fetchedImage) {
          if (fetchedName) contact_name_from_cc = fetchedName;
          if (fetchedImage) contact_avatar_url = fetchedImage;

          const updatePayload: any = {
            synced_at: new Date().toISOString(),
          };
          if (fetchedName) {
            updatePayload.contact_name = fetchedName;
            updatePayload.first_name = fetchedName;
          }
          if (fetchedImage) {
            updatePayload.avatar_url = fetchedImage;
          }

          await Promise.all(
            jids.map((jid) =>
              supabase
                .from("channel_contacts")
                .upsert(
                  {
                    channel_id: conversation.channel_id,
                    company_id: companyId,
                    jid,
                    ...(canonicalDigits ? { phone: canonicalDigits } : {}),
                    ...updatePayload,
                  },
                  { onConflict: "channel_id,jid" }
                )
            )
          );

          if (fetchedName) {
            await supabase
              .from("conversations")
              .update({ customer_name: fetchedName, updated_at: new Date().toISOString() })
              .eq("id", id)
              .eq("company_id", companyId);
          }
          
          await invalidateConversationList(companyId);
          await invalidateConversationDetail(id, companyId);
        }
      }
    } catch {
      // não bloquear a resposta se a UAZAPI falhar
    }
  }

  const MESSAGES_LIMIT = INITIAL_MESSAGES_LIMIT;
  let messages: unknown[] = await fetchRecentMessagesFromDb(id, MESSAGES_LIMIT, supabase);
  if (messages.length > 0) {
    const SNAPSHOT_MAX = 1000;
    const asc = [...messages].sort(
      (a, b) =>
        new Date(String((a as { sent_at?: string }).sent_at ?? 0)).getTime() -
        new Date(String((b as { sent_at?: string }).sent_at ?? 0)).getTime()
    );
    const toStore = asc.slice(-SNAPSHOT_MAX);
    await supabase.from("conversations").update({ messages_snapshot: toStore, updated_at: new Date().toISOString() }).eq("id", id).eq("company_id", companyId);
  }
  // Buscar internal_notes e mesclar
  const notesClient = process.env.SUPABASE_SERVICE_ROLE_KEY 
    ? createServiceRoleClient() 
    : supabase;

  const { data: notes } = await notesClient
    .from("internal_notes")
    .select("id, content, created_at, author_id")
    .eq("conversation_id", id)
    .order("created_at", { ascending: false })
    .limit(INITIAL_MESSAGES_LIMIT);

  if (notes && notes.length > 0) {
    const formattedNotes = notes.map((n) => ({
      id: n.id,
      direction: "out",
      content: n.content,
      sent_at: n.created_at,
      message_type: "internal_note",
      created_at: n.created_at,
    }));
    messages = [...messages, ...formattedNotes].sort((a: any, b: any) => 
      new Date(a.sent_at).getTime() - new Date(b.sent_at).getTime()
    );
  }

  // Remover duplicatas por id, por external_id e por (direction + conteúdo + mesmo segundo)
  const seenIds = new Set<string>();
  const seenExternal = new Set<string>();
  const seenContentKey = new Set<string>();
  messages = (messages as Record<string, unknown>[]).filter((m) => {
    const id = m?.id as string | undefined;
    const ext = m?.external_id as string | undefined;
    if (id && seenIds.has(id)) return false;
    if (id) seenIds.add(id);
    if (ext && ext.trim()) {
      const key = `${String(ext)}|${m?.sent_at}|${m?.direction}`;
      if (seenExternal.has(key)) return false;
      seenExternal.add(key);
    }
    const sentAt = String(m?.sent_at ?? "");
    const contentKey = `${m?.direction}|${String(m?.content ?? m?.caption ?? "").trim().slice(0, 100)}|${sentAt.slice(0, 19)}`;
    if (seenContentKey.has(contentKey)) return false;
    seenContentKey.add(contentKey);
    return true;
  });

  messages = (messages as Record<string, unknown>[]).sort(
    (a, b) =>
      new Date(String(a.sent_at ?? 0)).getTime() - new Date(String(b.sent_at ?? 0)).getTime()
  );

  messages = normalizeMessageTypes(messages as Record<string, unknown>[]);
  messages = await enrichMessagesWithCachedMedia(companyId, id, messages as Record<string, unknown>[]);

  const { messages_snapshot: _snapshot, ...convRest } = conversation as Record<string, unknown>;
  const displayPhone = contact_phone_from_cc ?? conversation.customer_phone;
  const canonicalPhone = toCanonicalDigits(displayPhone || conversation.customer_phone) ?? displayPhone ?? conversation.customer_phone;

  /** Há mensagens no Postgres mais antigas que a mais antiga já exibida? (snapshot antes enganava: comparava length errado.) */
  let hasMoreMessages = false;
  const countClient = process.env.SUPABASE_SERVICE_ROLE_KEY ? createServiceRoleClient() : supabase;
  const chatOnlySorted = (messages as Record<string, unknown>[])
    .filter((m) => String(m.message_type ?? "") !== "internal_note")
    .sort(
      (a, b) =>
        new Date(String(a.sent_at ?? 0)).getTime() - new Date(String(b.sent_at ?? 0)).getTime()
    );
  const oldestChatSentAt =
    chatOnlySorted.length > 0 ? String(chatOnlySorted[0]?.sent_at ?? "").trim() : "";
  if (oldestChatSentAt) {
    const { count: olderCount, error: olderErr } = await countClient
      .from("messages")
      .select("id", { count: "exact", head: true })
      .eq("conversation_id", id)
      .lt("sent_at", oldestChatSentAt);
    if (!olderErr) hasMoreMessages = (olderCount ?? 0) > 0;
  } else {
    const { count: totalCount, error: totalErr } = await countClient
      .from("messages")
      .select("id", { count: "exact", head: true })
      .eq("conversation_id", id);
    if (!totalErr) hasMoreMessages = (totalCount ?? 0) > 0;
  }

  const payload = {
    ...convRest,
    customer_name: (conversation.customer_name && conversation.customer_name.trim()) ? conversation.customer_name : (contact_name_from_cc ?? conversation.customer_name),
    customer_phone: canonicalPhone ?? conversation.customer_phone,
    channel_name,
    queue_name,
    assigned_to_name,
    contact_avatar_url,
    ticket_status_name: ticket_status_name ?? null,
    ticket_status_color_hex: ticket_status_color_hex ?? null,
    messages,
    has_more_messages: hasMoreMessages,
  };
  await setCachedConversationDetail(companyId, id, payload as Record<string, unknown>);
  const res = NextResponse.json(payload);
  return withMetricsHeaders(res, { cacheHit: false, startTime, route: "/api/conversations/[id]", payload: { messages: Array.isArray(messages) ? messages.length : 0 } });
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const companyId = await getCompanyIdFromRequest(request);
  if (!companyId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const baseErr = await requirePermission(companyId, PERMISSIONS.inbox.read);
  if (baseErr) {
    return NextResponse.json({ error: baseErr.error }, { status: baseErr.status });
  }
  const { id } = await params;
  let body: { assigned_to?: string | null; status?: string; queue_id?: string | null };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const { data: existing, error: fetchError } = await supabase
    .from("conversations")
    .select("id, status, assigned_to, queue_id")
    .eq("id", id)
    .eq("company_id", companyId)
    .single();
  if (fetchError || !existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const [seeAllErr, manageErr] = await Promise.all([
    requirePermission(companyId, PERMISSIONS.inbox.see_all),
    requirePermission(companyId, PERMISSIONS.inbox.manage_tickets),
  ]);
  const canBypassCommercial = seeAllErr === null || manageErr === null;
  if (user && !canBypassCommercial && existing.queue_id) {
    const commercial = await isCommercialQueue(supabase, companyId, existing.queue_id);
    if (commercial && existing.assigned_to !== user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  }

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  let shouldSendConsentOnClose = false;
  const resolveStatusMeta = async (slug: string, queueId: string | null) => {
    const base = supabase
      .from("company_ticket_statuses")
      .select("slug, is_closed")
      .eq("company_id", companyId)
      .eq("slug", slug);
    const { data } = await (queueId
      ? base.or(`queue_id.eq.${queueId},queue_id.is.null`).order("queue_id", { ascending: false }).limit(1).maybeSingle()
      : base.is("queue_id", null).limit(1).maybeSingle());
    return (data as { slug: string; is_closed?: boolean } | null) ?? null;
  };

  // Controle de permissão por tipo de atualização
  if (body.status !== undefined && typeof body.status === "string" && body.status.trim()) {
    const newStatus = body.status.trim().toLowerCase();
    if (newStatus !== existing.status) {
      const nextQueueId =
        body.queue_id !== undefined
          ? (body.queue_id === null || body.queue_id === "" ? null : body.queue_id)
          : (existing.queue_id ?? null);
      const newStatusMeta = await resolveStatusMeta(newStatus, nextQueueId);
      if (!newStatusMeta) {
        return NextResponse.json({ error: "Status inválido para esta fila." }, { status: 400 });
      }
      const existingStatusMeta = await resolveStatusMeta(String(existing.status || "").toLowerCase(), existing.queue_id ?? null);
      const existingIsClosed = existingStatusMeta ? !!existingStatusMeta.is_closed : String(existing.status || "").toLowerCase() === "closed";
      const newIsClosed = !!newStatusMeta.is_closed;
      shouldSendConsentOnClose = !existingIsClosed && newIsClosed;
      if (newIsClosed) {
        const err = await requirePermission(companyId, PERMISSIONS.inbox.close);
        if (err) return NextResponse.json({ error: err.error }, { status: err.status });
      } else if (existingIsClosed) {
        const err = await requirePermission(companyId, PERMISSIONS.inbox.reopen);
        if (err) return NextResponse.json({ error: err.error }, { status: err.status });
      } else if (["in_progress", "in_queue", "waiting", "open"].includes(newStatus)) {
        const errAssign = await requirePermission(companyId, PERMISSIONS.inbox.assign);
        const errManage = await requirePermission(companyId, PERMISSIONS.inbox.manage_tickets);
        if (errAssign && errManage) return NextResponse.json({ error: errAssign.error }, { status: errAssign.status });
      } else {
        const errManage = await requirePermission(companyId, PERMISSIONS.inbox.manage_tickets);
        const errAssign = await requirePermission(companyId, PERMISSIONS.inbox.assign);
        if (errManage && errAssign) return NextResponse.json({ error: errManage.error }, { status: errManage.status });
      }
      updates.status = newStatus;
    }
  }
  if (body.assigned_to !== undefined) {
    const newAssigned =
      body.assigned_to === null || body.assigned_to === "" ? null : body.assigned_to;
    if (newAssigned !== existing.assigned_to) {
      if (user && !existing.assigned_to && newAssigned === user.id) {
        // Pegar chamado da fila (claim)
        const err = await requirePermission(companyId, PERMISSIONS.inbox.claim);
        if (err) {
          return NextResponse.json({ error: err.error }, { status: err.status });
        }
      } else {
        // Transferir para outro atendente: exige permissão "Transferir atendimento" no cargo
        const errTransfer = await requirePermission(companyId, PERMISSIONS.inbox.transfer);
        const errManage = await requirePermission(companyId, PERMISSIONS.inbox.manage_tickets);
        if (errTransfer && errManage) {
          return NextResponse.json({ error: errTransfer.error }, { status: errTransfer.status });
        }
      }
      updates.assigned_to = newAssigned;
    }
  }
  if (body.queue_id !== undefined) {
    const newQueue = body.queue_id === null || body.queue_id === "" ? null : body.queue_id;
    if (newQueue !== existing.queue_id) {
      const err = await requirePermission(companyId, PERMISSIONS.inbox.transfer);
      if (err) {
        return NextResponse.json({ error: err.error }, { status: err.status });
      }
      updates.queue_id = newQueue;
    }
  }

  const { data: updated, error: updateError } = await supabase
    .from("conversations")
    .update(updates)
    .eq("id", id)
    .eq("company_id", companyId)
    .select("id, channel_id, external_id, wa_chat_jid, kind, is_group, customer_phone, customer_name, queue_id, assigned_to, status, last_message_at, created_at, updated_at")
    .single();
  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  if (updates.status && typeof updates.status === "string" && existing.status !== updates.status) {
    await supabase.from("conversation_status_history").insert({
      conversation_id: id,
      from_status: existing.status,
      to_status: updates.status,
      changed_by: user?.id ?? null,
    });
  }

  if (shouldSendConsentOnClose) {
    const targetPhoneOrJid = String(updated.wa_chat_jid || updated.customer_phone || "").trim();
    if (targetPhoneOrJid) {
      await sendAutoConsentIfNeeded({
        companyId,
        channelId: String(updated.channel_id),
        phoneOrJid: targetPhoneOrJid,
        name: typeof updated.customer_name === "string" ? updated.customer_name : null,
        reason: "conversation_closed",
      });
    }
  }

  await Promise.all([invalidateConversationList(companyId), invalidateConversationDetail(id, companyId)]);
  return NextResponse.json(updated);
}
