import { getCompanyIdFromRequest } from "@/lib/auth/get-company";
import { requirePermission } from "@/lib/auth/get-profile";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { invalidateConversationList } from "@/lib/redis/inbox-state";
import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

/**
 * PATCH /api/ticket-statuses/[id]
 * Atualiza status. Requer queues.manage.
 */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const companyId = await getCompanyIdFromRequest(request);
  if (!companyId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const err = await requirePermission(companyId, PERMISSIONS.queues.manage);
  if (err) {
    return NextResponse.json({ error: err.error }, { status: err.status });
  }

  const { id } = await params;
  if (!id) {
    return NextResponse.json({ error: "ID obrigatório" }, { status: 400 });
  }

  let body: { name?: string; slug?: string; color_hex?: string; sort_order?: number; is_closed?: boolean };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const supabase = await createClient();

  const updates: Record<string, unknown> = {};
  if (body.name !== undefined) updates.name = (body.name as string).trim();
  if (body.slug !== undefined) updates.slug = (body.slug as string).trim();
  if (body.color_hex !== undefined) updates.color_hex = (body.color_hex as string).trim() || "#64748B";
  if (typeof body.sort_order === "number") updates.sort_order = body.sort_order;
  if (typeof body.is_closed === "boolean") updates.is_closed = body.is_closed;
  updates.updated_at = new Date().toISOString();

  if (Object.keys(updates).length <= 1) {
    return NextResponse.json({ error: "Nenhum campo para atualizar" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("company_ticket_statuses")
    .update(updates)
    .eq("id", id)
    .eq("company_id", companyId)
    .select("id, name, slug, color_hex, sort_order, is_closed")
    .single();

  if (error) {
    if (error.code === "23505") return NextResponse.json({ error: "Já existe um status com esse slug" }, { status: 409 });
    if (error.code === "PGRST116") return NextResponse.json({ error: "Status não encontrado" }, { status: 404 });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  await invalidateConversationList(companyId);
  return NextResponse.json(data);
}

/**
 * DELETE /api/ticket-statuses/[id]
 * Remove status. Requer queues.manage.
 */
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const companyId = await getCompanyIdFromRequest(_request);
  if (!companyId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const err = await requirePermission(companyId, PERMISSIONS.queues.manage);
  if (err) {
    return NextResponse.json({ error: err.error }, { status: err.status });
  }

  const { id } = await params;
  if (!id) {
    return NextResponse.json({ error: "ID obrigatório" }, { status: 400 });
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("company_ticket_statuses")
    .delete()
    .eq("id", id)
    .eq("company_id", companyId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  await invalidateConversationList(companyId);
  return NextResponse.json({ ok: true });
}
