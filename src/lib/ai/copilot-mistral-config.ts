/**
 * ID devolvido por POST /v1/agents na Mistral (p.ex. `ag_…` ou UUID).
 * Não exigir prefixo `ag_` — a API pública usa `id` string genérico.
 */
export function isPlausibleMistralAgentExternalId(s: unknown): s is string {
  if (typeof s !== "string") return false;
  const t = s.trim();
  if (t.length < 4 || t.length > 200) return false;
  if (/\s/.test(t)) return false;
  return true;
}

/** Uma regra: agente no provedor + escopo (fila/conexão) + prompt extra na 1ª mensagem do fio. */
export type CopilotMistralAgentEntry = {
  id: string;
  agent_id: string;
  agent_version: number;
  /** Instruções extras da empresa (prefixadas no primeiro turno com contexto do ticket). */
  prompt?: string;
  /** null ou omitido = qualquer conexão */
  channel_id?: string | null;
  /** null ou omitido = qualquer fila */
  queue_id?: string | null;
};

export type CopilotMistralStoredConfig = {
  /** Legado: um único agente global (usado se nenhuma linha em `agents` casar). */
  agent_id?: string;
  agent_version?: number;
  agents?: CopilotMistralAgentEntry[];
};

function entryApplies(
  e: CopilotMistralAgentEntry,
  channelId: string | null,
  queueId: string | null
): boolean {
  const wantCh = e.channel_id != null && e.channel_id !== "";
  const wantQu = e.queue_id != null && e.queue_id !== "";
  if (wantCh && channelId !== e.channel_id) return false;
  if (wantQu && queueId !== e.queue_id) return false;
  return true;
}

/** Mais específico = mais filtros preenchidos (conexão e/ou fila). */
function entrySpecificity(e: CopilotMistralAgentEntry): number {
  let s = 0;
  if (e.channel_id != null && e.channel_id !== "") s += 1;
  if (e.queue_id != null && e.queue_id !== "") s += 1;
  return s;
}

export function pickCopilotAgentForContext(
  cfg: CopilotMistralStoredConfig,
  channelId: string | null,
  queueId: string | null
): { agentId: string; agentVersion: number; extraPrompt: string } | null {
  const raw = Array.isArray(cfg.agents) ? cfg.agents : [];
  const valid: CopilotMistralAgentEntry[] = [];
  for (const a of raw) {
    if (!isPlausibleMistralAgentExternalId(a?.agent_id)) continue;
    const id = typeof a.id === "string" ? a.id.trim() : "";
    if (!id) continue;
    const v = a.agent_version;
    const agentVersion =
      typeof v === "number" && Number.isFinite(v) ? Math.max(0, Math.floor(v)) : 0;
    valid.push({
      id,
      agent_id: a.agent_id.trim(),
      agent_version: agentVersion,
      prompt: typeof a.prompt === "string" ? a.prompt : "",
      channel_id: a.channel_id ?? null,
      queue_id: a.queue_id ?? null,
    });
  }

  let best: CopilotMistralAgentEntry | null = null;
  let bestSpec = -1;
  for (const e of valid) {
    if (!entryApplies(e, channelId, queueId)) continue;
    const sp = entrySpecificity(e);
    if (sp > bestSpec) {
      bestSpec = sp;
      best = e;
    }
  }

  if (best) {
    return {
      agentId: best.agent_id,
      agentVersion: best.agent_version,
      extraPrompt: (best.prompt ?? "").trim(),
    };
  }

  const legacyId =
    typeof cfg.agent_id === "string" && isPlausibleMistralAgentExternalId(cfg.agent_id)
      ? cfg.agent_id.trim()
      : null;
  if (legacyId) {
    const v = cfg.agent_version;
    return {
      agentId: legacyId,
      agentVersion:
        typeof v === "number" && Number.isFinite(v) ? Math.max(0, Math.floor(v)) : 0,
      extraPrompt: "",
    };
  }

  return null;
}
