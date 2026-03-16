"use server";

import { getRedisClient } from "@/lib/redis/client";
import { createServiceRoleClient } from "@/lib/supabase/admin";

const ROUND_ROBIN_KEY_PREFIX = "queue:round-robin:";

async function listQueueAgentIds(
  companyId: string,
  queueId: string
): Promise<string[]> {
  const supabase = createServiceRoleClient();
  const { data: assignments, error } = await supabase
    .from("queue_assignments")
    .select("user_id")
    .eq("queue_id", queueId)
    .eq("company_id", companyId);

  if (error || !assignments || assignments.length === 0) {
    return [];
  }

  return assignments
    .map((a: { user_id: string }) => a.user_id)
    .filter((id): id is string => typeof id === "string" && id.length > 0);
}

/**
 * Distribuição round-robin de conversas por fila usando Redis + Supabase.
 *
 * Fluxo:
 * 1. Busca atendentes da fila em queue_assignments (Supabase).
 * 2. Lê último atendente da fila no Redis (chave por companyId:queueId).
 * 3. Escolhe o próximo atendente na lista (circular).
 * 4. Atualiza Redis com o novo último atendente.
 * 5. Retorna o user_id do atendente escolhido (ou null se não houver atendentes).
 *
 * Compatível com múltiplos workers/servidores: Redis é compartilhado, então a distribuição
 * é consistente mesmo com vários processos processando webhooks simultaneamente.
 */
export async function getNextAgentForQueue(
  companyId: string,
  queueId: string
): Promise<string | null> {
  if (!queueId) return null;

  const agentIds = await listQueueAgentIds(companyId, queueId);
  if (agentIds.length === 0) return null;

  const redis = await getRedisClient();

  // Se só tem um atendente, retorna ele
  if (agentIds.length === 1) {
    return agentIds[0] as string;
  }

  // 2. Ler último atendente do Redis
  const redisKey = `${ROUND_ROBIN_KEY_PREFIX}${companyId}:${queueId}`;
  let lastAgentId: string | null = null;

  if (redis) {
    try {
      const cached = await redis.get(redisKey);
      if (cached) lastAgentId = cached;
    } catch {
      // ignorar erro Redis; usa fallback
    }
  }

  // 3. Encontrar próximo na lista (circular)
  let nextIndex = 0;
  if (lastAgentId) {
    const lastIndex = agentIds.indexOf(lastAgentId);
    if (lastIndex >= 0) {
      nextIndex = (lastIndex + 1) % agentIds.length;
    }
  }

  const nextAgentId = agentIds[nextIndex] as string;

  // 4. Atualizar Redis com o novo último atendente
  if (redis) {
    try {
      await redis.set(redisKey, nextAgentId, { EX: 86400 }); // TTL 24h
    } catch {
      // ignorar erro; a distribuição ainda funciona sem Redis
    }
  }

  return nextAgentId;
}

/**
 * Consulta estado atual do round-robin sem avançar o ponteiro.
 * Útil para painéis de distribuição/monitoramento.
 */
export async function peekNextAgentForQueue(
  companyId: string,
  queueId: string
): Promise<{ lastAgentId: string | null; nextAgentId: string | null; agentIds: string[] }> {
  if (!queueId) return { lastAgentId: null, nextAgentId: null, agentIds: [] };
  const agentIds = await listQueueAgentIds(companyId, queueId);
  if (agentIds.length === 0) return { lastAgentId: null, nextAgentId: null, agentIds: [] };

  if (agentIds.length === 1) {
    return {
      lastAgentId: agentIds[0] as string,
      nextAgentId: agentIds[0] as string,
      agentIds,
    };
  }

  const redis = await getRedisClient();
  const redisKey = `${ROUND_ROBIN_KEY_PREFIX}${companyId}:${queueId}`;
  let lastAgentId: string | null = null;

  if (redis) {
    try {
      const cached = await redis.get(redisKey);
      if (cached) lastAgentId = cached;
    } catch {
      // ignorar erro Redis; fallback usa início da lista
    }
  }

  if (!lastAgentId) {
    return {
      lastAgentId: null,
      nextAgentId: agentIds[0] as string,
      agentIds,
    };
  }

  const lastIndex = agentIds.indexOf(lastAgentId);
  if (lastIndex < 0) {
    return {
      lastAgentId,
      nextAgentId: agentIds[0] as string,
      agentIds,
    };
  }

  const nextIndex = (lastIndex + 1) % agentIds.length;
  return {
    lastAgentId,
    nextAgentId: agentIds[nextIndex] as string,
    agentIds,
  };
}

/**
 * Invalida o estado de round-robin de uma fila (quando atendentes são adicionados/removidos).
 * Chamar quando queue_assignments mudar para a fila.
 */
export async function invalidateRoundRobinForQueue(
  companyId: string,
  queueId: string
): Promise<void> {
  const redis = await getRedisClient();
  if (!redis) return;
  try {
    const key = `${ROUND_ROBIN_KEY_PREFIX}${companyId}:${queueId}`;
    await redis.del(key);
  } catch {
    // ignorar
  }
}

/**
 * Invalida round-robin de todas as filas da empresa (quando há mudança estrutural).
 */
export async function invalidateRoundRobinForCompany(companyId: string): Promise<void> {
  const redis = await getRedisClient();
  if (!redis) return;
  try {
    const pattern = `${ROUND_ROBIN_KEY_PREFIX}${companyId}:*`;
    const keys = await redis.keys(pattern);
    if (keys.length > 0) {
      await redis.del(keys);
    }
  } catch {
    // ignorar
  }
}
