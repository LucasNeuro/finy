import { createClient } from "@supabase/supabase-js";
import { fetchWithTimeout } from "./fetch-with-timeout";

/**
 * Cliente Supabase com service role para uso no backend (webhook, jobs).
 * Bypassa RLS. NUNCA exponha esta chave no front-end.
 */
export function createServiceRoleClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  }
  return createClient(url, key, { fetch: fetchWithTimeout });
}
