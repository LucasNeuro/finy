/**
 * Ordem cronológica estável para bolhas no chat: empate em `sent_at` (ex.: mesmo minuto)
 * não deve embaralhar mensagens entre si.
 */
export function compareMessagesChronologically(
  a: { sent_at?: string; id?: string },
  b: { sent_at?: string; id?: string }
): number {
  const ta = new Date(String(a?.sent_at ?? 0)).getTime();
  const tb = new Date(String(b?.sent_at ?? 0)).getTime();
  if (ta !== tb) return ta - tb;
  return String(a?.id ?? "").localeCompare(String(b?.id ?? ""));
}
