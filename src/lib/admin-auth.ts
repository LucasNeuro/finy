import { createClient } from "@/lib/supabase/server";

/**
 * Verifica se o usuário logado é o owner da empresa dona da plataforma.
 * Apenas esse usuário pode acessar o painel Super Admin.
 */
export async function verifyPlatformOwnerAuth(): Promise<boolean> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return false;

  const { data: profiles } = await supabase
    .from("profiles")
    .select("company_id")
    .eq("user_id", user.id)
    .eq("is_owner", true);

  if (!profiles?.length) return false;

  const companyIds = profiles.map((p) => p.company_id);

  const { data: companies } = await supabase
    .from("companies")
    .select("id")
    .in("id", companyIds)
    .eq("is_platform_owner", true)
    .limit(1);

  return (companies?.length ?? 0) > 0;
}
