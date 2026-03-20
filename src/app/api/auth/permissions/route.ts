import { getCompanyIdFromRequest } from "@/lib/auth/get-company";
import { getProfileForCompany } from "@/lib/auth/get-profile";
import { getAllPermissionKeys } from "@/lib/auth/permissions";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { NextResponse } from "next/server";

/**
 * GET /api/auth/permissions
 * Retorna as permissões do usuário na empresa (header X-Company-Slug ou cookie).
 * inbox_see_all: true para owner/admin — podem ver todas as conversas e filtrar por fila.
 * company_id: para uso no cliente (ex.: Realtime Supabase).
 */
export async function GET(request: Request) {
  const companyId = await getCompanyIdFromRequest(request);
  if (!companyId) {
    return NextResponse.json({
      permissions: [],
      inbox_see_all: false,
      company_id: null,
      user_id: null,
      multicalculo_seguros_enabled: false,
    });
  }
  let multicalculoEnabled = false;
  try {
    const admin = createServiceRoleClient();
    const { data } = await admin
      .from("companies")
      .select("multicalculo_seguros_enabled")
      .eq("id", companyId)
      .single();
    multicalculoEnabled = data?.multicalculo_seguros_enabled === true;
  } catch {
    multicalculoEnabled = false;
  }
  const profile = await getProfileForCompany(companyId);
  if (!profile) {
    return NextResponse.json({
      permissions: [],
      inbox_see_all: false,
      company_id: null,
      user_id: null,
      multicalculo_seguros_enabled: multicalculoEnabled,
    });
  }
  const isOwnerOrAdmin = profile.is_owner || (profile.role === "admin" && !profile.role_id);
  if (isOwnerOrAdmin) {
    return NextResponse.json({
      permissions: getAllPermissionKeys(),
      inbox_see_all: true,
      company_id: companyId,
      user_id: profile.user_id,
      multicalculo_seguros_enabled: multicalculoEnabled,
    });
  }
  const perms = profile.roles?.permissions ?? [];
  const list = Array.isArray(perms) ? perms : [];
  const inboxSeeAll = list.includes("inbox.see_all") || list.includes("inbox.manage_tickets");
  return NextResponse.json({
    permissions: list,
    inbox_see_all: inboxSeeAll,
    company_id: companyId,
    user_id: profile.user_id,
    multicalculo_seguros_enabled: multicalculoEnabled,
  });
}
