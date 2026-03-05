"use server";

import { getRedisClient } from "@/lib/redis/client";

const KEY_PREFIX = "inbox:list:";
const TTL_SECONDS = 45;

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
