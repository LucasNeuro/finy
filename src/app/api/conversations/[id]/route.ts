import { getCompanyIdFromRequest } from "@/lib/auth/get-company";
import { requirePermission } from "@/lib/auth/get-profile";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { withMetricsHeaders } from "@/lib/api/metrics";
import {
  getCachedConversationDetail,
  invalidateConversationList,
  setCachedConversationDetail,
  invalidateConversationDetail,
} from "@/lib/redis/inbox-state";
import { getCachedMediaUrlsBulk } from "@/lib/redis/media-cache";
import { toCanonicalDigits } from "@/lib/phone-canonical";
import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { getChannelToken } from "@/lib/uazapi/channel-token";
import { getChatDetails } from "@/lib/uazapi/client";
import { NextResponse } from "next/server";

const VIDEO_EXT = /\.(mp4|webm|mov|avi|mkv|m4v|3gp)(\?|$)/i;
const AUDIO_EXT = /\.(mp3|ogg|m4a|wav|opus|aac|oga|weba)(\?|$)/i;

const MEDIA_MESSAGE_TYPES = ["image", "video", "audio", "ptt", "document", "sticker"] as const;

/** Enriquece mensagens com media_cached_url do Redis (evita chamadas /download no frontend). */
async function enrichMessagesWithCachedMedia(
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
  const urlMap = await getCachedMediaUrlsBulk(conversationId, mediaIds);
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
    const cached = await getCachedConversationDetail(id);
    if (cached) {
      let messages = Array.isArray(cached.messages) ? normalizeMessageTypes(cached.messages) : cached.messages;
      messages = await enrichMessagesWithCachedMedia(id, messages as Record<string, unknown>[]);
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
      const { data: statusRowCache } = await supabaseCache
        .from("company_ticket_statuses")
        .select("color_hex")
        .eq("company_id", companyId)
        .eq("slug", effectiveStatusCached)
        .or(queueIdCached ? `queue_id.eq.${queueIdCached},queue_id.is.null` : "queue_id.is.null")
        .limit(1)
        .maybeSingle();
      if (statusRowCache && (statusRowCache as { color_hex?: string }).color_hex) {
        ticket_status_color_hex_cached = (statusRowCache as { color_hex: string }).color_hex.trim() || null;
      }
      if (!ticket_status_color_hex_cached) {
        const { data: fallbackRowCache } = await supabaseCache
          .from("company_ticket_statuses")
          .select("color_hex")
          .eq("company_id", companyId)
          .eq("slug", effectiveStatusCached)
          .limit(1)
          .maybeSingle();
        if (fallbackRowCache && (fallbackRowCache as { color_hex?: string }).color_hex) {
          ticket_status_color_hex_cached = (fallbackRowCache as { color_hex: string }).color_hex.trim() || null;
        }
      }
      const res = NextResponse.json({
        ...cached,
        messages,
        ticket_status_color_hex: ticket_status_color_hex_cached,
      });
      return withMetricsHeaders(res, { cacheHit: true, startTime });
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
  const queueId = conversation.queue_id ?? null;
  const slugForColor = effectiveStatus;
  const { data: statusRow } = await supabase
    .from("company_ticket_statuses")
    .select("color_hex")
    .eq("company_id", companyId)
    .eq("slug", slugForColor)
    .or(queueId ? `queue_id.eq.${queueId},queue_id.is.null` : "queue_id.is.null")
    .limit(1)
    .maybeSingle();
  if (statusRow && (statusRow as { color_hex?: string }).color_hex) {
    ticket_status_color_hex = (statusRow as { color_hex: string }).color_hex.trim() || null;
  }
  if (!ticket_status_color_hex) {
    const { data: fallbackRow } = await supabase
      .from("company_ticket_statuses")
      .select("color_hex")
      .eq("company_id", companyId)
      .eq("slug", slugForColor)
      .limit(1)
      .maybeSingle();
    if (fallbackRow && (fallbackRow as { color_hex?: string }).color_hex) {
      ticket_status_color_hex = (fallbackRow as { color_hex: string }).color_hex.trim() || null;
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
        const data = detailRes.data as { wa_contactName?: string; wa_name?: string; name?: string; imagePreview?: string; image?: string; picture?: string } | undefined;
        
        const fetchedName = (data?.wa_contactName ?? data?.wa_name ?? data?.name)?.trim() || null;
        const fetchedImage = (data?.imagePreview ?? data?.image ?? data?.picture)?.trim() || null;

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

          await supabase
            .from("channel_contacts")
            .update(updatePayload)
            .eq("channel_id", conversation.channel_id)
            .eq("company_id", companyId)
            .in("jid", jids);

          if (fetchedName) {
            await supabase
              .from("conversations")
              .update({ customer_name: fetchedName, updated_at: new Date().toISOString() })
              .eq("id", id)
              .eq("company_id", companyId);
          }
          
          await invalidateConversationList(companyId);
          await invalidateConversationDetail(id);
        }
      }
    } catch {
      // não bloquear a resposta se a UAZAPI falhar
    }
  }

  const MESSAGES_LIMIT = 5000;
  const messagesSelect = "id, direction, content, external_id, sent_at, created_at, message_type, media_url, caption, file_name, reaction";
  let messages: unknown[] = [];

  const snapshot = (conversation as { messages_snapshot?: unknown }).messages_snapshot;
  if (Array.isArray(snapshot) && snapshot.length > 0) {
    messages = snapshot;
  } else if (snapshot && typeof snapshot === "object" && !Array.isArray(snapshot)) {
    messages = [];
  }

  if (messages.length === 0) {
    if (process.env.SUPABASE_SERVICE_ROLE_KEY) {
      try {
        const adminSupabase = createServiceRoleClient();
        const res = await adminSupabase
          .from("messages")
          .select(messagesSelect)
          .eq("conversation_id", id)
          .order("sent_at", { ascending: true })
          .limit(MESSAGES_LIMIT);
        if (!res.error && res.data) messages = Array.isArray(res.data) ? res.data : [];
      } catch {
        // fallback to user client below
      }
    }
    if (messages.length === 0) {
      const res = await supabase
        .from("messages")
        .select(messagesSelect)
        .eq("conversation_id", id)
        .order("sent_at", { ascending: true })
        .limit(MESSAGES_LIMIT);
      if (res.error) {
        return NextResponse.json({ error: res.error.message }, { status: 500 });
      }
      messages = Array.isArray(res.data) ? res.data : [];
    }
    if (messages.length > 0) {
      const SNAPSHOT_MAX = 1000;
      const toStore = messages.slice(-SNAPSHOT_MAX);
      await supabase.from("conversations").update({ messages_snapshot: toStore, updated_at: new Date().toISOString() }).eq("id", id).eq("company_id", companyId);
    }
  }
  // Buscar internal_notes e mesclar
  const notesClient = process.env.SUPABASE_SERVICE_ROLE_KEY 
    ? createServiceRoleClient() 
    : supabase;

  const { data: notes } = await notesClient
    .from("internal_notes")
    .select("id, content, created_at, author_id")
    .eq("conversation_id", id)
    .order("created_at", { ascending: true });

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

  messages = normalizeMessageTypes(messages as Record<string, unknown>[]);
  messages = await enrichMessagesWithCachedMedia(id, messages as Record<string, unknown>[]);

  const { messages_snapshot: _snapshot, ...convRest } = conversation as Record<string, unknown>;
  const displayPhone = contact_phone_from_cc ?? conversation.customer_phone;
  const canonicalPhone = toCanonicalDigits(displayPhone || conversation.customer_phone) ?? displayPhone ?? conversation.customer_phone;
  const payload = {
    ...convRest,
    customer_name: (conversation.customer_name && conversation.customer_name.trim()) ? conversation.customer_name : (contact_name_from_cc ?? conversation.customer_name),
    customer_phone: canonicalPhone ?? conversation.customer_phone,
    channel_name,
    queue_name,
    assigned_to_name,
    contact_avatar_url,
    ticket_status_color_hex: ticket_status_color_hex ?? null,
    messages,
  };
  await setCachedConversationDetail(id, payload as Record<string, unknown>);
  const res = NextResponse.json(payload);
  return withMetricsHeaders(res, { cacheHit: false, startTime });
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

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
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

  await Promise.all([invalidateConversationList(companyId), invalidateConversationDetail(id)]);
  return NextResponse.json(updated);
}
