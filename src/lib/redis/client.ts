"use server";

import { createClient, type RedisClientType } from "redis";

let client: RedisClientType | null = null;
let connecting: Promise<RedisClientType | null> | null = null;
/** Após falha de conexão, não tentar de novo até reiniciar (evita log em toda requisição). */
let connectionFailed = false;

/**
 * Parse REDIS_HOST aceitando "host" ou "host:port".
 */
function parseRedisHost(hostStr: string): { host: string; port: number } {
  const trimmed = hostStr.trim();
  const idx = trimmed.lastIndexOf(":");
  if (idx > 0) {
    const host = trimmed.slice(0, idx);
    const port = parseInt(trimmed.slice(idx + 1), 10);
    if (!Number.isNaN(port)) return { host, port };
  }
  return { host: trimmed, port: Number(process.env.REDIS_PORT || 6379) };
}

/**
 * Retorna um cliente Redis conectado ou null se não houver configuração ou se a conexão falhou.
 * Opcional: a aplicação funciona 100% só com Supabase; Redis só acelera lista de conversas e cache.
 *
 * Para ativar Redis (local ou Redis Labs / Render), defina:
 * - USE_REDIS=true  (ou 1)
 * - REDIS_HOST=hostname  ou  hostname:port
 * - REDIS_PORT=15295  (se não vier em REDIS_HOST)
 * - REDIS_USERNAME=default  (Redis Labs)
 * - REDIS_PASSWORD=...
 * Ou use REDIS_URL=redis://username:password@host:port (com autenticação).
 */
export async function getRedisClient(): Promise<RedisClientType | null> {
  try {
  if (connectionFailed) return null;

  const useRedis = process.env.USE_REDIS === "true" || process.env.USE_REDIS === "1";
  const redisDisabled = process.env.USE_REDIS === "false" || process.env.USE_REDIS === "0" || process.env.USE_REDIS === "";
  if (!useRedis || redisDisabled) return null;

  if (client) return client;

  const url = process.env.REDIS_URL?.trim();
  const hostRaw = process.env.REDIS_HOST?.trim();
  const username = process.env.REDIS_USERNAME?.trim();
  const password = process.env.REDIS_PASSWORD;

  // REDIS_URL com auth (redis://user:pass@host:port) tem prioridade
  if (url && url.includes("@")) {
    try {
      const c = createClient({ url });
      c.on("error", (err) => console.warn("Redis error (cache desativado):", err.message));
      await c.connect();
      client = c as RedisClientType;
      return client;
    } catch (err) {
      connectionFailed = true;
      if (process.env.NODE_ENV !== "test") {
        console.warn("Redis não disponível — verifique REDIS_URL e credenciais.");
      }
      return null;
    } finally {
      connecting = null;
    }
  }

  // Conexão por host + port + username + password (alinhado ao .env e Redis Labs)
  if (!hostRaw) return null;

  if (client) return client;

  if (!connecting) {
    connecting = (async (): Promise<RedisClientType | null> => {
      try {
        const { host, port } = parseRedisHost(hostRaw);
        const c = createClient({
          socket: { host, port },
          username: username || undefined,
          password: password || undefined,
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
          console.warn("Redis não disponível — usando apenas Supabase. Verifique REDIS_HOST, REDIS_PORT, REDIS_USERNAME e REDIS_PASSWORD.");
        }
        return null;
      } finally {
        connecting = null;
      }
    })();
  }

  return connecting;
  } catch {
    connectionFailed = true;
    return null;
  }
}

