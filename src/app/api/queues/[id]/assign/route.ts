import { getCompanyIdFromRequest } from "@/lib/auth/get-company";
import { requirePermission } from "@/lib/auth/get-profile";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { isCommercialQueue } from "@/lib/queue/commercial";
import { getNextAgentForQueue } from "@/lib/queue/round-robin";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

async function requireAssignmentPermission(companyId: string) {
  const assignErr = await requirePermission(companyId, PERMISSIONS.inbox.assign);
  if (!assignErr) return null;
  const manageTicketsErr = await requirePermission(companyId, PERMISSIONS.inbox.manage_tickets);
  if (!manageTicketsErr) return null;
  return assignErr;
}

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const companyId = await getCompanyIdFromRequest(request);
  if (!companyId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const permErr = await requireAssignmentPermission(companyId);
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

  let body: { conversation_id?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const conversationId = typeof body?.conversation_id === "string" ? body.conversation_id.trim() : "";
  if (!conversationId) {
    return NextResponse.json({ error: "conversation_id é obrigatório" }, { status: 400 });
  }

  const { data: conversation, error: convErr } = await supabase
    .from("conversations")
    .select("id, queue_id")
    .eq("id", conversationId)
    .eq("company_id", companyId)
    .single();

  if (convErr || !conversation) {
    return NextResponse.json({ error: "Conversa não encontrada" }, { status: 404 });
  }

  if (conversation.queue_id !== queueId) {
    return NextResponse.json({ error: "Conversa não pertence a esta fila" }, { status: 400 });
  }

  const nextAgentId = await getNextAgentForQueue(companyId, queueId);
  if (!nextAgentId) {
    return NextResponse.json({ error: "Nenhum consultor disponível para esta fila" }, { status: 400 });
  }

  const { error: updateErr } = await supabase
    .from("conversations")
    .update({
      assigned_to: nextAgentId,
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
    .eq("user_id", nextAgentId)
    .maybeSingle();

  return NextResponse.json({
    ok: true,
    conversation_id: conversationId,
    assigned_to: nextAgentId,
    assigned_to_name: profile?.full_name ?? profile?.email ?? "Sem nome",
  });
}
