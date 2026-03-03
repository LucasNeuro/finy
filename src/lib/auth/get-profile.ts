import { createClient } from "@/lib/supabase/server";
import type { PermissionKey } from "./permissions";
import { hasPermission } from "./permissions";

export type RoleRow = { id: string; name: string; permissions: string[] };

export type ProfileRow = {
  id: string;
  user_id: string;
  company_id: string;
  role: string;
  role_id: string | null;
  is_owner: boolean;
  companies: { slug: string; name: string } | null;
  roles: RoleRow | null;
};

export async function getCurrentUserProfiles(): Promise<ProfileRow[]> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];

  const { data, error } = await supabase
    .from("profiles")
    .select("id, user_id, company_id, role, role_id, is_owner, companies(slug, name), roles(id, name, permissions)")
    .eq("user_id", user.id);

  if (error) return [];
  const rows = (data ?? []) as (Omit<ProfileRow, "roles"> & { roles: RoleRow | RoleRow[] | null })[];
  return rows.map((r) => ({
    ...r,
    roles: Array.isArray(r.roles) ? r.roles[0] ?? null : r.roles ?? null,
  })) as unknown as ProfileRow[];
}

export async function getFirstCompanySlug(): Promise<string | null> {
  const profiles = await getCurrentUserProfiles();
  const first = profiles[0];
  if (!first?.companies) return null;
  const company = first.companies as { slug: string };
  return company.slug ?? null;
}

export async function getProfileForCompany(companyId: string): Promise<ProfileRow | null> {
  const profiles = await getCurrentUserProfiles();
  return profiles.find((p) => p.company_id === companyId) ?? null;
}

export async function requireAdmin(companyId: string): Promise<{ error: string; status: number } | null> {
  return requirePermission(companyId, "users.manage" as PermissionKey);
}

/** Retorna o perfil do usuário na empresa com cargo (roles) preenchido. */
export async function getProfileWithRole(companyId: string): Promise<ProfileRow | null> {
  return getProfileForCompany(companyId);
}

/** Verifica se o usuário tem a permissão na empresa. Owner e admin legado (sem role_id) têm todas. */
export async function requirePermission(
  companyId: string,
  permission: PermissionKey
): Promise<{ error: string; status: number } | null> {
  const profile = await getProfileForCompany(companyId);
  if (!profile) return { error: "Unauthorized", status: 401 };
  if (profile.is_owner) return null;
  if (profile.role === "admin" && !profile.role_id) return null;
  const perms = profile.roles?.permissions ?? [];
  if (hasPermission(Array.isArray(perms) ? perms : [], permission)) return null;
  return { error: "Forbidden", status: 403 };
}

/** Verifica se o usuário tem a permissão (retorno booleano). */
export async function can(companyId: string, permission: PermissionKey): Promise<boolean> {
  const err = await requirePermission(companyId, permission);
  return err === null;
}
