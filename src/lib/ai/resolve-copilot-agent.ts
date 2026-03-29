import {
  isPlausibleMistralAgentExternalId,
  pickCopilotAgentForContext,
  type CopilotMistralStoredConfig,
} from "@/lib/ai/copilot-mistral-config";
import { createServiceRoleClient } from "@/lib/supabase/admin";

export type ResolvedCopilotAgent =
  | {
      mode: "mistral_agent";
      agentId: string;
      agentVersion: number;
      source: "company_table" | "company_legacy" | "env";
      extraPrompt: string;
    }
  | {
      mode: "chat_completions";
      source: "company_table";
      extraPrompt: string;
      systemInstructions: string;
      completionModel: string;
    };

type TableRow = {
  id: string;
  external_agent_id: string | null;
  agent_version: number | null;
  prompt_extra: string | null;
  channel_id: string | null;
  queue_id: string | null;
  is_active: boolean;
  provider_kind?: string | null;
  system_instructions?: string | null;
  completion_model?: string | null;
};

function rowApplies(
  channel_id: string | null,
  queue_id: string | null,
  channelId: string | null,
  queueId: string | null
): boolean {
  const wantCh = channel_id != null && channel_id !== "";
  const wantQu = queue_id != null && queue_id !== "";
  if (wantCh && channelId !== channel_id) return false;
  if (wantQu && queueId !== queue_id) return false;
  return true;
}

function rowSpecificity(channel_id: string | null, queue_id: string | null): number {
  let s = 0;
  if (channel_id != null && channel_id !== "") s += 1;
  if (queue_id != null && queue_id !== "") s += 1;
  return s;
}

function tableRowToResolved(r: TableRow): ResolvedCopilotAgent | null {
  const pk = (r.provider_kind || "").trim() === "chat_completions" ? "chat_completions" : "mistral_agent";
  const extra = typeof r.prompt_extra === "string" ? r.prompt_extra.trim() : "";

  if (pk === "chat_completions") {
    const model = (typeof r.completion_model === "string" ? r.completion_model : "").trim();
    if (!model) return null;
    const sys = typeof r.system_instructions === "string" ? r.system_instructions : "";
    return {
      mode: "chat_completions",
      source: "company_table",
      extraPrompt: extra,
      systemInstructions: sys.trim(),
      completionModel: model,
    };
  }

  const id = (r.external_agent_id || "").trim();
  if (!isPlausibleMistralAgentExternalId(id)) return null;
  const v = r.agent_version;
  const agentVersion =
    typeof v === "number" && Number.isFinite(v) ? Math.max(0, Math.floor(v)) : 0;
  return {
    mode: "mistral_agent",
    agentId: id,
    agentVersion,
    source: "company_table",
    extraPrompt: extra,
  };
}

function pickFromTableRows(
  rows: TableRow[],
  channelId: string | null,
  queueId: string | null
): ResolvedCopilotAgent | null {
  let best: ResolvedCopilotAgent | null = null;
  let bestSpec = -1;
  for (const r of rows) {
    if (!r.is_active) continue;
    const resolved = tableRowToResolved(r);
    if (!resolved) continue;
    const ch = r.channel_id ?? null;
    const qu = r.queue_id ?? null;
    if (!rowApplies(ch, qu, channelId, queueId)) continue;
    const sp = rowSpecificity(ch, qu);
    if (sp > bestSpec) {
      bestSpec = sp;
      best = resolved;
    }
  }
  return best;
}

async function loadLegacyConfig(companyId: string): Promise<CopilotMistralStoredConfig | null> {
  try {
    const admin = createServiceRoleClient();
    const { data, error } = await admin
      .from("companies")
      .select("copilot_mistral_config")
      .eq("id", companyId)
      .maybeSingle();
    if (error || !data) return null;
    return (data.copilot_mistral_config ?? {}) as CopilotMistralStoredConfig;
  } catch {
    return null;
  }
}

function envFallbackAgent(): { agentId: string; agentVersion: number } | null {
  const envId =
    process.env.COPILOT_AGENT_ID?.trim() || process.env.MISTRAL_COPILOT_AGENT_ID?.trim();
  if (!isPlausibleMistralAgentExternalId(envId)) return null;
  const v = parseInt(process.env.MISTRAL_COPILOT_AGENT_VERSION || "0", 10);
  return {
    agentId: envId,
    agentVersion: Number.isFinite(v) ? Math.max(0, v) : 0,
  };
}

/**
 * Ordem: linhas em company_copilot_agents → JSON legado em companies.copilot_mistral_config → env (só agente Mistral).
 */
export async function resolveCopilotAgent(
  companyId: string,
  opts: { channelId: string | null; queueId: string | null }
): Promise<ResolvedCopilotAgent | null> {
  try {
    const admin = createServiceRoleClient();
    const { data: tableData, error: tableErr } = await admin
      .from("company_copilot_agents")
      .select(
        "id, external_agent_id, agent_version, prompt_extra, channel_id, queue_id, is_active, provider_kind, system_instructions, completion_model"
      )
      .eq("company_id", companyId)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true });

    if (!tableErr && Array.isArray(tableData) && tableData.length > 0) {
      const picked = pickFromTableRows(tableData as TableRow[], opts.channelId, opts.queueId);
      if (picked) return picked;
    }
  } catch {
    /* tabela ausente ou colunas antigas */
  }

  const cfg = await loadLegacyConfig(companyId);
  if (cfg) {
    const picked = pickCopilotAgentForContext(cfg, opts.channelId, opts.queueId);
    if (picked) {
      return {
        mode: "mistral_agent",
        agentId: picked.agentId,
        agentVersion: picked.agentVersion,
        source: "company_legacy",
        extraPrompt: picked.extraPrompt,
      };
    }
  }

  const envPicked = envFallbackAgent();
  if (envPicked) {
    return { ...envPicked, mode: "mistral_agent", source: "env", extraPrompt: "" };
  }
  return null;
}
