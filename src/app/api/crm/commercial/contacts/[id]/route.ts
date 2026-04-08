import { createServiceRoleClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

/**
 * PATCH /api/crm/commercial/contacts/[id]
 *   Atualiza notes de um contato da carteira.
 *
 * DELETE /api/crm/commercial/contacts/[id]
 *   Remove o contato da carteira (apenas o próprio consultor ou gestor).
 */

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabaseUser = await createClient();
  const {
    data: { user },
  } = await supabaseUser.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

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

  // Verificar ownership
  const { data: existing } = await supabase
    .from("commercial_contact_owners")
    .select("id, owner_user_id, company_id")
    .eq("id", id)
    .eq("company_id", companyId)
    .single();

  if (!existing) return NextResponse.json({ error: "Não encontrado" }, { status: 404 });

  if (!isManager && (existing as { owner_user_id: string }).owner_user_id !== user.id) {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  }

  const body = (await request.json()) as {
    notes?: string;
    lead_score?: number | null;
    estimated_value_cents?: number | null;
  };

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (body.notes !== undefined) updates.notes = body.notes ?? null;
  if (body.lead_score !== undefined) {
    if (body.lead_score === null) {
      updates.lead_score = null;
    } else {
      const n = Number(body.lead_score);
      if (!Number.isFinite(n) || n < 0 || n > 100) {
        return NextResponse.json({ error: "lead_score deve ser entre 0 e 100" }, { status: 400 });
      }
      updates.lead_score = Math.round(n);
    }
  }
  if (body.estimated_value_cents !== undefined) {
    if (body.estimated_value_cents === null) {
      updates.estimated_value_cents = null;
    } else {
      const v = Number(body.estimated_value_cents);
      if (!Number.isFinite(v) || v < 0) {
        return NextResponse.json({ error: "estimated_value_cents inválido" }, { status: 400 });
      }
      updates.estimated_value_cents = Math.round(v);
    }
  }

  const { data, error } = await supabase
    .from("commercial_contact_owners")
    .update(updates)
    .eq("id", id)
    .select("id, phone_canonical, queue_id, channel_id, source, notes, lead_score, estimated_value_cents, updated_at")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data });
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabaseUser = await createClient();
  const {
    data: { user },
  } = await supabaseUser.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

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

  const { data: existing } = await supabase
    .from("commercial_contact_owners")
    .select("id, owner_user_id, company_id")
    .eq("id", id)
    .eq("company_id", companyId)
    .single();

  if (!existing) return NextResponse.json({ error: "Não encontrado" }, { status: 404 });

  if (!isManager && (existing as { owner_user_id: string }).owner_user_id !== user.id) {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  }

  const { error } = await supabase
    .from("commercial_contact_owners")
    .delete()
    .eq("id", id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
