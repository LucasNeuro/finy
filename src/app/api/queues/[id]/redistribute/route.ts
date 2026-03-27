import { getCompanyIdFromRequest } from "@/lib/auth/get-company";
import { requirePermission } from "@/lib/auth/get-profile";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { isCommercialQueue } from "@/lib/queue/commercial";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

async function requireRedistributionPermission(companyId: string) {
  const manageTicketsErr = await requirePermission(companyId, PERMISSIONS.inbox.manage_tickets);
  if (!manageTicketsErr) return null;
  const queuesManageErr = await requirePermission(companyId, PERMISSIONS.queues.manage);
  if (!queuesManageErr) return null;
  return manageTicketsErr;
}

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const companyId = await getCompanyIdFromRequest(request);
  if (!companyId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const permErr = await requireRedistributionPermission(companyId);
  if (permErr) {
    return NextResponse.json({ error: permErr.error }, { status: permErr.status });
  }

  const { id: queueId } = await context.params;
  if (!queueId) {
    return NextResponse.json({ error: "Queue ID required" }, { status: 400 });
  }

  const supabase = await createClient();
  const commercial = await isCommercialQueue(supabase, companyId, queueId);
  if (!commercial) {
    return NextResponse.json({ error: "A fila não é comercial" }, { status: 400 });
  }

  let body: { conversation_id?: string; to_user_id?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const conversationId = typeof body?.conversation_id === "string" ? body.conversation_id.trim() : "";
  const toUserId = typeof body?.to_user_id === "string" ? body.to_user_id.trim() : "";

  if (!conversationId || !toUserId) {
    return NextResponse.json({ error: "conversation_id e to_user_id são obrigatórios" }, { status: 400 });
  }

  const [{ data: conversation, error: convErr }, { data: assignment, error: assignErr }] = await Promise.all([
    supabase
      .from("conversations")
      .select("id, queue_id")
      .eq("id", conversationId)
      .eq("company_id", companyId)
      .single(),
    supabase
      .from("queue_assignments")
      .select("id")
      .eq("company_id", companyId)
      .eq("queue_id", queueId)
      .eq("user_id", toUserId)
      .maybeSingle(),
  ]);

  if (convErr || !conversation) {
    return NextResponse.json({ error: "Conversa não encontrada" }, { status: 404 });
  }
  if (conversation.queue_id !== queueId) {
    return NextResponse.json({ error: "Conversa não pertence a esta fila" }, { status: 400 });
  }
  if (assignErr || !assignment?.id) {
    return NextResponse.json({ error: "Consultor não está atribuído nesta fila" }, { status: 400 });
  }

  const { error: updateErr } = await supabase
    .from("conversations")
    .update({
      assigned_to: toUserId,
      updated_at: new Date().toISOString(),
    })
    .eq("id", conversationId)
    .eq("company_id", companyId);

  if (updateErr) {
    return NextResponse.json({ error: updateErr.message }, { status: 500 });
  }

  const admin = createServiceRoleClient();
  const { data: profile } = await admin
    .from("profiles")
    .select("user_id, full_name, email")
    .eq("company_id", companyId)
    .eq("user_id", toUserId)
    .maybeSingle();

  return NextResponse.json({
    ok: true,
    conversation_id: conversationId,
    assigned_to: toUserId,
    assigned_to_name: profile?.full_name ?? profile?.email ?? "Sem nome",
  });
}
