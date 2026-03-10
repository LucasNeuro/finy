import { getCompanyIdFromRequest } from "@/lib/auth/get-company";
import { getProfileForCompany, requirePermission } from "@/lib/auth/get-profile";
import { PERMISSIONS } from "@/lib/auth/permissions";
import {
  invalidateConversationDetail,
  invalidateConversationList,
} from "@/lib/redis/inbox-state";
import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

/**
 * POST /api/conversations/[id]/claim
 * Assume o atendimento (atribui a conversa ao usuário logado).
 * Nunca cria conversa nova: só atualiza assigned_to e status da conversa existente.
 * Só funciona se a conversa estiver sem atendente (assigned_to null).
 * Exige permissão inbox.claim.
 * Atualiza status para in_progress (ticket em atendimento).
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const companyId = await getCompanyIdFromRequest(request);
  if (!companyId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const claimErr = await requirePermission(companyId, PERMISSIONS.inbox.claim);
  if (claimErr) {
    return NextResponse.json({ error: claimErr.error }, { status: claimErr.status });
  }

  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: conversation, error: fetchErr } = await supabase
    .from("conversations")
    .select("id, assigned_to, status, company_id")
    .eq("id", id)
    .eq("company_id", companyId)
    .single();

  if (fetchErr || !conversation) {
    return NextResponse.json({ error: "Conversa não encontrada" }, { status: 404 });
  }

  if (conversation.assigned_to != null) {
    return NextResponse.json(
      { error: "Chamado já está atribuído a outro atendente." },
      { status: 400 }
    );
  }

  const now = new Date().toISOString();
  const { data: updated, error: updateErr } = await supabase
    .from("conversations")
    .update({
      assigned_to: user.id,
      status: "in_progress",
      updated_at: now,
    })
    .eq("id", id)
    .eq("company_id", companyId)
    .select("id, channel_id, external_id, wa_chat_jid, kind, is_group, customer_phone, customer_name, queue_id, assigned_to, status, last_message_at, created_at, updated_at")
    .single();

  if (updateErr) {
    return NextResponse.json({ error: updateErr.message }, { status: 500 });
  }

  let assigned_to_name: string | null = null;
  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name")
    .eq("user_id", user.id)
    .eq("company_id", companyId)
    .single();
  assigned_to_name = (profile as { full_name?: string } | null)?.full_name?.trim() ?? null;

  await Promise.all([
    invalidateConversationList(companyId),
    invalidateConversationDetail(id),
  ]);

  return NextResponse.json({ ...updated, assigned_to_name });
}
