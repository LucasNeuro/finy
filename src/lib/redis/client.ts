"use server";

import { createClient, type RedisClientType } from "redis";

let client: RedisClientType | null = null;
let connecting: Promise<void | RedisClientType> | null = null;

/**
 * Retorna um cliente Redis conectado ou null se não houver configuração.
 * Lê as credenciais de:
 * - REDIS_URL (ex.: redis://user:pass@host:port), ou
 * - REDIS_HOST / REDIS_PORT / REDIS_USERNAME / REDIS_PASSWORD.
 */
export async function getRedisClient(): Promise<RedisClientType | null> {
  const url = process.env.REDIS_URL;
  const host = process.env.REDIS_HOST;

  if (!url && !host) {
    return null;
  }

  if (client) {
    return client;
  }

  if (!connecting) {
    client = url
      ? createClient({ url })
      : createClient({
          socket: {
            host: host as string,
            port: Number(process.env.REDIS_PORT || 6379),
          },
          username: process.env.REDIS_USERNAME,
          password: process.env.REDIS_PASSWORD,
        });

    client.on("error", (err) => {
      console.error("Redis client error", err);
    });

    connecting = client
      .connect()
      .catch((err) => {
        console.error("Redis connect failed", err);
        client = null;
      })
      .finally(() => {
        connecting = null;
      });
  }

  await connecting;
  return client;
}

