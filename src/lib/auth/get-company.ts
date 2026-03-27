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
 * Obtém company_id: primeiro do header X-Company-Slug (enviado pela interface), depois do cookie.
 * Assim evitamos 401 quando o cookie não chega na requisição (ex.: em produção).
 */
export async function getCompanyIdFromRequest(request: Request): Promise<string | null> {
  const slugFromHeader = request.headers.get(HEADER_COMPANY_SLUG)?.trim().toLowerCase();
  if (slugFromHeader) {
    const supabase = await createClient();
    const { data } = await supabase
      .from("company_links")
      .select("company_id")
      .ilike("slug", slugFromHeader)
      .eq("is_active", true)
      .limit(1)
      .maybeSingle();
    if (data?.company_id) return data.company_id;
  }
  const fromCookie = await getCompanyIdFromCookie();
  return fromCookie;
}
