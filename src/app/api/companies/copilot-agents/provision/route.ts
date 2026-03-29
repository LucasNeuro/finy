import { getCompanyIdFromRequest } from "@/lib/auth/get-company";
import { requirePermission } from "@/lib/auth/get-profile";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { NextResponse } from "next/server";

const DEFAULT_MODEL = "mistral-medium-latest";

/**
 * POST: grava regra em company_copilot_agents (prompt + modelo) para /v1/chat/completions — sem criar agente na API Mistral.
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

  let body: {
    name?: string;
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
  if (!name) {
    return NextResponse.json({ error: "Nome é obrigatório." }, { status: 400 });
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
      external_agent_id: null,
      agent_version: 0,
      prompt_extra,
      channel_id,
      queue_id,
      is_active,
      sort_order: nextSort,
      provider_kind: "chat_completions",
      system_instructions: instructions,
      completion_model: model,
    })
    .select(
      "id, name, external_agent_id, agent_version, prompt_extra, channel_id, queue_id, is_active, sort_order, provider_kind, system_instructions, completion_model"
    )
    .maybeSingle();

  if (insErr) {
    return NextResponse.json(
      {
        error: insErr.message,
        hint:
          insErr.message?.includes("company_copilot_agents") || insErr.code === "42P01"
            ? "Execute a migração Supabase que cria/atualiza company_copilot_agents (supabase db push ou SQL em migrations)."
            : undefined,
      },
      { status: 500 }
    );
  }

  return NextResponse.json({
    ok: true,
    agent: inserted,
  });
}
