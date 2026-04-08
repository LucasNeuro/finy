import { createServiceRoleClient } from "@/lib/supabase/admin";
import { getNextAgentForQueue } from "@/lib/queue/round-robin";
import { toCanonicalDigits } from "@/lib/phone-canonical";

const PHONE_CHUNK = 100;
const UPSERT_BATCH = 150;

/**
 * Após sincronizar channel_contacts do canal, cria linhas em commercial_contact_owners
 * para números ainda sem carteira, na fila comercial padrão do canal (is_default ou primeira comercial).
 * Não altera donos já existentes (upsert com ignoreDuplicates).
 */
export async function syncCommercialLeadsAfterChannelContactsSync(params: {
  companyId: string;
  channelId: string;
}): Promise<{ candidates: number }> {
  const supabase = createServiceRoleClient();

  const { data: cqRows, error: cqErr } = await supabase
    .from("channel_queues")
    .select("queue_id, is_default")
    .eq("channel_id", params.channelId)
    .eq("company_id", params.companyId);

  if (cqErr || !cqRows?.length) {
    return { candidates: 0 };
  }

  const linkedIds = [...new Set(cqRows.map((r: { queue_id: string }) => r.queue_id).filter(Boolean))];
  if (linkedIds.length === 0) return { candidates: 0 };

  const { data: queueRows, error: qErr } = await supabase
    .from("queues")
    .select("id, name")
    .eq("company_id", params.companyId)
    .eq("queue_type", "commercial")
    .in("id", linkedIds)
    .order("name");

  if (qErr || !queueRows?.length) {
    return { candidates: 0 };
  }

  const defaultRow = cqRows.find(
    (r: { queue_id: string; is_default?: boolean | null }) =>
      r.is_default === true && queueRows.some((q: { id: string }) => q.id === r.queue_id)
  );
  const targetQueueId =
    (defaultRow as { queue_id: string } | undefined)?.queue_id ??
    (queueRows[0] as { id: string }).id;

  const { data: contactRows, error: contactsErr } = await supabase
    .from("channel_contacts")
    .select("phone")
    .eq("channel_id", params.channelId)
    .eq("company_id", params.companyId)
    .not("phone", "is", null);

  if (contactsErr || !contactRows?.length) {
    return { candidates: 0 };
  }

  const phonesUnique = new Set<string>();
  for (const row of contactRows as { phone: string | null }[]) {
    const raw = row.phone;
    if (!raw) continue;
    const c = toCanonicalDigits(String(raw).replace(/\D/g, "")) ?? String(raw).replace(/\D/g, "");
    if (c) phonesUnique.add(c);
  }

  const phones = [...phonesUnique];
  if (phones.length === 0) return { candidates: 0 };

  const existing = new Set<string>();
  for (let i = 0; i < phones.length; i += PHONE_CHUNK) {
    const chunk = phones.slice(i, i + PHONE_CHUNK);
    const { data: owners } = await supabase
      .from("commercial_contact_owners")
      .select("phone_canonical")
      .eq("company_id", params.companyId)
      .eq("channel_id", params.channelId)
      .in("phone_canonical", chunk);
    for (const o of owners ?? []) {
      const p = (o as { phone_canonical: string }).phone_canonical;
      if (p) existing.add(p);
    }
  }

  const toInsert = phones.filter((p) => !existing.has(p));
  if (toInsert.length === 0) return { candidates: 0 };

  const rows: Array<{
    company_id: string;
    channel_id: string;
    queue_id: string;
    phone_canonical: string;
    owner_user_id: string;
    source: string;
  }> = [];

  for (const phone_canonical of toInsert) {
    const ownerUserId = await getNextAgentForQueue(params.companyId, targetQueueId);
    if (!ownerUserId) continue;
    rows.push({
      company_id: params.companyId,
      channel_id: params.channelId,
      queue_id: targetQueueId,
      phone_canonical,
      owner_user_id: ownerUserId,
      source: "contact_sync",
    });
  }

  if (rows.length === 0) return { candidates: 0 };

  for (let i = 0; i < rows.length; i += UPSERT_BATCH) {
    const batch = rows.slice(i, i + UPSERT_BATCH);
    const { error } = await supabase.from("commercial_contact_owners").upsert(batch, {
      onConflict: "company_id,channel_id,phone_canonical",
      ignoreDuplicates: true,
    });
    if (error && process.env.NODE_ENV !== "test") {
      console.error("[sync-commercial-leads]", error.message);
    }
  }

  return { candidates: rows.length };
}
