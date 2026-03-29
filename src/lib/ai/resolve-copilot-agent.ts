import {
  pickCopilotAgentForContext,
  type CopilotMistralStoredConfig,
} from "@/lib/ai/copilot-mistral-config";
import { createServiceRoleClient } from "@/lib/supabase/admin";

export type ResolvedCopilotAgent = {
  agentId: string;
  agentVersion: number;
  source: "company_table" | "company_legacy" | "env";
  extraPrompt: string;
};

type TableRow = {
  id: string;
  external_agent_id: string;
  agent_version: number | null;
  prompt_extra: string | null;
  channel_id: string | null;
  queue_id: string | null;
  is_active: boolean;
};

function pickFromTableRows(
  rows: TableRow[],
  channelId: string | null,
  queueId: string | null
): { agentId: string; agentVersion: number; extraPrompt: string } | null {
  const agents = rows
    .filter((r) => r.is_active)
    .map((r) => ({
      id: r.id,
      agent_id: (r.external_agent_id || "").trim(),
      agent_version:
        typeof r.agent_version === "number" && Number.isFinite(r.agent_version)
          ? Math.max(0, Math.floor(r.agent_version))
          : 0,
      prompt: typeof r.prompt_extra === "string" ? r.prompt_extra : "",
      channel_id: r.channel_id,
      queue_id: r.queue_id,
    }))
    .filter((a) => a.agent_id.startsWith("ag_"));

  return pickCopilotAgentForContext({ agents }, channelId, queueId);
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
  if (!envId?.startsWith("ag_")) return null;
  const v = parseInt(process.env.MISTRAL_COPILOT_AGENT_VERSION || "0", 10);
  return {
    agentId: envId,
    agentVersion: Number.isFinite(v) ? Math.max(0, v) : 0,
  };
}

/**
 * Ordem: linhas em company_copilot_agents → JSON legado em companies.copilot_mistral_config → env.
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
        "id, external_agent_id, agent_version, prompt_extra, channel_id, queue_id, is_active"
      )
      .eq("company_id", companyId)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true });

    if (!tableErr && Array.isArray(tableData) && tableData.length > 0) {
      const picked = pickFromTableRows(tableData as TableRow[], opts.channelId, opts.queueId);
      if (picked) {
        return { ...picked, source: "company_table" };
      }
    }
  } catch {
    /* tabela ausente em ambientes antigos */
  }

  const cfg = await loadLegacyConfig(companyId);
  if (cfg) {
    const picked = pickCopilotAgentForContext(cfg, opts.channelId, opts.queueId);
    if (picked) {
      return { ...picked, source: "company_legacy" };
    }
  }

  const envPicked = envFallbackAgent();
  if (envPicked) {
    return { ...envPicked, source: "env", extraPrompt: "" };
  }
  return null;
}
