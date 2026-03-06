"use server";

import { getRedisClient } from "@/lib/redis/client";

const KEY_PREFIX = "inbox:list:";
/** Lista de conversas: TTL curto para dados mais atualizados (fotos, status, atribuição). */
const TTL_SECONDS = 30;

/**
 * Chave de cache para lista de conversas (estado quente).
 * Usado para que a aplicação leia estado de tickets/conversas do Redis
 * em vez de bater no banco a cada requisição.
 */
function listKey(companyId: string, queueId: string, status: string, onlyAssigned: string): string {
  return `${KEY_PREFIX}${companyId}:${queueId}:${status}:${onlyAssigned}`;
}

/**
 * Retorna a lista de conversas do cache (estado quente), se existir.
 */
export async function getCachedConversationList(
  companyId: string,
  queueId: string,
  status: string,
  onlyAssigned: string
): Promise<{ data: unknown[]; total: number } | null> {
  const redis = await getRedisClient();
  if (!redis) return null;
  try {
    const key = listKey(companyId, queueId, status, onlyAssigned);
    const raw = await redis.get(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { data: unknown[]; total: number };
    return Array.isArray(parsed?.data) ? parsed : null;
  } catch {
    return null;
  }
}

/**
 * Grava a lista de conversas no cache (estado quente).
 */
export async function setCachedConversationList(
  companyId: string,
  queueId: string,
  status: string,
  onlyAssigned: string,
  payload: { data: unknown[]; total: number }
): Promise<void> {
  const redis = await getRedisClient();
  if (!redis) return;
  try {
    const key = listKey(companyId, queueId, status, onlyAssigned);
    await redis.set(key, JSON.stringify(payload), { EX: TTL_SECONDS });
  } catch {
    // ignore
  }
}

/**
 * Invalida todo o cache de listas de conversas da empresa.
 * Chamar quando uma conversa for criada/atualizada (webhook, PATCH, sync)
 * para que o estado quente reflita as mudanças.
 */
export async function invalidateConversationList(companyId: string): Promise<void> {
  const redis = await getRedisClient();
  if (!redis) return;
  try {
    const pattern = `${KEY_PREFIX}${companyId}:*`;
    const keys = await redis.keys(pattern);
    if (keys.length > 0) {
      await redis.del(keys);
    }
  } catch {
    // ignore
  }
}

const DETAIL_KEY_PREFIX = "inbox:detail:";
/** Detalhe da conversa (chat): TTL curto para mensagens e avatar atualizados. */
const DETAIL_TTL_SECONDS = 60;

/**
 * Cache do detalhe da conversa (mensagens + metadados) para abrir o chat rápido.
 * Evita múltiplas consultas ao banco ao clicar na conversa.
 */
export async function getCachedConversationDetail(
  conversationId: string
): Promise<Record<string, unknown> | null> {
  const redis = await getRedisClient();
  if (!redis) return null;
  try {
    const key = `${DETAIL_KEY_PREFIX}${conversationId}`;
    const raw = await redis.get(key);
    if (!raw) return null;
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return null;
  }
}

export async function setCachedConversationDetail(
  conversationId: string,
  payload: Record<string, unknown>
): Promise<void> {
  const redis = await getRedisClient();
  if (!redis) return;
  try {
    const key = `${DETAIL_KEY_PREFIX}${conversationId}`;
    await redis.set(key, JSON.stringify(payload), { EX: DETAIL_TTL_SECONDS });
  } catch {
    // ignore
  }
}

/**
 * Invalida o cache do detalhe de uma conversa (nova mensagem, PATCH).
 */
export async function invalidateConversationDetail(conversationId: string): Promise<void> {
  const redis = await getRedisClient();
  if (!redis) return;
  try {
    await redis.del(`${DETAIL_KEY_PREFIX}${conversationId}`);
  } catch {
    // ignore
  }
}
