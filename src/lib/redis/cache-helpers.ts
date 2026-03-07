
import { getRedisClient } from "@/lib/redis/client";

const PREFIX = "app:";

/**
 * Cache genérico para APIs (Contatos, Cargos, Filas).
 * Reduz carga no banco e evita travamentos ao trocar de tela.
 */
export async function getCached<T>(key: string): Promise<T | null> {
  const redis = await getRedisClient();
  if (!redis) return null;
  try {
    const raw = await redis.get(`${PREFIX}${key}`);
    if (!raw) return null;
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export async function setCached(key: string, value: unknown, ttlSeconds: number): Promise<void> {
  const redis = await getRedisClient();
  if (!redis) return;
  try {
    await redis.set(`${PREFIX}${key}`, JSON.stringify(value), { EX: ttlSeconds });
  } catch {
    // ignore
  }
}

/** Invalida todas as chaves que começam com o prefixo (ex: "contacts:companyId"). */
export async function invalidateByPrefix(prefix: string): Promise<void> {
  const redis = await getRedisClient();
  if (!redis) return;
  try {
    const pattern = `${PREFIX}${prefix}*`;
    const keys = await redis.keys(pattern);
    if (keys.length > 0) await redis.del(keys);
  } catch {
    // ignore
  }
}

/** Chaves e TTLs para Contatos, Cargos e Filas */
export const CACHE_KEYS = {
  contacts: (companyId: string, channelId?: string) =>
    `contacts:${companyId}:${channelId ?? "all"}`,
  roles: (companyId: string) => `roles:${companyId}`,
  queues: (companyId: string) => `queues:${companyId}`,
} as const;

export const CACHE_TTL = {
  contacts: 60,
  roles: 120,
  queues: 90,
} as const;
