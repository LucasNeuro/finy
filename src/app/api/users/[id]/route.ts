import { getCompanyIdFromRequest } from "@/lib/auth/get-company";
import { requirePermission } from "@/lib/auth/get-profile";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { invalidateRoundRobinForCompany } from "@/lib/queue/round-robin";
import { NextResponse } from "next/server";

/** PATCH: atualiza cargo e/ou caixas do usuário (profile_id ou user_id) */
export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const companyId = await getCompanyIdFromRequest(request);
  if (!companyId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const err = await requirePermission(companyId, PERMISSIONS.users.manage);
  if (err) return NextResponse.json({ error: err.error }, { status: err.status });

  const { id } = await context.params;
  const targetId = (id ?? "").trim();
  if (!targetId) {
    return NextResponse.json({ error: "ID do usuário é obrigatório" }, { status: 400 });
  }
  let body: { role_id?: string; queue_ids?: string[]; group_assignments?: { channel_id: string; group_jid: string }[]; is_active?: boolean; full_name?: string; phone?: string; cpf?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const admin = createServiceRoleClient();
  let profile = await admin
    .from("profiles")
    .select("id, user_id, is_owner")
    .eq("company_id", companyId)
    .eq("id", targetId)
    .maybeSingle();

  if (!profile.data) {
    profile = await admin
      .from("profiles")
      .select("id, user_id, is_owner")
      .eq("company_id", companyId)
      .eq("user_id", targetId)
      .maybeSingle();
  }

  if (profile.error || !profile.data) {
    return NextResponse.json({ error: "Usuário não encontrado" }, { status: 404 });
  }
  const row = profile.data as { id: string; user_id: string; is_owner: boolean };
  if (row.is_owner && body.is_active === false) {
    return NextResponse.json({ error: "Não é possível desativar o proprietário" }, { status: 403 });
  }

  const updates: { role_id?: string; is_active?: boolean; full_name?: string | null; phone?: string | null; cpf?: string | null; updated_at: string } = {
    updated_at: new Date().toISOString(),
  };
  if (body.role_id !== undefined) {
    const { data: role } = await admin.from("roles").select("id").eq("id", body.role_id).eq("company_id", companyId).single();
    if (!role) return NextResponse.json({ error: "Cargo não encontrado" }, { status: 404 });
    updates.role_id = body.role_id;
  }
  if (body.is_active !== undefined && !row.is_owner) {
    updates.is_active = !!body.is_active;
  }
  if (body.full_name !== undefined) updates.full_name = body.full_name?.trim() || null;
  if (body.phone !== undefined) updates.phone = typeof body.phone === "string" ? body.phone.replace(/\D/g, "").trim() || null : null;
  if (body.cpf !== undefined) updates.cpf = typeof body.cpf === "string" ? body.cpf.replace(/\D/g, "").trim() || null : null;
  if (Object.keys(updates).length > 1) {
    const { error: upErr } = await admin.from("profiles").update(updates).eq("id", row.id);
    if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 });
  }

  if (body.queue_ids !== undefined) {
    await admin.from("queue_assignments").delete().eq("user_id", row.user_id).eq("company_id", companyId);
    const queueIds = Array.isArray(body.queue_ids) ? body.queue_ids.filter((q): q is string => typeof q === "string") : [];
    if (queueIds.length > 0) {
      const rows = queueIds.map((queue_id) => ({ queue_id, user_id: row.user_id, company_id: companyId }));
      await admin.from("queue_assignments").insert(rows);
    }
    await invalidateRoundRobinForCompany(companyId);
  }

  if (body.group_assignments !== undefined) {
    await admin.from("channel_group_assignments").delete().eq("user_id", row.user_id).eq("company_id", companyId);
    const groupAssignments = Array.isArray(body.group_assignments)
      ? body.group_assignments.filter((a): a is { channel_id: string; group_jid: string } => typeof a?.channel_id === "string" && typeof a?.group_jid === "string")
      : [];
    if (groupAssignments.length > 0) {
      const rows = groupAssignments.map(({ channel_id, group_jid }) => ({
        channel_id,
        company_id: companyId,
        group_jid,
        user_id: row.user_id,
      }));
      const { error: groupErr } = await admin.from("channel_group_assignments").insert(rows);
      if (groupErr) return NextResponse.json({ error: groupErr.message ?? "Falha ao atualizar responsabilidades em grupos" }, { status: 500 });
    }
  }

  return NextResponse.json({ ok: true });
}
