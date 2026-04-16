import { phoneDigitsOnly, toCanonicalDigits } from "@/lib/phone-canonical";

export type ConversationIdentityRow = {
  id: string;
  status?: string | null;
  external_id?: string | null;
  wa_chat_jid?: string | null;
  customer_phone?: string | null;
};

/**
 * Extrai dígitos canônicos BR (55+DDD+9) a partir dos campos da conversa.
 * Cobre customer_phone mal formatado e JID @s.whatsapp.net / legado sem merge.
 */
export function canonicalDigitsFromConversationRow(r: ConversationIdentityRow): string | null {
  const fromPhone = toCanonicalDigits(String(r.customer_phone ?? "").trim());
  if (fromPhone) return fromPhone;

  for (const jid of [String(r.external_id ?? "").trim(), String(r.wa_chat_jid ?? "").trim()]) {
    if (!jid) continue;
    const local = jid.split("@")[0] ?? "";
    const d = phoneDigitsOnly(local);
    if (d.length >= 10 && d.length <= 15) {
      const c = toCanonicalDigits(d);
      if (c) return c;
    }
  }
  return null;
}

/**
 * Entre tickets abertos do canal, encontra o que representa o mesmo WhatsApp (mesmo número canônico).
 * Usado quando LID/PN ou sync gravaram external_id/customer_phone em formatos diferentes.
 */
export function findOpenTicketMatchingCanonicalDigits(
  rows: ConversationIdentityRow[],
  canonicalDigits: string
): ConversationIdentityRow | null {
  if (!canonicalDigits) return null;
  for (const r of rows) {
    const c = canonicalDigitsFromConversationRow(r);
    if (c === canonicalDigits) return r;
  }
  return null;
}
