/**
 * Helpers para channel_contacts — evita duplicação.
 * Sempre verificar antes de inserir: busca por (channel_id, jid) ou (channel_id, phone).
 */

import { toCanonicalDigits } from "@/lib/phone-canonical";
import type { SupabaseClient } from "@supabase/supabase-js";

export type ChannelContactRow = {
  channel_id: string;
  company_id: string;
  jid: string;
  phone: string | null;
  contact_name: string | null;
  first_name: string | null;
  synced_at?: string;
  avatar_url?: string | null;
};

/**
 * Garante que não há duplicata antes de inserir/atualizar.
 * 1) Busca por (channel_id, jid)
 * 2) Se não achar, busca por (channel_id, phone) — pode existir com JID diferente
 * 3) Se achar por phone: atualiza a linha existente (consolida JID canônico)
 * 4) Se não achar: upsert
 * Retorna o id do contato (para uso em contact-tags).
 */
export async function upsertChannelContactNoDuplicate(
  supabase: SupabaseClient,
  channelId: string,
  companyId: string,
  row: ChannelContactRow
): Promise<{ id: string | null; error: Error | null }> {
  const canonicalDigits = toCanonicalDigits(row.phone ?? row.jid?.replace(/@.*$/, "") ?? null);
  const canonicalJid = canonicalDigits ? `${canonicalDigits}@s.whatsapp.net` : row.jid;

  // 1) Já existe com este JID? Upsert direto.
  const { data: byJid } = await supabase
    .from("channel_contacts")
    .select("id")
    .eq("channel_id", channelId)
    .eq("company_id", companyId)
    .eq("jid", canonicalJid)
    .limit(1)
    .maybeSingle();

  if (byJid?.id) {
    const { error } = await supabase
      .from("channel_contacts")
      .update({
        phone: canonicalDigits || row.phone || null,
        contact_name: row.contact_name,
        first_name: row.first_name,
        synced_at: row.synced_at ?? new Date().toISOString(),
        ...(row.avatar_url != null && { avatar_url: row.avatar_url }),
      })
      .eq("id", byJid.id);
    return { id: byJid.id, error: error ? new Error(error.message) : null };
  }

  // 2) Existe com mesmo phone mas JID diferente? Atualiza para consolidar.
  if (canonicalDigits) {
    const { data: byPhone } = await supabase
      .from("channel_contacts")
      .select("id, jid")
      .eq("channel_id", channelId)
      .eq("company_id", companyId)
      .eq("phone", canonicalDigits)
      .limit(1)
      .maybeSingle();

    if (byPhone?.id) {
      const { error } = await supabase
        .from("channel_contacts")
        .update({
          jid: canonicalJid,
          phone: canonicalDigits,
          contact_name: row.contact_name,
          first_name: row.first_name,
          synced_at: row.synced_at ?? new Date().toISOString(),
          ...(row.avatar_url != null && { avatar_url: row.avatar_url }),
        })
        .eq("id", byPhone.id);
      return { id: byPhone.id, error: error ? new Error(error.message) : null };
    }
  }

  // 3) Não existe: upsert
  const { error } = await supabase
    .from("channel_contacts")
    .upsert(
      {
        channel_id: channelId,
        company_id: companyId,
        jid: canonicalJid,
        phone: canonicalDigits || row.phone || null,
        contact_name: row.contact_name,
        first_name: row.first_name,
        synced_at: row.synced_at ?? new Date().toISOString(),
        ...(row.avatar_url != null && { avatar_url: row.avatar_url }),
      },
      { onConflict: "channel_id,jid", ignoreDuplicates: false }
    );
  if (error) return { id: null, error: new Error(error.message) };
  // Busca o id após upsert (Supabase não retorna por padrão)
  const { data: found } = await supabase
    .from("channel_contacts")
    .select("id")
    .eq("channel_id", channelId)
    .eq("company_id", companyId)
    .eq("jid", canonicalJid)
    .limit(1)
    .maybeSingle();
  return { id: found?.id ?? null, error: null };
}
