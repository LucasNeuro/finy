"use server";

import { getRedisClient } from "@/lib/redis/client";

/**
 * Cache Redis para URLs de mídia (áudio, vídeo, imagem, documento).
 * Evita chamadas repetidas à UAZAPI/storage ao reproduzir ou visualizar mídia.
 *
 * Chave: inbox:media:{conversationId}:{messageId}
 * Valor: { fileURL: string, mimeType?: string }
 * TTL: 2 horas (mídia é imutável)
 */
const KEY_PREFIX = "inbox:media:";
const KEY_PREFIX_V2 = "inbox:media:v2:";
const TTL_SECONDS = 2 * 60 * 60; // 2 horas

function mediaKey(conversationId: string, messageId: string): string {
  return `${KEY_PREFIX}${conversationId}:${messageId}`;
}

function mediaKeyV2(companyId: string, conversationId: string, messageId: string): string {
  return `${KEY_PREFIX_V2}${companyId}:${conversationId}:${messageId}`;
}

export type MediaCacheEntry = { fileURL: string; mimeType?: string | null };

export async function getCachedMediaUrl(
  conversationId: string,
  messageId: string,
  companyId?: string
): Promise<MediaCacheEntry | null> {
  const redis = await getRedisClient();
  if (!redis) return null;
  try {
    if (companyId) {
      const v2 = await redis.get(mediaKeyV2(companyId, conversationId, messageId));
      if (v2) {
        const parsedV2 = JSON.parse(v2) as MediaCacheEntry;
        if (parsedV2?.fileURL) return parsedV2;
      }
    }
    const key = mediaKey(conversationId, messageId);
    const raw = await redis.get(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as MediaCacheEntry;
    return parsed?.fileURL ? parsed : null;
  } catch {
    return null;
  }
}

export async function setCachedMediaUrl(
  conversationId: string,
  messageId: string,
  entry: MediaCacheEntry,
  companyId?: string
): Promise<void> {
  const redis = await getRedisClient();
  if (!redis) return;
  try {
    const key = companyId
      ? mediaKeyV2(companyId, conversationId, messageId)
      : mediaKey(conversationId, messageId);
    await redis.set(key, JSON.stringify(entry), { EX: TTL_SECONDS });
  } catch {
    // ignore
  }
}

/** Retorna mapa messageId -> media_cached_url para enriquecer mensagens no GET /conversations/[id]. */
export async function getCachedMediaUrlsBulk(
  conversationId: string,
  messageIds: string[],
  companyId?: string
): Promise<Record<string, string>> {
  const redis = await getRedisClient();
  if (!redis || messageIds.length === 0) return {};
  try {
    const keys = companyId
      ? messageIds.map((mid) => mediaKeyV2(companyId, conversationId, mid))
      : messageIds.map((mid) => mediaKey(conversationId, mid));
    const rawList = await redis.mGet(keys);
    const result: Record<string, string> = {};
    rawList.forEach((raw, i) => {
      const mid = messageIds[i];
      if (!raw || !mid) return;
      try {
        const parsed = JSON.parse(raw) as MediaCacheEntry;
        if (parsed?.fileURL) result[mid] = parsed.fileURL;
      } catch {
        // ignore
      }
    });
    return result;
  } catch {
    return {};
  }
}
