import { isPlausibleMistralAgentExternalId } from "@/lib/ai/copilot-mistral-config";
import { getCompanyIdFromRequest } from "@/lib/auth/get-company";
import { requirePermission } from "@/lib/auth/get-profile";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { NextResponse } from "next/server";

export type CopilotProviderKind = "mistral_agent" | "chat_completions";

export type CompanyCopilotAgentRow = {
  id: string;
  name: string;
  external_agent_id: string;
  agent_version: number;
  prompt_extra: string;
  channel_id: string | null;
  queue_id: string | null;
  is_active: boolean;
  sort_order: number;
  provider_kind: CopilotProviderKind;
  system_instructions: string;
  completion_model: string;
};

type IncomingRow = {
  name?: unknown;
  external_agent_id?: unknown;
  agent_version?: unknown;
  prompt_extra?: unknown;
  channel_id?: unknown;
  queue_id?: unknown;
  is_active?: unknown;
  provider_kind?: unknown;
  system_instructions?: unknown;
  completion_model?: unknown;
};

type SanitizedRow = Omit<CompanyCopilotAgentRow, "id">;

function sanitizeRow(r: IncomingRow, sortOrder: number): SanitizedRow | null {
  const pkRaw = typeof r.provider_kind === "string" ? r.provider_kind.trim() : "";
  const provider_kind: CopilotProviderKind =
    pkRaw === "chat_completions" ? "chat_completions" : "mistral_agent";

  const name =
    typeof r.name === "string" && r.name.trim() ? r.name.trim().slice(0, 200) : "Copiloto";
  const av = r.agent_version;
  const agent_version =
    typeof av === "number" && Number.isFinite(av) ? Math.max(0, Math.floor(av)) : 0;
  const prompt_extra = typeof r.prompt_extra === "string" ? r.prompt_extra : "";
  const channel_id =
    typeof r.channel_id === "string" && r.channel_id.trim() ? r.channel_id.trim() : null;
  const queue_id = typeof r.queue_id === "string" && r.queue_id.trim() ? r.queue_id.trim() : null;
  const is_active = r.is_active !== false;

  if (provider_kind === "chat_completions") {
    const completion_model =
      typeof r.completion_model === "string" && r.completion_model.trim()
        ? r.completion_model.trim().slice(0, 120)
        : "mistral-small-latest";
    const system_instructions =
      typeof r.system_instructions === "string" ? r.system_instructions : "";
    return {
      name,
      external_agent_id: "",
      agent_version,
      prompt_extra,
      channel_id,
      queue_id,
      is_active,
      sort_order: sortOrder,
      provider_kind: "chat_completions",
      system_instructions,
      completion_model,
    };
  }

  const external_agent_id =
    typeof r.external_agent_id === "string" ? r.external_agent_id.trim() : "";
  if (!isPlausibleMistralAgentExternalId(external_agent_id)) return null;

  return {
    name,
    external_agent_id,
    agent_version,
    prompt_extra,
    channel_id,
    queue_id,
    is_active,
    sort_order: sortOrder,
    provider_kind: "mistral_agent",
    system_instructions: "",
    completion_model: "mistral-small-latest",
  };
}

function mapDbRow(row: Record<string, unknown>): CompanyCopilotAgentRow {
  const pk = row.provider_kind === "chat_completions" ? "chat_completions" : "mistral_agent";
  return {
    id: String(row.id),
    name: typeof row.name === "string" ? row.name : "Copiloto",
    external_agent_id:
      typeof row.external_agent_id === "string"
        ? row.external_agent_id
        : row.external_agent_id != null
          ? String(row.external_agent_id)
          : "",
    agent_version:
      typeof row.agent_version === "number" && Number.isFinite(row.agent_version)
        ? Math.max(0, Math.floor(row.agent_version))
        : 0,
    prompt_extra: typeof row.prompt_extra === "string" ? row.prompt_extra : "",
    channel_id: typeof row.channel_id === "string" ? row.channel_id : null,
    queue_id: typeof row.queue_id === "string" ? row.queue_id : null,
    is_active: row.is_active !== false,
    sort_order:
      typeof row.sort_order === "number" && Number.isFinite(row.sort_order)
        ? Math.floor(row.sort_order)
        : 0,
    provider_kind: pk,
    system_instructions: typeof row.system_instructions === "string" ? row.system_instructions : "",
    completion_model:
      typeof row.completion_model === "string" && row.completion_model.trim()
        ? row.completion_model
        : "mistral-small-latest",
  };
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
      .from("company_copilot_agents")
      .select(
        "id, name, external_agent_id, agent_version, prompt_extra, channel_id, queue_id, is_active, sort_order, provider_kind, system_instructions, completion_model"
      )
      .eq("company_id", companyId)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true });
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    const agents = (data ?? []).map((row) => mapDbRow(row as Record<string, unknown>));
    return NextResponse.json({ agents });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro ao listar agentes";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

/** Substitui todos os agentes copilot da empresa pelo array enviado (ordem = prioridade). */
export async function PUT(request: Request) {
  const companyId = await getCompanyIdFromRequest(request);
  if (!companyId) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }
  const permErr = await requirePermission(companyId, PERMISSIONS.copilot.manage);
  if (permErr) {
    return NextResponse.json({ error: permErr.error }, { status: permErr.status });
  }

  let body: { agents?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }
  if (!Array.isArray(body.agents)) {
    return NextResponse.json({ error: "agents deve ser um array." }, { status: 400 });
  }

  const sanitized: SanitizedRow[] = [];
  for (let i = 0; i < body.agents.length; i++) {
    const row = body.agents[i];
    if (!row || typeof row !== "object") continue;
    const one = sanitizeRow(row as IncomingRow, i);
    if (one) sanitized.push(one);
  }

  const admin = createServiceRoleClient();

  const [{ data: chRows }, { data: qRows }] = await Promise.all([
    admin.from("channels").select("id").eq("company_id", companyId),
    admin.from("queues").select("id").eq("company_id", companyId),
  ]);
  const channelIds = new Set((chRows ?? []).map((c: { id: string }) => c.id));
  const queueIds = new Set((qRows ?? []).map((q: { id: string }) => q.id));

  for (const r of sanitized) {
    if (r.channel_id && !channelIds.has(r.channel_id)) {
      return NextResponse.json(
        { error: "Conexão inválida para esta empresa." },
        { status: 400 }
      );
    }
    if (r.queue_id && !queueIds.has(r.queue_id)) {
      return NextResponse.json({ error: "Fila inválida para esta empresa." }, { status: 400 });
    }
  }

  const { error: delErr } = await admin
    .from("company_copilot_agents")
    .delete()
    .eq("company_id", companyId);
  if (delErr) {
    return NextResponse.json({ error: delErr.message }, { status: 500 });
  }

  if (sanitized.length === 0) {
    return NextResponse.json({ ok: true, agents: [] });
  }

  const insertPayload = sanitized.map((r) => ({
    company_id: companyId,
    name: r.name,
    external_agent_id: r.provider_kind === "chat_completions" ? null : r.external_agent_id,
    agent_version: r.agent_version,
    prompt_extra: r.prompt_extra,
    channel_id: r.channel_id,
    queue_id: r.queue_id,
    is_active: r.is_active,
    sort_order: r.sort_order,
    provider_kind: r.provider_kind,
    system_instructions: r.provider_kind === "chat_completions" ? r.system_instructions : "",
    completion_model:
      r.provider_kind === "chat_completions" ? r.completion_model : "mistral-small-latest",
  }));

  const { data: inserted, error: insErr } = await admin
    .from("company_copilot_agents")
    .insert(insertPayload)
    .select(
      "id, name, external_agent_id, agent_version, prompt_extra, channel_id, queue_id, is_active, sort_order, provider_kind, system_instructions, completion_model"
    );
  if (insErr) {
    return NextResponse.json({ error: insErr.message }, { status: 500 });
  }

  const agents = (inserted ?? []).map((row) => mapDbRow(row as Record<string, unknown>));
  return NextResponse.json({ ok: true, agents });
}
