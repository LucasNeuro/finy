import { getCompanyIdFromRequest } from "@/lib/auth/get-company";
import { requirePermission } from "@/lib/auth/get-profile";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { NextResponse } from "next/server";

/**
 * GET /api/company/agents
 * Lista atendentes da empresa (para dropdown de atribuição a grupos/comunidades).
 */
export async function GET(request: Request) {
  const companyId = await getCompanyIdFromRequest(request);
  if (!companyId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Permite listar agentes para telas de atribuição/reatribuição.
  const assignErr = await requirePermission(companyId, PERMISSIONS.inbox.assign);
  if (assignErr) {
    const manageTicketsErr = await requirePermission(companyId, PERMISSIONS.inbox.manage_tickets);
    if (manageTicketsErr) {
      const usersManageErr = await requirePermission(companyId, PERMISSIONS.users.manage);
      if (usersManageErr) {
        return NextResponse.json({ error: assignErr.error }, { status: assignErr.status });
      }
    }
  }

  const admin = createServiceRoleClient();
  const { data, error } = await admin
    .from("profiles")
    .select("id, user_id, full_name, email, is_active")
    .eq("company_id", companyId)
    .order("full_name");

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  const list = (data ?? [])
    .filter((p) => (p as { is_active?: boolean | null }).is_active !== false)
    .map((p) => ({
      id: p.id,
      user_id: p.user_id,
      full_name: p.full_name ?? p.email ?? "Sem nome",
      email: p.email ?? undefined,
    }));
  return NextResponse.json(list);
}
