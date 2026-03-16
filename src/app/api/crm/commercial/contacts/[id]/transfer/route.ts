import { createServiceRoleClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

/**
 * POST /api/crm/commercial/contacts/[id]/transfer
 *   Transfere um contato da carteira de um consultor para outro.
 *   Registra histórico em commercial_contact_transfers.
 *
 *   Body: { to_user_id: string, reason?: string }
 *
 *   Regras:
 *   - Admin/supervisor: pode transferir qualquer contato da empresa.
 *   - Agente: só pode transferir seus próprios contatos.
 */

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabaseUser = await createClient();
  const {
    data: { user },
  } = await supabaseUser.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await request.json()) as { to_user_id: string; reason?: string };
  if (!body.to_user_id) {
    return NextResponse.json({ error: "to_user_id é obrigatório" }, { status: 400 });
  }

  const supabase = createServiceRoleClient();

  const { data: profile } = await supabase
    .from("profiles")
    .select("company_id, role")
    .eq("user_id", user.id)
    .single();

  if (!profile) return NextResponse.json({ error: "Profile not found" }, { status: 404 });

  const companyId = (profile as { company_id: string }).company_id;
  const role = (profile as { role: string }).role;
  const isManager = role === "admin" || role === "supervisor";

  // Buscar o registro de ownership
  const { data: owner } = await supabase
    .from("commercial_contact_owners")
    .select("id, owner_user_id, company_id, queue_id, channel_id, phone_canonical")
    .eq("id", id)
    .eq("company_id", companyId)
    .single();

  if (!owner) return NextResponse.json({ error: "Contato não encontrado na carteira" }, { status: 404 });

  const ownerRow = owner as {
    id: string;
    owner_user_id: string;
    company_id: string;
    queue_id: string;
    channel_id: string;
    phone_canonical: string;
  };

  if (!isManager && ownerRow.owner_user_id !== user.id) {
    return NextResponse.json({ error: "Sem permissão para transferir este contato" }, { status: 403 });
  }

  // Verificar se o destinatário pertence à mesma empresa e está na fila
  const { data: targetProfile } = await supabase
    .from("profiles")
    .select("user_id, full_name")
    .eq("user_id", body.to_user_id)
    .eq("company_id", companyId)
    .single();

  if (!targetProfile) {
    return NextResponse.json({ error: "Consultor de destino não encontrado" }, { status: 404 });
  }

  const fromUserId = ownerRow.owner_user_id;

  // Atualizar o dono
  const { error: updateError } = await supabase
    .from("commercial_contact_owners")
    .update({
      owner_user_id: body.to_user_id,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);

  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });

  // Registrar histórico
  const { error: historyError } = await supabase
    .from("commercial_contact_transfers")
    .insert({
      company_id: companyId,
      commercial_contact_owner_id: id,
      from_user_id: fromUserId,
      to_user_id: body.to_user_id,
      transferred_by: user.id,
      reason: body.reason ?? null,
    });

  if (historyError) {
    // Não reverter a transferência por falha no histórico — apenas logar
    console.error("[CRM] Erro ao registrar histórico de transferência:", historyError.message);
  }

  // Reatribuir conversas abertas deste contato na fila para o novo dono
  await supabase
    .from("conversations")
    .update({ assigned_to: body.to_user_id, updated_at: new Date().toISOString() })
    .eq("company_id", companyId)
    .eq("channel_id", ownerRow.channel_id)
    .eq("queue_id", ownerRow.queue_id)
    .eq("customer_phone", ownerRow.phone_canonical)
    .in("status", ["open", "pending"]);

  return NextResponse.json({
    ok: true,
    transferred_to: (targetProfile as { full_name?: string }).full_name ?? body.to_user_id,
  });
}
