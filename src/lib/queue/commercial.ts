import { toCanonicalDigits } from "@/lib/phone-canonical";

type SupabaseLike = {
  from: (table: string) => {
    select: (columns: string) => any;
  };
};

export type CommercialOwnerRow = {
  id: string;
  company_id: string;
  channel_id: string;
  queue_id: string;
  phone_canonical: string;
  owner_user_id: string;
  source: string;
  notes: string | null;
  created_at: string;
};

/**
 * Busca o dono de um contato na carteira comercial.
 * Retorna null se não houver dono ou se a tabela ainda não existir.
 * Usado no webhook e em find-or-create para rotear antes do round-robin.
 */
export async function getCommercialContactOwner(
  supabase: SupabaseLike,
  companyId: string,
  channelId: string,
  phone: string
): Promise<CommercialOwnerRow | null> {
  if (!phone) return null;
  const canonical = toCanonicalDigits(phone.replace(/\D/g, "")) ?? phone.replace(/\D/g, "");
  if (!canonical) return null;

  try {
    const { data, error } = await (supabase as any)
      .from("commercial_contact_owners")
      .select("id, company_id, channel_id, queue_id, phone_canonical, owner_user_id, source, notes, created_at")
      .eq("company_id", companyId)
      .eq("channel_id", channelId)
      .eq("phone_canonical", canonical)
      .maybeSingle();

    if (error) {
      // Tabela ainda não existe (migration não rodou) — fallback silencioso
      if (
        error.message?.toLowerCase().includes("commercial_contact_owners") &&
        error.message?.toLowerCase().includes("does not exist")
      ) {
        return null;
      }
      return null;
    }
    return (data as CommercialOwnerRow) ?? null;
  } catch {
    return null;
  }
}

/**
 * Registra ou atualiza o dono de um contato na carteira comercial.
 * Usa upsert por (company_id, channel_id, phone_canonical).
 */
export async function upsertCommercialContactOwner(
  supabase: SupabaseLike,
  params: {
    companyId: string;
    channelId: string;
    queueId: string;
    phone: string;
    ownerUserId: string;
    source?: string;
    notes?: string;
  }
): Promise<CommercialOwnerRow | null> {
  const canonical =
    toCanonicalDigits(params.phone.replace(/\D/g, "")) ?? params.phone.replace(/\D/g, "");
  if (!canonical) return null;

  try {
    const { data, error } = await (supabase as any)
      .from("commercial_contact_owners")
      .upsert(
        {
          company_id: params.companyId,
          channel_id: params.channelId,
          queue_id: params.queueId,
          phone_canonical: canonical,
          owner_user_id: params.ownerUserId,
          source: params.source ?? "manual",
          notes: params.notes ?? null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "company_id,channel_id,phone_canonical" }
      )
      .select("id, company_id, channel_id, queue_id, phone_canonical, owner_user_id, source, notes, created_at")
      .single();

    if (error) return null;
    return (data as CommercialOwnerRow) ?? null;
  } catch {
    return null;
  }
}

/**
 * Remove o dono de um contato da carteira comercial.
 */
export async function removeCommercialContactOwner(
  supabase: SupabaseLike,
  companyId: string,
  channelId: string,
  phone: string
): Promise<boolean> {
  const canonical =
    toCanonicalDigits(phone.replace(/\D/g, "")) ?? phone.replace(/\D/g, "");
  if (!canonical) return false;

  try {
    const { error } = await (supabase as any)
      .from("commercial_contact_owners")
      .delete()
      .eq("company_id", companyId)
      .eq("channel_id", channelId)
      .eq("phone_canonical", canonical);

    return !error;
  } catch {
    return false;
  }
}

function isQueueTypeMissingColumn(message: string): boolean {
  const lower = (message || "").toLowerCase();
  return lower.includes("queue_type") && lower.includes("does not exist");
}

export async function getCommercialQueueIdSet(
  supabase: SupabaseLike,
  companyId: string,
  queueIds?: string[] | null
): Promise<Set<string>> {
  try {
    let q = supabase
      .from("queues")
      .select("id, queue_type")
      .eq("company_id", companyId)
      .eq("queue_type", "commercial");

    if (Array.isArray(queueIds)) {
      if (queueIds.length === 0) return new Set<string>();
      q = q.in("id", queueIds);
    }

    const { data, error } = await q;
    if (error) {
      if (isQueueTypeMissingColumn(error.message)) return new Set<string>();
      return new Set<string>();
    }
    const rows = (data ?? []) as Array<{ id: string }>;
    return new Set(rows.map((r) => r.id));
  } catch {
    return new Set<string>();
  }
}

export async function isCommercialQueue(
  supabase: SupabaseLike,
  companyId: string,
  queueId: string | null | undefined
): Promise<boolean> {
  if (!queueId) return false;
  const ids = await getCommercialQueueIdSet(supabase, companyId, [queueId]);
  return ids.has(queueId);
}
