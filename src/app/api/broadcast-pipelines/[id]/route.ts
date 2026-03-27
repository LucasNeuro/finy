import { getCompanyIdFromRequest } from "@/lib/auth/get-company";
import { requirePermission } from "@/lib/auth/get-profile";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

/**
 * PATCH /api/broadcast-pipelines/[id]
 * Atualiza pipeline: status (ativar/desativar agendamento) ou dados completos (edição).
 * Body: { status?: "draft" | "scheduled" } | { name?, config?, queue_item_ids?, status? }
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const companyId = await getCompanyIdFromRequest(request);
  if (!companyId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const permErr = await requirePermission(companyId, PERMISSIONS.broadcast.manage);
  if (permErr) {
    return NextResponse.json({ error: permErr.error }, { status: permErr.status });
  }

  const { id } = await params;
  if (!id) {
    return NextResponse.json({ error: "ID é obrigatório" }, { status: 400 });
  }

  let body: { status?: string; name?: string; config?: Record<string, unknown>; queue_item_ids?: string[] };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };

  if (body.name !== undefined) {
    const name = typeof body.name === "string" ? body.name.trim() : "";
    if (!name) {
      return NextResponse.json({ error: "Nome do pipeline é obrigatório" }, { status: 400 });
    }
    updates.name = name;
  }
  if (body.config !== undefined && body.config !== null && typeof body.config === "object") {
    updates.config = body.config;
  }
  if (body.queue_item_ids !== undefined) {
    updates.queue_item_ids = Array.isArray(body.queue_item_ids)
      ? body.queue_item_ids.filter((id): id is string => typeof id === "string")
      : [];
  }
  if (body.status !== undefined) {
    const status = ["draft", "scheduled"].includes(String(body.status)) ? String(body.status) : null;
    if (!status) {
      return NextResponse.json({ error: "status deve ser draft ou scheduled" }, { status: 400 });
    }
    updates.status = status;
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("broadcast_pipelines")
    .update(updates)
    .eq("id", id)
    .eq("company_id", companyId)
    .select("id, name, status, config, queue_item_ids")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({ error: "Pipeline não encontrado" }, { status: 404 });
  }

  return NextResponse.json({ ok: true, pipeline: data });
}

/**
 * DELETE /api/broadcast-pipelines/[id]
 * Exclui um pipeline.
 */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const companyId = await getCompanyIdFromRequest(_request);
  if (!companyId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const permErr = await requirePermission(companyId, PERMISSIONS.broadcast.manage);
  if (permErr) {
    return NextResponse.json({ error: permErr.error }, { status: permErr.status });
  }

  const { id } = await params;
  if (!id) {
    return NextResponse.json({ error: "ID é obrigatório" }, { status: 400 });
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("broadcast_pipelines")
    .delete()
    .eq("id", id)
    .eq("company_id", companyId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
