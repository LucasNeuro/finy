"use server";

import { getRedisClient } from "@/lib/redis/client";
import { invalidateCountsInSupabase } from "@/lib/cache/inbox-counts-supabase";

/**
 * Cache Redis APENAS para operação de atendimento (tickets e chats).
 *
 * Regra: tudo que NÃO é chat e tickets fica FORA do Redis — chamada direta ao banco e à UAZAPI.
 * Redis só para gerenciar e deixar veloz: atendimento e gerenciamento de tickets.
 *
 * Onde o Redis é usado:
 * - GET /api/conversations (lista): SIDEBAR DO CHAT (Novos, Filas, Meus) e PÁGINA TICKETS (Kanban).
 *   Um único cache de lista serve os dois; não existe Redis separado para o Kanban.
 * - GET /api/conversations/[id] (detalhe do chat) — só o chat (abrir conversa).
 * - GET /api/conversations/counts (badges da sidebar) — só o chat.
 *
 * Onde NÃO usamos Redis (sempre Supabase / UAZAPI quando aplicável):
 * - GET /api/contacts, GET /api/groups (Contatos e grupos — dados completos)
 * - GET /api/roles (Cargos)
 * - GET /api/queues (Filas, inclusive números vinculados)
 *
 * Fluxo: Supabase = fonte da verdade. Redis = cache quente só para lista/detalhe/counts
 * de conversas. UAZAPI = chamada sob demanda (ex.: chat-details ao abrir painel, sync ao clicar Sincronizar).
 *
 * Padrão de mercado (Zendesk, Intercom, etc.): cache quente + TTL curto + invalidação na escrita
 * para manter a UI rápida sem servir dado desatualizado.
 *
 * TTLs (segundos): lista 50, tickets 55, detalhe 90, contagens 45.
 * Isolamento por empresa: lista e counts usam companyId na chave; detalhe/mídia usam conversationId
 * (conversa já pertence a uma empresa; a API só devolve se o usuário for da mesma empresa).
 */
const REDIS_NAMESPACE = (process.env.REDIS_NAMESPACE?.trim() || process.env.NODE_ENV || "dev").replace(/\s+/g, "_");
const KEY_PREFIX = `${REDIS_NAMESPACE}:inbox:list:v2:`;
/** Lista: TTL para atendimento fluido (troca de abas, volta à lista). Estilo Zendesk. */
const TTL_SECONDS = 50;
/** Tickets (includeClosed). */
const TTL_TICKETS_SECONDS = 55;

/**
 * Chave de cache para lista de conversas (estado quente).
 * Usado para que a aplicação leia estado de tickets/conversas do Redis
 * em vez de bater no banco a cada requisição.
 */
function listKey(
  companyId: string,
  userScope: string,
  queueId: string,
  status: string,
  onlyAssigned: string,
  includeClosed: string,
  onlyUnassigned: string,
  offset: number,
  limit: number
): string {
  return `${KEY_PREFIX}${companyId}:${userScope}:${queueId}:${status}:${onlyAssigned}:${includeClosed}:${onlyUnassigned}:${offset}:${limit}`;
}

/**
 * Retorna a lista de conversas do cache (estado quente), se existir.
 */
export async function getCachedConversationList(
  companyId: string,
  queueId: string,
  status: string,
  onlyAssigned: string,
  includeClosed = false,
  onlyUnassigned = false,
  offset = 0,
  limit = 100,
  userScope = ""
): Promise<{ data: unknown[]; total: number } | null> {
  const redis = await getRedisClient();
  if (!redis) return null;
  try {
    const key = listKey(companyId, userScope, queueId, status, onlyAssigned, includeClosed ? "1" : "0", onlyUnassigned ? "1" : "0", offset, limit);
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
  payload: { data: unknown[]; total: number },
  includeClosed = false,
  onlyUnassigned = false,
  offset = 0,
  limit = 100,
  userScope = ""
): Promise<void> {
  const redis = await getRedisClient();
  if (!redis) return;
  try {
    const key = listKey(companyId, userScope, queueId, status, onlyAssigned, includeClosed ? "1" : "0", onlyUnassigned ? "1" : "0", offset, limit);
    const ttl = includeClosed ? TTL_TICKETS_SECONDS : TTL_SECONDS;
    await redis.set(key, JSON.stringify(payload), { EX: ttl });
  } catch {
    // ignore
  }
}

/**
 * Invalida todo o cache de listas de conversas da empresa.
 * Chamado quando: PATCH conversa, claim, nova mensagem (webhook/POST), reação, deletar msg,
 * arquivar/deletar chat, esvaziar meus, reset-to-open, sync contatos/histórico, chat-details.
 * Remove todas as chaves inbox:list:{companyId}:* e em seguida invalida counts.
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
    await invalidateCounts(companyId);
  } catch {
    // ignore
  }
}

const COUNTS_KEY_PREFIX = `${REDIS_NAMESPACE}:inbox:counts:v2:`;
const COUNTS_TTL_SECONDS = 45;

/** Retorna as contagens (mine, queues, individual, groups, unassigned) do cache, se existirem. */
export async function getCachedCounts(
  companyId: string,
  userId: string
): Promise<{ mine: number; queues: number; individual: number; groups: number; unassigned?: number } | null> {
  const redis = await getRedisClient();
  if (!redis) return null;
  try {
    const key = `${COUNTS_KEY_PREFIX}${companyId}:${userId}`;
    const raw = await redis.get(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { mine: number; queues: number; individual: number; groups: number; unassigned?: number };
    return parsed;
  } catch {
    return null;
  }
}

/** Grava as contagens no cache (badges da sidebar). */
export async function setCachedCounts(
  companyId: string,
  userId: string,
  payload: { mine: number; queues: number; individual: number; groups: number; unassigned?: number }
): Promise<void> {
  const redis = await getRedisClient();
  if (!redis) return;
  try {
    const key = `${COUNTS_KEY_PREFIX}${companyId}:${userId}`;
    await redis.set(key, JSON.stringify(payload), { EX: COUNTS_TTL_SECONDS });
  } catch {
    // ignore
  }
}

/** Invalida o cache de contagens da empresa (Redis e Supabase). */
export async function invalidateCounts(companyId: string): Promise<void> {
  const redis = await getRedisClient();
  if (redis) {
    try {
      const pattern = `${COUNTS_KEY_PREFIX}${companyId}:*`;
      const keys = await redis.keys(pattern);
      if (keys.length > 0) await redis.del(keys);
    } catch {
      // ignore
    }
  }
  await invalidateCountsInSupabase(companyId);
}

const DETAIL_KEY_PREFIX = `${REDIS_NAMESPACE}:inbox:detail:`; // legado
const DETAIL_KEY_PREFIX_V2 = `${REDIS_NAMESPACE}:inbox:detail:v2:`;
/** Detalhe do chat: TTL para abrir conversa instantâneo ao trocar. Estilo Zendesk. */
const DETAIL_TTL_SECONDS = 90;

/**
 * Cache do detalhe da conversa (mensagens + metadados) para abrir o chat rápido.
 * Evita múltiplas consultas ao banco ao clicar na conversa.
 */
export async function getCachedConversationDetail(
  companyIdOrConversationId: string,
  conversationId?: string
): Promise<Record<string, unknown> | null> {
  const redis = await getRedisClient();
  if (!redis) return null;
  try {
    // v2 (isolado por empresa)
    if (conversationId) {
      const keyV2 = `${DETAIL_KEY_PREFIX_V2}${companyIdOrConversationId}:${conversationId}`;
      const rawV2 = await redis.get(keyV2);
      if (rawV2) {
        return JSON.parse(rawV2) as Record<string, unknown>;
      }
      // fallback legado para transição suave
      const legacyRaw = await redis.get(`${DETAIL_KEY_PREFIX}${conversationId}`);
      if (!legacyRaw) return null;
      return JSON.parse(legacyRaw) as Record<string, unknown>;
    }
    // legado
    const key = `${DETAIL_KEY_PREFIX}${companyIdOrConversationId}`;
    const raw = await redis.get(key);
    if (!raw) return null;
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return null;
  }
}

export async function setCachedConversationDetail(
  companyIdOrConversationId: string,
  conversationIdOrPayload: string | Record<string, unknown>,
  payloadMaybe?: Record<string, unknown>
): Promise<void> {
  const redis = await getRedisClient();
  if (!redis) return;
  try {
    if (typeof conversationIdOrPayload === "string" && payloadMaybe) {
      const keyV2 = `${DETAIL_KEY_PREFIX_V2}${companyIdOrConversationId}:${conversationIdOrPayload}`;
      await redis.set(keyV2, JSON.stringify(payloadMaybe), { EX: DETAIL_TTL_SECONDS });
      return;
    }
    // legado
    const key = `${DETAIL_KEY_PREFIX}${companyIdOrConversationId}`;
    await redis.set(key, JSON.stringify(conversationIdOrPayload), { EX: DETAIL_TTL_SECONDS });
  } catch {
    // ignore
  }
}

/**
 * Invalida o cache do detalhe de uma conversa.
 * Chamado quando: PATCH na conversa, claim, nova mensagem, reação, deletar mensagem,
 * arquivar/deletar chat, chat-details que altera essa conversa.
 */
export async function invalidateConversationDetail(conversationId: string, companyId?: string): Promise<void> {
  const redis = await getRedisClient();
  if (!redis) return;
  try {
    const keysToDelete: string[] = [`${DETAIL_KEY_PREFIX}${conversationId}`];
    if (companyId) {
      keysToDelete.push(`${DETAIL_KEY_PREFIX_V2}${companyId}:${conversationId}`);
    } else {
      const pattern = `${DETAIL_KEY_PREFIX_V2}*:${conversationId}`;
      const v2keys = await redis.keys(pattern);
      if (v2keys.length > 0) keysToDelete.push(...v2keys);
    }
    await redis.del(keysToDelete);
  } catch {
    // ignore
  }
}
