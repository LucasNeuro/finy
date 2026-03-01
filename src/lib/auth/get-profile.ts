import { createClient } from "@/lib/supabase/server";

export type ProfileRow = {
  id: string;
  user_id: string;
  company_id: string;
  role: string;
  companies: { slug: string; name: string } | null;
};

export async function getCurrentUserProfiles(): Promise<ProfileRow[]> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];

  const { data, error } = await supabase
    .from("profiles")
    .select("id, user_id, company_id, role, companies(slug, name)")
    .eq("user_id", user.id);

  if (error) return [];
  return (data ?? []) as unknown as ProfileRow[];
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
  const profile = await getProfileForCompany(companyId);
  if (!profile) return { error: "Unauthorized", status: 401 };
  if (profile.role !== "admin") return { error: "Forbidden", status: 403 };
  return null;
}
