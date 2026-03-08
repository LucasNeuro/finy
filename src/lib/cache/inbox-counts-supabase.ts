import { createServiceRoleClient } from "@/lib/supabase/admin";

const CACHE_TTL_SECONDS = 45;

export type InboxCountsPayload = {
  mine: number;
  queues: number;
  individual: number;
  groups: number;
  unassigned: number;
};

/**
 * Lê contagens do cache em Supabase (tabela inbox_counts_cache).
 * Válido apenas se updated_at está dentro do TTL (45s).
 * Usado quando não há Redis ou em caso de Redis miss.
 */
export async function getCachedCountsFromSupabase(
  companyId: string,
  userId: string
): Promise<InboxCountsPayload | null> {
  if (!userId) return null;
  try {
    const supabase = createServiceRoleClient();
    const cutoff = new Date(Date.now() - CACHE_TTL_SECONDS * 1000).toISOString();
    const { data, error } = await supabase
      .from("inbox_counts_cache")
      .select("mine, queues, individual, groups, unassigned, updated_at")
      .eq("company_id", companyId)
      .eq("user_id", userId)
      .gte("updated_at", cutoff)
      .maybeSingle();

    if (error || !data) return null;
    return {
      mine: typeof data.mine === "number" ? data.mine : 0,
      queues: typeof data.queues === "number" ? data.queues : 0,
      individual: typeof data.individual === "number" ? data.individual : 0,
      groups: typeof data.groups === "number" ? data.groups : 0,
      unassigned: typeof (data as { unassigned?: number }).unassigned === "number" ? (data as { unassigned: number }).unassigned : 0,
    };
  } catch {
    return null;
  }
}

/**
 * Grava contagens no cache Supabase.
 * Chamado após calcular as contagens na API.
 */
export async function setCachedCountsInSupabase(
  companyId: string,
  userId: string,
  payload: InboxCountsPayload
): Promise<void> {
  if (!userId) return;
  try {
    const supabase = createServiceRoleClient();
    await supabase.from("inbox_counts_cache").upsert(
      {
        company_id: companyId,
        user_id: userId,
        mine: payload.mine,
        queues: payload.queues,
        individual: payload.individual,
        groups: payload.groups,
        unassigned: payload.unassigned,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "company_id,user_id" }
    );
  } catch {
    // ignorar falha de escrita no cache
  }
}

/**
 * Invalida o cache de contagens da empresa (todas as linhas da empresa).
 * Chamar quando conversas forem criadas/alteradas (webhook, PATCH, sync, etc.).
 */
export async function invalidateCountsInSupabase(companyId: string): Promise<void> {
  try {
    const supabase = createServiceRoleClient();
    await supabase.from("inbox_counts_cache").delete().eq("company_id", companyId);
  } catch {
    // ignorar
  }
}
