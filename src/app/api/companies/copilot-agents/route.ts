import { getCompanyIdFromRequest } from "@/lib/auth/get-company";
import { requirePermission } from "@/lib/auth/get-profile";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { NextResponse } from "next/server";

const AG_ID_RE = /^ag_[a-zA-Z0-9]+$/;

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
};

type IncomingRow = {
  name?: unknown;
  external_agent_id?: unknown;
  agent_version?: unknown;
  prompt_extra?: unknown;
  channel_id?: unknown;
  queue_id?: unknown;
  is_active?: unknown;
};

function sanitizeRow(r: IncomingRow, sortOrder: number): Omit<CompanyCopilotAgentRow, "id"> | null {
  const external_agent_id =
    typeof r.external_agent_id === "string" ? r.external_agent_id.trim() : "";
  if (!external_agent_id || !AG_ID_RE.test(external_agent_id)) return null;
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
  return {
    name,
    external_agent_id,
    agent_version,
    prompt_extra,
    channel_id,
    queue_id,
    is_active,
    sort_order: sortOrder,
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
        "id, name, external_agent_id, agent_version, prompt_extra, channel_id, queue_id, is_active, sort_order"
      )
      .eq("company_id", companyId)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true });
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    const agents = (data ?? []) as CompanyCopilotAgentRow[];
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

  const sanitized: Omit<CompanyCopilotAgentRow, "id">[] = [];
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
    external_agent_id: r.external_agent_id,
    agent_version: r.agent_version,
    prompt_extra: r.prompt_extra,
    channel_id: r.channel_id,
    queue_id: r.queue_id,
    is_active: r.is_active,
    sort_order: r.sort_order,
  }));

  const { data: inserted, error: insErr } = await admin
    .from("company_copilot_agents")
    .insert(insertPayload)
    .select(
      "id, name, external_agent_id, agent_version, prompt_extra, channel_id, queue_id, is_active, sort_order"
    );
  if (insErr) {
    return NextResponse.json({ error: insErr.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, agents: (inserted ?? []) as CompanyCopilotAgentRow[] });
}
