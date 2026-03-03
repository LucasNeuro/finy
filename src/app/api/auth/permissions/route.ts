import { getCompanyIdFromRequest } from "@/lib/auth/get-company";
import { getProfileForCompany } from "@/lib/auth/get-profile";
import { getAllPermissionKeys } from "@/lib/auth/permissions";
import { NextResponse } from "next/server";

/**
 * GET /api/auth/permissions
 * Retorna as permissões do usuário na empresa (header X-Company-Slug ou cookie).
 * Usado no front para esconder abas (ex.: Cargos e usuários) para quem não tem users.manage.
 */
export async function GET(request: Request) {
  const companyId = await getCompanyIdFromRequest(request);
  if (!companyId) {
    return NextResponse.json({ permissions: [] });
  }
  const profile = await getProfileForCompany(companyId);
  if (!profile) {
    return NextResponse.json({ permissions: [] });
  }
  if (profile.is_owner || (profile.role === "admin" && !profile.role_id)) {
    return NextResponse.json({ permissions: getAllPermissionKeys() });
  }
  const perms = profile.roles?.permissions ?? [];
  const list = Array.isArray(perms) ? perms : [];
  return NextResponse.json({ permissions: list });
}
