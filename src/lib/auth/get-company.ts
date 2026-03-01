import { cookies } from "next/headers";

const COOKIE_COMPANY_ID = "clicvend_company_id";
const COOKIE_SLUG = "clicvend_slug";

export async function getCompanyIdFromCookie(): Promise<string | null> {
  const store = await cookies();
  return store.get(COOKIE_COMPANY_ID)?.value ?? null;
}

export async function getSlugFromCookie(): Promise<string | null> {
  const store = await cookies();
  return store.get(COOKIE_SLUG)?.value ?? null;
}
