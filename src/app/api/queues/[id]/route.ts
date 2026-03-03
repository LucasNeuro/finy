import { getCompanyIdFromRequest } from "@/lib/auth/get-company";
import { requireAdmin } from "@/lib/auth/get-profile";
import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

function isColumnMissingError(message: string): boolean {
  const lower = message.toLowerCase();
  return (
    lower.includes("business_hours") ||
    lower.includes("special_dates") ||
    (lower.includes("column") && lower.includes("does not exist"))
  );
}

/**
 * GET /api/queues/[id]
 * Retorna uma fila com business_hours.
 */
export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const companyId = await getCompanyIdFromRequest(request);
  if (!companyId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id: queueId } = await context.params;
  if (!queueId) {
    return NextResponse.json({ error: "Queue ID required" }, { status: 400 });
  }
  const supabase = await createClient();
  type QueueRow = { id: string; name: string; slug: string; created_at?: string; updated_at?: string; business_hours?: unknown; special_dates?: unknown };
  let data: QueueRow | null = null;
  let error: { message: string } | null = null;

  const res = await supabase
    .from("queues")
    .select("id, name, slug, created_at, updated_at, business_hours, special_dates")
    .eq("id", queueId)
    .eq("company_id", companyId)
    .single();
  data = res.data;
  error = res.error;

  if (error && isColumnMissingError(error.message)) {
    const fallback = await supabase
      .from("queues")
      .select("id, name, slug, created_at, updated_at")
      .eq("id", queueId)
      .eq("company_id", companyId)
      .single();
    if (fallback.error || !fallback.data) {
      return NextResponse.json({ error: "Queue not found" }, { status: 404 });
    }
    return NextResponse.json({ ...fallback.data, business_hours: [], special_dates: [] });
  }
  if (error || !data) {
    return NextResponse.json({ error: "Queue not found" }, { status: 404 });
  }
  const payload = {
    ...data,
    special_dates: Array.isArray(data.special_dates) ? data.special_dates : [],
  };
  return NextResponse.json(payload);
}

/**
 * PATCH /api/queues/[id]
 * Atualiza nome, slug e/ou business_hours da fila.
 */
export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const companyId = await getCompanyIdFromRequest(request);
  if (!companyId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const adminErr = await requireAdmin(companyId);
  if (adminErr) {
    return NextResponse.json({ error: adminErr.error }, { status: adminErr.status });
  }

  const { id: queueId } = await context.params;
  if (!queueId) {
    return NextResponse.json({ error: "Queue ID required" }, { status: 400 });
  }

  let body: { name?: string; slug?: string; business_hours?: unknown; special_dates?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const supabase = await createClient();
  const { data: existing } = await supabase
    .from("queues")
    .select("id")
    .eq("id", queueId)
    .eq("company_id", companyId)
    .single();

  if (!existing) {
    return NextResponse.json({ error: "Queue not found" }, { status: 404 });
  }

  const updates: { name?: string; slug?: string; business_hours?: unknown; special_dates?: unknown; updated_at: string } = {
    updated_at: new Date().toISOString(),
  };
  if (typeof body?.name === "string" && body.name.trim()) {
    updates.name = body.name.trim();
  }
  if (typeof body?.slug === "string" && body.slug.trim()) {
    updates.slug = body.slug.trim().toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
  }
  if (body?.business_hours !== undefined) {
    updates.business_hours = Array.isArray(body.business_hours) ? body.business_hours : [];
  }
  if (body?.special_dates !== undefined) {
    updates.special_dates = Array.isArray(body.special_dates) ? body.special_dates : [];
  }

  if (Object.keys(updates).length <= 1) {
    return NextResponse.json({ error: "Nenhuma alteração (name, slug, business_hours ou special_dates)" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("queues")
    .update(updates)
    .eq("id", queueId)
    .eq("company_id", companyId)
    .select("id, name, slug, created_at, updated_at, business_hours, special_dates")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json(data);
}

/**
 * DELETE /api/queues/[id]
 * Remove a fila. Desvincula antes de channel_queues.
 */
export async function DELETE(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const companyId = await getCompanyIdFromRequest(request);
  if (!companyId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const adminErr = await requireAdmin(companyId);
  if (adminErr) {
    return NextResponse.json({ error: adminErr.error }, { status: adminErr.status });
  }

  const { id: queueId } = await context.params;
  if (!queueId) {
    return NextResponse.json({ error: "Queue ID required" }, { status: 400 });
  }

  const supabase = await createClient();
  const { data: existing } = await supabase
    .from("queues")
    .select("id")
    .eq("id", queueId)
    .eq("company_id", companyId)
    .single();

  if (!existing) {
    return NextResponse.json({ error: "Queue not found" }, { status: 404 });
  }

  await supabase.from("channel_queues").delete().eq("queue_id", queueId);
  const { error: delErr } = await supabase
    .from("queues")
    .delete()
    .eq("id", queueId)
    .eq("company_id", companyId);

  if (delErr) {
    return NextResponse.json({ error: delErr.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
