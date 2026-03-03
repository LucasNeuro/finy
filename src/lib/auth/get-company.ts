import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";

const COOKIE_COMPANY_ID = "clicvend_company_id";
const COOKIE_SLUG = "clicvend_slug";
const HEADER_COMPANY_SLUG = "x-company-slug";

export async function getCompanyIdFromCookie(): Promise<string | null> {
  const store = await cookies();
  return store.get(COOKIE_COMPANY_ID)?.value ?? null;
}

export async function getSlugFromCookie(): Promise<string | null> {
  const store = await cookies();
  return store.get(COOKIE_SLUG)?.value ?? null;
}

/**
 * Obtém company_id: primeiro do cookie, depois do header X-Company-Slug (fallback quando o cookie não vem na requisição).
 * Use em Route Handlers passando o request para evitar 401 em chamadas da interface.
 */
export async function getCompanyIdFromRequest(request: Request): Promise<string | null> {
  const fromCookie = await getCompanyIdFromCookie();
  if (fromCookie) return fromCookie;
  const slug = request.headers.get(HEADER_COMPANY_SLUG)?.trim().toLowerCase();
  if (!slug) return null;
  const supabase = await createClient();
  const { data } = await supabase
    .from("company_links")
    .select("company_id")
    .eq("slug", slug)
    .eq("is_active", true)
    .single();
  return data?.company_id ?? null;
}
