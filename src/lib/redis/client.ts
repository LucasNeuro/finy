"use server";

import { createClient, type RedisClientType } from "redis";

let client: RedisClientType | null = null;
let connecting: Promise<RedisClientType | null> | null = null;
/** Após falha de conexão, não tentar de novo até reiniciar (evita log em toda requisição). */
let connectionFailed = false;

/**
 * Retorna um cliente Redis conectado ou null se não houver configuração ou se a conexão falhou.
 * Opcional: a aplicação funciona 100% só com Supabase; Redis só acelera lista de conversas e cache do webhook.
 *
 * Para ativar Redis (local ou Render), defina:
 * - USE_REDIS=true  (ou 1) — sem isso, nunca tenta conectar (evita erro com URL inacessível).
 * - REDIS_URL=redis://user:pass@host:port
 * Ou REDIS_HOST + REDIS_PORT + REDIS_USERNAME / REDIS_PASSWORD
 */
export async function getRedisClient(): Promise<RedisClientType | null> {
  if (connectionFailed) return null;

  const useRedis = process.env.USE_REDIS === "true" || process.env.USE_REDIS === "1";
  const redisDisabled = process.env.USE_REDIS === "false" || process.env.USE_REDIS === "0" || process.env.USE_REDIS === "";
  if (!useRedis || redisDisabled) return null;

  const url = process.env.REDIS_URL?.trim();
  const host = process.env.REDIS_HOST?.trim();

  if (!url && !host) {
    return null;
  }

  if (client) {
    return client;
  }

  if (!connecting) {
    connecting = (async (): Promise<RedisClientType | null> => {
      try {
        const c = url
          ? createClient({ url })
          : createClient({
              socket: {
                host: host as string,
                port: Number(process.env.REDIS_PORT || 6379),
              },
              username: process.env.REDIS_USERNAME,
              password: process.env.REDIS_PASSWORD,
            });

        c.on("error", (err) => {
          console.warn("Redis error (cache desativado):", err.message);
        });

        await c.connect();
        client = c as RedisClientType;
        return client;
      } catch (err) {
        connectionFailed = true;
        if (process.env.NODE_ENV !== "test") {
          console.warn("Redis não disponível — usando apenas Supabase. Para ativar cache, configure REDIS_URL corretamente.");
        }
        return null;
      } finally {
        connecting = null;
      }
    })();
  }

  return connecting;
}

