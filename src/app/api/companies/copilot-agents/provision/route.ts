import { getCompanyIdFromRequest } from "@/lib/auth/get-company";
import { requirePermission } from "@/lib/auth/get-profile";
import { PERMISSIONS } from "@/lib/auth/permissions";
import {
  getCopilotMistralKeyDiagnostics,
  getMistralPlatformApiKey,
  MISTRAL_PLATFORM_KEY_HINT,
} from "@/lib/ai/server-api-key";
import { mistralAgentCreate } from "@/lib/ai/mistral-conversations";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { NextResponse } from "next/server";

const AI_BASE_URL =
  process.env.AI_BASE_URL?.replace(/\/+$/, "") ||
  process.env.MISTRAL_BASE_URL?.replace(/\/+$/, "") ||
  "https://api.mistral.ai/v1";

const DEFAULT_MODEL = "mistral-medium-latest";

/**
 * POST: cria o agente na Mistral e grava uma linha em company_copilot_agents (vincula à conexão/fila).
 */
export async function POST(request: Request) {
  const companyId = await getCompanyIdFromRequest(request);
  if (!companyId) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }
  const permErr = await requirePermission(companyId, PERMISSIONS.copilot.manage);
  if (permErr) {
    return NextResponse.json({ error: permErr.error }, { status: permErr.status });
  }

  const apiKey = getMistralPlatformApiKey();
  if (!apiKey) {
    return NextResponse.json({ error: MISTRAL_PLATFORM_KEY_HINT }, { status: 503 });
  }

  let body: {
    name?: string;
    description?: string;
    instructions?: string;
    model?: string;
    channel_id?: string | null;
    queue_id?: string | null;
    prompt_extra?: string;
    is_active?: boolean;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const name = typeof body.name === "string" ? body.name.trim().slice(0, 200) : "";
  const description = typeof body.description === "string" ? body.description.trim() : "";
  if (!name) {
    return NextResponse.json({ error: "Nome é obrigatório." }, { status: 400 });
  }
  if (!description) {
    return NextResponse.json(
      { error: "Descrição é obrigatória (uso interno na API da Mistral)." },
      { status: 400 }
    );
  }

  const model =
    typeof body.model === "string" && body.model.trim() ? body.model.trim() : DEFAULT_MODEL;
  const instructions = typeof body.instructions === "string" ? body.instructions : "";
  const prompt_extra = typeof body.prompt_extra === "string" ? body.prompt_extra : "";
  const channel_id =
    typeof body.channel_id === "string" && body.channel_id.trim() ? body.channel_id.trim() : null;
  const queue_id =
    typeof body.queue_id === "string" && body.queue_id.trim() ? body.queue_id.trim() : null;
  const is_active = body.is_active !== false;

  const admin = createServiceRoleClient();

  const [{ data: chRows }, { data: qRows }] = await Promise.all([
    admin.from("channels").select("id").eq("company_id", companyId),
    admin.from("queues").select("id").eq("company_id", companyId),
  ]);
  const channelIds = new Set((chRows ?? []).map((c: { id: string }) => c.id));
  const queueIds = new Set((qRows ?? []).map((q: { id: string }) => q.id));

  if (channel_id && !channelIds.has(channel_id)) {
    return NextResponse.json({ error: "Conexão inválida para esta empresa." }, { status: 400 });
  }
  if (queue_id && !queueIds.has(queue_id)) {
    return NextResponse.json({ error: "Fila inválida para esta empresa." }, { status: 400 });
  }

  let created: { id: string; version?: number };
  try {
    created = await mistralAgentCreate({
      apiKey,
      baseUrl: AI_BASE_URL,
      name,
      description,
      instructions: instructions.trim() || undefined,
      model,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Falha ao criar agente na Mistral";
    const payload: {
      error: string;
      dev?: { platformKeySource: string; chatTargetIsMistral: boolean };
    } = { error: msg };
    if (process.env.NODE_ENV === "development") {
      const d = getCopilotMistralKeyDiagnostics();
      payload.dev = { platformKeySource: d.platformKeySource, chatTargetIsMistral: d.chatTargetIsMistral };
    }
    return NextResponse.json(payload, { status: 502 });
  }

  const agentVersion =
    typeof created.version === "number" && Number.isFinite(created.version)
      ? Math.max(0, Math.floor(created.version))
      : 0;

  const { data: sortRows, error: sortErr } = await admin
    .from("company_copilot_agents")
    .select("sort_order")
    .eq("company_id", companyId)
    .order("sort_order", { ascending: false })
    .limit(1);

  if (sortErr) {
    return NextResponse.json({ error: sortErr.message }, { status: 500 });
  }

  const nextSort =
    Array.isArray(sortRows) && sortRows.length > 0 && typeof sortRows[0].sort_order === "number"
      ? sortRows[0].sort_order + 1
      : 0;

  const { data: inserted, error: insErr } = await admin
    .from("company_copilot_agents")
    .insert({
      company_id: companyId,
      name,
      external_agent_id: created.id,
      agent_version: agentVersion,
      prompt_extra,
      channel_id,
      queue_id,
      is_active,
      sort_order: nextSort,
    })
    .select(
      "id, name, external_agent_id, agent_version, prompt_extra, channel_id, queue_id, is_active, sort_order"
    )
    .maybeSingle();

  if (insErr) {
    return NextResponse.json(
      {
        error: insErr.message,
        hint:
          insErr.message?.includes("company_copilot_agents") || insErr.code === "42P01"
            ? "Execute a migração Supabase que cria a tabela company_copilot_agents (supabase db push ou SQL da pasta migrations)."
            : undefined,
      },
      { status: 500 }
    );
  }

  return NextResponse.json({
    ok: true,
    agent: inserted,
    mistral: { id: created.id, version: agentVersion },
  });
}
