import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Slugs de status encerrados por empresa (company_ticket_statuses.is_closed).
 * Normaliza para minúsculas como em PATCH /conversations/[id]. Sempre inclui "closed".
 */
export async function fetchClosedTicketStatusSlugs(
  supabase: SupabaseClient,
  companyId: string
): Promise<string[]> {
  const fallback = ["closed"];
  try {
    const { data } = await supabase
      .from("company_ticket_statuses")
      .select("slug")
      .eq("company_id", companyId)
      .eq("is_closed", true);
    const set = new Set<string>();
    for (const r of (data ?? []) as { slug?: string | null }[]) {
      const s = String(r.slug ?? "").trim().toLowerCase();
      if (s) set.add(s);
    }
    for (const s of fallback) set.add(s);
    return [...set];
  } catch {
    return fallback;
  }
}

/**
 * Encadeia .neq("status", slug) para cada status encerrado.
 * Retorno `any` evita inferência recursiva profunda do client Supabase.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function excludeClosedTicketStatuses(query: any, closedSlugs: string[]): any {
  let q = query;
  for (const s of closedSlugs) {
    q = q.neq("status", s);
  }
  return q;
}

/** Compara com slugs já normalizados em minúsculas (igual a PATCH de conversa). */
export function isConversationStatusClosed(
  status: string | null | undefined,
  closedSlugsLowercase: string[]
): boolean {
  const s = String(status ?? "").trim().toLowerCase();
  if (!s) return false;
  return closedSlugsLowercase.includes(s);
}

/** PATCH de encerramento grava tombstone `closed:<conversation_id>:<ts>` — não reutilizar esse ticket pelo webhook. */
export function isClosedTicketTombstoneExternalId(externalId: string | null | undefined): boolean {
  return String(externalId ?? "").trim().toLowerCase().startsWith("closed:");
}
