import { getRedisClient } from "@/lib/redis/client";

/**
 * Quando `false`, o webhook resolve `uazapi_instance_id` → canal **só no Supabase** (sem get/set Redis).
 * Redis continua disponível para inbox (lista/detalhe/counts/mídia) e round-robin.
 *
 * `USE_REDIS_UAZ_INSTANCE_CACHE=false` ou `0` desliga. Padrão: ligado (compatível com deploys atuais).
 */
export function isUazInstanceWebhookRedisCacheEnabled(): boolean {
  const v = process.env.USE_REDIS_UAZ_INSTANCE_CACHE?.trim().toLowerCase();
  return v !== "false" && v !== "0";
}

/** Invalida cache usado pelo webhook para mapear instance → canal (evita eventos após excluir conexão). */
export async function invalidateUazInstanceWebhookCache(instanceId: string): Promise<void> {
  const id = (instanceId ?? "").trim();
  if (!id) return;
  const redis = await getRedisClient();
  if (!redis) return;
  const redisNs = (process.env.REDIS_NAMESPACE?.trim() || process.env.NODE_ENV || "dev").replace(/\s+/g, "_");
  const cacheKeyV2 = `${redisNs}:uaz:instance:v2:${id}`;
  const cacheKeyLegacy = `uaz:instance:${id}`;
  await Promise.all([redis.del(cacheKeyV2), redis.del(cacheKeyLegacy)]).catch(() => {});
}
