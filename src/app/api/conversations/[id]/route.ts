import { getCompanyIdFromRequest } from "@/lib/auth/get-company";
import { requirePermission } from "@/lib/auth/get-profile";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { invalidateConversationList } from "@/lib/redis/inbox-state";
import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const companyId = await getCompanyIdFromRequest(request);
  if (!companyId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const readErr = await requirePermission(companyId, PERMISSIONS.inbox.read);
  if (readErr) {
    return NextResponse.json({ error: readErr.error }, { status: readErr.status });
  }
  const { id } = await params;
  const supabase = await createClient();
  const { data: conversation, error: convError } = await supabase
    .from("conversations")
    .select("id, channel_id, external_id, wa_chat_jid, kind, is_group, customer_phone, customer_name, queue_id, assigned_to, status, last_message_at, created_at")
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

  const { data: messages, error: msgError } = await supabase
    .from("messages")
    .select("id, direction, content, external_id, sent_at, created_at, message_type, media_url, caption, file_name")
    .eq("conversation_id", id)
    .order("sent_at", { ascending: true });
  if (msgError) {
    return NextResponse.json({ error: msgError.message }, { status: 500 });
  }
  return NextResponse.json({
    ...conversation,
    channel_name,
    queue_name,
    assigned_to_name,
    messages: messages ?? [],
  });
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
      } else if (["in_progress", "waiting", "open"].includes(newStatus)) {
        const errAssign = await requirePermission(companyId, PERMISSIONS.inbox.assign);
        const errManage = await requirePermission(companyId, PERMISSIONS.inbox.manage_tickets);
        if (errAssign && errManage) return NextResponse.json({ error: errAssign.error }, { status: errAssign.status });
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
        // Atribuir para outro atendente (assign ou visão gerencial)
        const errAssign = await requirePermission(companyId, PERMISSIONS.inbox.assign);
        const errManage = await requirePermission(companyId, PERMISSIONS.inbox.manage_tickets);
        if (errAssign && errManage) {
          return NextResponse.json({ error: errAssign.error }, { status: errAssign.status });
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
  await invalidateConversationList(companyId);
  return NextResponse.json(updated);
}
