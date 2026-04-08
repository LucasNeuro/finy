/**
 * Interpretação de data/hora em payloads UAZ/WhatsApp (/message/find, webhook).
 * Valores numéricos podem vir em segundos (Unix) ou milissegundos.
 */

/** Limite inferior plausível (2000-01-01) para ignorar ruído numérico em timestamps. */
export const UAZ_MIN_MESSAGE_TIME_MS = 946684800000;

/** Converte número UAZ (segundos ou ms) para milissegundos desde epoch. */
export function uazNumericTimeToMs(n: number): number {
  if (!Number.isFinite(n)) return NaN;
  if (n > 1e12) return Math.trunc(n);
  return Math.trunc(n * 1000);
}

export function parseLooseTimeToMs(raw: unknown): number {
  if (raw == null) return NaN;
  if (typeof raw === "string") {
    const s = raw.trim();
    if (!s) return NaN;
    const parsed = Date.parse(s);
    if (Number.isFinite(parsed)) return parsed;
    const n = Number(s);
    if (Number.isFinite(n)) return uazNumericTimeToMs(n);
    return NaN;
  }
  if (typeof raw === "number") return uazNumericTimeToMs(raw);
  return NaN;
}

const FLAT_KEYS = [
  "timestamp",
  "sent_at",
  "t",
  "time",
  "messageTimestamp",
  "ts",
  "createdAt",
  "created_at",
  "msgTimestamp",
] as const;

function tryKeys(obj: Record<string, unknown>): string | null {
  for (const k of FLAT_KEYS) {
    if (!(k in obj)) continue;
    const ms = parseLooseTimeToMs(obj[k]);
    if (Number.isFinite(ms) && ms > UAZ_MIN_MESSAGE_TIME_MS) return new Date(ms).toISOString();
  }
  return null;
}

/**
 * Extrai sent_at ISO a partir de uma mensagem retornada por /message/find ou similar.
 */
export function uazFindMessageSentAtIso(msg: Record<string, unknown>): string | null {
  const direct = tryKeys(msg);
  if (direct) return direct;
  const inner = msg.message;
  if (inner && typeof inner === "object") {
    const nested = tryKeys(inner as Record<string, unknown>);
    if (nested) return nested;
  }
  return null;
}
