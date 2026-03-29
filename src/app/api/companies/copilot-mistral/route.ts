import { getCompanyIdFromRequest } from "@/lib/auth/get-company";
import { requirePermission } from "@/lib/auth/get-profile";
import { PERMISSIONS } from "@/lib/auth/permissions";
import {
  isPlausibleMistralAgentExternalId,
  type CopilotMistralAgentEntry,
  type CopilotMistralStoredConfig,
} from "@/lib/ai/copilot-mistral-config";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { NextResponse } from "next/server";

function isUuid(s: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(s);
}

function sanitizeAgents(raw: unknown): CopilotMistralAgentEntry[] {
  if (!Array.isArray(raw)) return [];
  const out: CopilotMistralAgentEntry[] = [];
  for (const row of raw) {
    if (!row || typeof row !== "object") continue;
    const r = row as Record<string, unknown>;
    const id = typeof r.id === "string" ? r.id.trim() : "";
    const agent_id = typeof r.agent_id === "string" ? r.agent_id.trim() : "";
    if (!id || !isUuid(id)) continue;
    if (!isPlausibleMistralAgentExternalId(agent_id)) continue;
    const av = r.agent_version;
    const agent_version =
      typeof av === "number" && Number.isFinite(av) ? Math.max(0, Math.floor(av)) : 0;
    const prompt = typeof r.prompt === "string" ? r.prompt : "";
    const channel_id =
      typeof r.channel_id === "string" && r.channel_id.trim() ? r.channel_id.trim() : null;
    const queue_id = typeof r.queue_id === "string" && r.queue_id.trim() ? r.queue_id.trim() : null;
    out.push({ id, agent_id, agent_version, prompt, channel_id, queue_id });
  }
  return out;
}

export async function GET(request: Request) {
  const companyId = await getCompanyIdFromRequest(request);
  if (!companyId) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }
  const permErr = await requirePermission(companyId, PERMISSIONS.copilot.manage);
  if (permErr) {
    return NextResponse.json({ error: permErr.error }, { status: permErr.status });
  }

  try {
    const admin = createServiceRoleClient();
    const { data, error } = await admin
      .from("companies")
      .select("copilot_mistral_config")
      .eq("id", companyId)
      .maybeSingle();
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    const cfg = (data?.copilot_mistral_config ?? {}) as CopilotMistralStoredConfig;
    const agents = sanitizeAgents(cfg.agents);
    const envFallback = isPlausibleMistralAgentExternalId(
      process.env.COPILOT_AGENT_ID?.trim() || process.env.MISTRAL_COPILOT_AGENT_ID?.trim()
    );
    return NextResponse.json({
      agents,
      legacy_agent_id: typeof cfg.agent_id === "string" ? cfg.agent_id : "",
      legacy_agent_version:
        typeof cfg.agent_version === "number" && Number.isFinite(cfg.agent_version)
          ? cfg.agent_version
          : 0,
      env_fallback_available: envFallback,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro ao ler configuração";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  const companyId = await getCompanyIdFromRequest(request);
  if (!companyId) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }
  const permErr = await requirePermission(companyId, PERMISSIONS.copilot.manage);
  if (permErr) {
    return NextResponse.json({ error: permErr.error }, { status: permErr.status });
  }

  let body: {
    agents?: unknown;
    legacy_agent_id?: string;
    legacy_agent_version?: number;
    clear_legacy?: boolean;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const admin = createServiceRoleClient();
  const { data: prevRow, error: readErr } = await admin
    .from("companies")
    .select("copilot_mistral_config")
    .eq("id", companyId)
    .maybeSingle();
  if (readErr) {
    return NextResponse.json({ error: readErr.message }, { status: 500 });
  }

  const prev = (prevRow?.copilot_mistral_config ?? {}) as CopilotMistralStoredConfig;
  const next: CopilotMistralStoredConfig = { ...prev };

  if (Array.isArray(body.agents)) {
    next.agents = sanitizeAgents(body.agents);
  }

  if (body.clear_legacy === true) {
    delete next.agent_id;
    delete next.agent_version;
  } else if (typeof body.legacy_agent_id === "string") {
    const raw = body.legacy_agent_id.trim();
    if (raw && !isPlausibleMistralAgentExternalId(raw)) {
      return NextResponse.json(
        { error: "legacy_agent_id deve ser um id de agente Mistral válido ou vazio." },
        { status: 400 }
      );
    }
    if (raw) {
      next.agent_id = raw;
      next.agent_version =
        typeof body.legacy_agent_version === "number" && Number.isFinite(body.legacy_agent_version)
          ? Math.max(0, Math.floor(body.legacy_agent_version))
          : 0;
    } else {
      delete next.agent_id;
      delete next.agent_version;
    }
  }

  const { error } = await admin
    .from("companies")
    .update({ copilot_mistral_config: next })
    .eq("id", companyId);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true, copilot_mistral_config: next });
}
