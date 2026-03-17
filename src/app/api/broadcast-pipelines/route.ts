import { getCompanyIdFromRequest } from "@/lib/auth/get-company";
import { requirePermission } from "@/lib/auth/get-profile";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

/**
 * POST /api/broadcast-pipelines
 * Body: { name: string, config: { lista?, horario?, delay?, mensagem?, envio? } }
 * Salva um pipeline de envio em massa.
 */
export async function POST(request: Request) {
  const companyId = await getCompanyIdFromRequest(request);
  if (!companyId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const permErr = await requirePermission(companyId, PERMISSIONS.broadcast.manage);
  if (permErr) {
    return NextResponse.json({ error: permErr.error }, { status: permErr.status });
  }

  let body: { name?: string; config?: Record<string, unknown>; queue_item_ids?: string[]; status?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const name = typeof body?.name === "string" ? body.name.trim() : "";
  const config = body?.config && typeof body.config === "object" ? body.config : {};
  const queueItemIds = Array.isArray(body?.queue_item_ids)
    ? body.queue_item_ids.filter((id): id is string => typeof id === "string")
    : [];
  const status = ["draft", "scheduled"].includes(String(body?.status ?? "draft")) ? String(body.status) : "draft";

  if (!name) {
    return NextResponse.json({ error: "Nome do pipeline é obrigatório" }, { status: 400 });
  }

  const supabase = await createClient();

  // Evita duplicação: se já existe fluxo com o mesmo nome, atualiza em vez de criar
  const { data: existing } = await supabase
    .from("broadcast_pipelines")
    .select("id, name, created_at")
    .eq("company_id", companyId)
    .eq("name", name)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existing) {
    const { data: updated, error: updateErr } = await supabase
      .from("broadcast_pipelines")
      .update({
        config,
        queue_item_ids: queueItemIds,
        status,
        updated_at: new Date().toISOString(),
      })
      .eq("id", existing.id)
      .eq("company_id", companyId)
      .select("id, name, created_at")
      .single();

    if (updateErr) {
      return NextResponse.json({ error: updateErr.message }, { status: 500 });
    }
    return NextResponse.json({ ok: true, pipeline: updated });
  }

  const { data, error } = await supabase
    .from("broadcast_pipelines")
    .insert({
      company_id: companyId,
      name,
      config,
      queue_item_ids: queueItemIds,
      status,
      updated_at: new Date().toISOString(),
    })
    .select("id, name, created_at")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, pipeline: data });
}

/**
 * GET /api/broadcast-pipelines
 * Lista pipelines da empresa.
 */
export async function GET(request: Request) {
  const companyId = await getCompanyIdFromRequest(request);
  if (!companyId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const permErr = await requirePermission(companyId, PERMISSIONS.broadcast.view);
  if (permErr) {
    return NextResponse.json({ error: permErr.error }, { status: permErr.status });
  }

  const supabase = await createClient();

  // Tenta primeiro com todas as colunas (incl status, queue_item_ids).
  // Se falhar (colunas não existem), usa apenas schema base.
  let data: Record<string, unknown>[] | null = null;
  let error: { message: string } | null = null;

  const fullRes = await supabase
    .from("broadcast_pipelines")
    .select("id, name, config, status, queue_item_ids, created_at, updated_at")
    .eq("company_id", companyId)
    .order("updated_at", { ascending: false });

  if (fullRes.error) {
    const minRes = await supabase
      .from("broadcast_pipelines")
      .select("id, name, config, created_at, updated_at")
      .eq("company_id", companyId)
      .order("updated_at", { ascending: false });
    data = minRes.data;
    error = minRes.error;
  } else {
    data = fullRes.data;
  }

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const pipelines = (data ?? []).map((row) => {
    const r = row as Record<string, unknown>;
    return {
      id: r.id,
      name: r.name,
      config: r.config ?? {},
      created_at: r.created_at,
      updated_at: r.updated_at,
      status: (r.status as string) ?? "draft",
      queue_item_ids: Array.isArray(r.queue_item_ids) ? (r.queue_item_ids as string[]) : [],
    };
  });

  return NextResponse.json({ pipelines });
}
