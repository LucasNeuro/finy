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
import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { NextResponse } from "next/server";

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
      const res = NextResponse.json(cached);
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

  /** Normaliza número Brasil para lookup (canonical digits). */
  function toCanonicalDigits(raw: string | null | undefined): string | null {
    if (!raw) return null;
    const d = (raw ?? "").replace(/\D/g, "");
    if (d.length === 10 || d.length === 11) return "55" + d;
    if ((d.length === 12 || d.length === 13) && d.startsWith("55")) return d;
    if ((d.length === 14 || d.length === 15) && !d.startsWith("55")) {
      const ddd = d.slice(0, 2);
      const mobile = d.slice(2, 11);
      if (/^\d{2}$/.test(ddd) && /^\d{9}$/.test(mobile)) return "55" + ddd + mobile;
    }
    return d || null;
  }

  const jid = conversation.wa_chat_jid || conversation.external_id || conversation.customer_phone || "";
  const jidNorm = jid && !jid.includes("@") ? `${jid.replace(/\D/g, "")}@s.whatsapp.net` : jid;
  const canonicalDigits = toCanonicalDigits(conversation.customer_phone || jid);
  const canonicalJid = canonicalDigits ? `${canonicalDigits}@s.whatsapp.net` : null;
  const jids = [...new Set([jid, jidNorm, canonicalJid].filter(Boolean))] as string[];
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

  const MESSAGES_LIMIT = 5000;
  const messagesSelect = "id, direction, content, external_id, sent_at, created_at, message_type, media_url, caption, file_name";
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
  }

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
  // Controle de permissão por tipo de atualização
  if (body.status !== undefined && typeof body.status === "string" && body.status.trim()) {
    const newStatus = body.status.trim().toLowerCase();
    if (newStatus !== existing.status) {
      if (newStatus === "closed") {
        const err = await requirePermission(companyId, PERMISSIONS.inbox.close);
        if (err) return NextResponse.json({ error: err.error }, { status: err.status });
      } else if (existing.status === "closed") {
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
