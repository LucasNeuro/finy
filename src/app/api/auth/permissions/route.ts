import { getCompanyIdFromRequest } from "@/lib/auth/get-company";
import { getProfileForCompany } from "@/lib/auth/get-profile";
import { getAllPermissionKeys } from "@/lib/auth/permissions";
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
    return NextResponse.json({ permissions: [], inbox_see_all: false, company_id: null, user_id: null });
  }
  const profile = await getProfileForCompany(companyId);
  if (!profile) {
    return NextResponse.json({ permissions: [], inbox_see_all: false, company_id: null, user_id: null });
  }
  const isOwnerOrAdmin = profile.is_owner || (profile.role === "admin" && !profile.role_id);
  if (isOwnerOrAdmin) {
    return NextResponse.json({ permissions: getAllPermissionKeys(), inbox_see_all: true, company_id: companyId, user_id: profile.user_id });
  }
  const perms = profile.roles?.permissions ?? [];
  const list = Array.isArray(perms) ? perms : [];
  const inboxSeeAll = list.includes("inbox.see_all") || list.includes("inbox.manage_tickets");
  return NextResponse.json({ permissions: list, inbox_see_all: inboxSeeAll, company_id: companyId, user_id: profile.user_id });
}
