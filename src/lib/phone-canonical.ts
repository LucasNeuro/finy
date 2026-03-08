/**
 * Normalização canônica de números de telefone (Brasil e JID WhatsApp).
 * Usar em todo lugar que gravar ou buscar por external_id / customer_phone / jid / phone,
 * para evitar duplicatas e falhas de envio ("number is not on WhatsApp").
 *
 * Formato canônico contato Brasil: 55 + DDD (2) + 9 dígitos (celular).
 * Grupos: JID mantido como está (@g.us).
 */

/** Corrige número Brasil malformado:
 * - DDD+0+8 dígitos → DDD+9+8 (celular)
 * - 55+DDD+0+8 → 55+DDD+9+8
 * - 55+DDD+8 dígitos (6/7/8) = celular sem o 9 → insere 9 (11 ou 12 dígitos após 55)
 */
export function fixBrazilMobileZero(d: string): string {
  if (d.length === 11 && !d.startsWith("55")) {
    const ddd = d.slice(0, 2);
    const rest = d.slice(2);
    if (/^\d{2}$/.test(ddd) && rest.length >= 9 && rest[0] === "0") return ddd + "9" + rest.slice(1, 9);
  }
  if (d.length === 13 && d.startsWith("55")) {
    const after55 = d.slice(2);
    if (after55.length >= 9 && after55[2] === "0") {
      const ddd = after55.slice(0, 2);
      const rest = after55.slice(2, 11);
      if (/^\d{2}$/.test(ddd) && rest[0] === "0") return "55" + ddd + "9" + rest.slice(1);
    }
    // Celular sem o 9: 55+DDD+8 dígitos (primeiro 6/7/8) → 55+DDD+9+8
    if (after55.length === 11 && /^[678]/.test(after55[2]!)) {
      const ddd = after55.slice(0, 2);
      const rest = after55.slice(2, 11);
      if (/^\d{2}$/.test(ddd) && rest.length === 8) return "55" + ddd + "9" + rest;
    }
  }
  // 12 dígitos 55+DDD+8 (primeiro da parte local 6/7/8) = celular sem o 9 → inserir 9
  if (d.length === 12 && d.startsWith("55")) {
    const after55 = d.slice(2);
    if (/^\d{2}[678]\d{7}$/.test(after55)) return "55" + after55.slice(0, 2) + "9" + after55.slice(2);
  }
  return d;
}

/** Retorna dígitos canônicos para Brasil (55+DDD+9 dígitos) ou o próprio valor se não for número BR. */
export function toCanonicalDigits(raw: string | null | undefined): string | null {
  if (raw == null || raw === "") return null;
  let d = (raw ?? "").replace(/\D/g, "");
  if (!d) return null;
  d = fixBrazilMobileZero(d);
  if (d.length === 10 || d.length === 11) return "55" + d;
  if ((d.length === 12 || d.length === 13) && d.startsWith("55")) return d;
  if ((d.length === 14 || d.length === 15) && !d.startsWith("55")) {
    const ddd = d.slice(0, 2);
    const mobile = d.slice(2, 11);
    if (/^\d{2}$/.test(ddd) && /^\d{9}$/.test(mobile)) return "55" + ddd + mobile;
  }
  return d;
}

/** Para grupos retorna o valor; para contato retorna dígitos canônicos (string vazia se inválido). */
export function toCanonicalPhone(digits: string, isGroup: boolean): string {
  if (isGroup || !digits) return (digits ?? "").trim();
  const canonical = toCanonicalDigits(digits);
  return canonical ?? (digits.replace(/\D/g, "") || "");
}

/**
 * Normaliza JID para uso como external_id / jid em conversas e channel_contacts.
 * - Grupo: mantém @g.us
 * - Contato: dígitos canônicos + @s.whatsapp.net (evita LID e formatos diferentes)
 */
export function toCanonicalJid(rawJidOrDigits: string, isGroup: boolean): string {
  if (isGroup) {
    const s = (rawJidOrDigits ?? "").trim().toLowerCase();
    if (s.endsWith("@g.us")) return s;
    const digits = s.replace(/\D/g, "").replace(/@.*$/, "");
    return digits ? `${digits}@g.us` : s;
  }
  const digits = (rawJidOrDigits ?? "").replace(/\D/g, "").replace(/@.*$/, "").trim();
  const canonical = toCanonicalDigits(digits);
  return canonical ? `${canonical}@s.whatsapp.net` : rawJidOrDigits.trim();
}

/** Normaliza JID bruto: @lid → @s.whatsapp.net; garante sufixo para contato. */
export function normalizeWhatsAppJid(raw: string): string {
  const s = (raw ?? "").trim();
  if (!s) return "";
  if (s.endsWith("@g.us")) return s.toLowerCase();
  const normalized = s.replace(/@lid$/i, "@s.whatsapp.net");
  if (normalized.includes("@")) return normalized.toLowerCase();
  const digits = normalized.replace(/\D/g, "");
  return digits ? `${digits}@s.whatsapp.net` : s;
}

/** Extrai só dígitos de número/JID. */
export function phoneDigitsOnly(raw: string): string {
  return (raw ?? "").replace(/\D/g, "");
}

/** Normaliza número para envio UAZAPI: 55+DDD+9 dígitos para Brasil (contato). Grupos: retorna como está. */
export function normalizePhoneForSend(raw: string | null | undefined, isGroup: boolean): string {
  if (isGroup || !raw) return (raw ?? "").trim();
  const canonical = toCanonicalDigits(raw);
  return canonical ?? (raw.replace(/\D/g, "") || "").trim();
}
