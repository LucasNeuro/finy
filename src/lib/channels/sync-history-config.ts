/**
 * Defaults para sincronização de histórico (UAZAPI → Postgres).
 * Últimas N mensagens **somente texto** por chat (mídias não entram na contagem nem são gravadas neste fluxo).
 */
export const SYNC_HISTORY_DEFAULT_MESSAGES_PER_CHAT = 200;

const MAX_CAP = 8000;

/** Base: SYNC_HISTORY_MAX_MESSAGES_PER_CHAT ou 200. */
export function getSyncHistoryMessagesPerChatFromEnv(): number {
  const env = Number(process.env.SYNC_HISTORY_MAX_MESSAGES_PER_CHAT);
  if (Number.isFinite(env) && env > 0) {
    return Math.min(MAX_CAP, Math.floor(env));
  }
  return SYNC_HISTORY_DEFAULT_MESSAGES_PER_CHAT;
}

/** Limite por requisição (body/query), com teto absoluto. */
export function clampMessagesPerChat(raw: number | undefined, fallback: number): number {
  if (raw === undefined || !Number.isFinite(raw) || raw <= 0) return fallback;
  return Math.min(Math.max(Math.floor(raw), 1), MAX_CAP);
}

/**
 * Teto de mensagens inseridas numa única passada de sync (soma de todos os chats).
 * Default: cobre pelo menos ~100 chats × mensagens/chat (ex.: 100×200) sem parar no meio.
 * Override: SYNC_HISTORY_MAX_TOTAL_MESSAGES
 */
export function getSyncHistoryMaxTotalMessagesInserted(targetMessagesPerChat: number): number {
  const env = Number(process.env.SYNC_HISTORY_MAX_TOTAL_MESSAGES);
  if (Number.isFinite(env) && env > 0) {
    return Math.min(250_000, Math.floor(env));
  }
  const per = Math.max(1, Math.min(MAX_CAP, Math.floor(targetMessagesPerChat)));
  return Math.min(120_000, Math.max(35_000, per * 180));
}
