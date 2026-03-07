import { getCompanyIdFromRequest } from "@/lib/auth/get-company";
import { requirePermission } from "@/lib/auth/get-profile";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

/**
 * GET /api/queues/[id]/ticket-statuses
 * Lista statuses configurados para a fila.
 */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const companyId = await getCompanyIdFromRequest(request);
  if (!companyId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const err = await requirePermission(companyId, PERMISSIONS.queues.view);
  if (err) {
    return NextResponse.json({ error: err.error }, { status: err.status });
  }

  const { id: queueId } = await params;
  if (!queueId) {
    return NextResponse.json({ error: "ID da fila obrigatório" }, { status: 400 });
  }

  const supabase = await createClient();

  const { data: qRows, error: qErr } = await supabase
    .from("queue_ticket_statuses")
    .select("ticket_status_id, sort_order")
    .eq("queue_id", queueId)
    .order("sort_order", { ascending: true });

  if (qErr) {
    return NextResponse.json({ error: qErr.message }, { status: 500 });
  }

  const statusIds = (qRows ?? []).map((r: { ticket_status_id: string }) => r.ticket_status_id);

  if (statusIds.length === 0) {
    const { data: queueSpecific, error: qsErr } = await supabase
      .from("company_ticket_statuses")
      .select("id, name, slug, color_hex, sort_order, is_closed")
      .eq("company_id", companyId)
      .eq("queue_id", queueId)
      .order("sort_order", { ascending: true });
    if (qsErr) return NextResponse.json([]);
    const list = (queueSpecific ?? []).map((s, i) => ({
      id: s.id,
      name: s.name,
      slug: s.slug,
      color_hex: s.color_hex ?? "#64748B",
      is_closed: !!s.is_closed,
      sort_order: i,
    }));
    return NextResponse.json(list);
  }

  const { data: statuses, error: sErr } = await supabase
    .from("company_ticket_statuses")
    .select("id, name, slug, color_hex, sort_order, is_closed")
    .in("id", statusIds)
    .eq("company_id", companyId);

  if (sErr) {
    return NextResponse.json({ error: sErr.message }, { status: 500 });
  }

  const byId = new Map((statuses ?? []).map((s) => [s.id, s]));
  const list = (qRows ?? []).map((r: { ticket_status_id: string; sort_order: number }) => {
    const s = byId.get(r.ticket_status_id);
    if (!s) return null;
    return {
      id: s.id,
      name: s.name,
      slug: s.slug,
      color_hex: s.color_hex ?? "#64748B",
      is_closed: !!s.is_closed,
      sort_order: r.sort_order,
    };
  }).filter(Boolean);

  const idsInList = new Set(list.map((x) => x.id));
  const { data: queueSpecificData, error: qsErr } = await supabase
    .from("company_ticket_statuses")
    .select("id, name, slug, color_hex, sort_order, is_closed")
    .eq("company_id", companyId)
    .eq("queue_id", queueId)
    .order("sort_order", { ascending: true });
  const queueSpecific = qsErr ? [] : (queueSpecificData ?? []);
  const orphans = queueSpecific.filter((s: { id: string }) => !idsInList.has(s.id));
  const maxOrder = list.length > 0 ? Math.max(...list.map((x) => x.sort_order)) : -1;
  orphans.forEach((s, i) => {
    list.push({
      id: s.id,
      name: s.name,
      slug: s.slug,
      color_hex: s.color_hex ?? "#64748B",
      is_closed: !!s.is_closed,
      sort_order: maxOrder + 1 + i,
    });
  });

  return NextResponse.json(list);
}

/**
 * PUT /api/queues/[id]/ticket-statuses
 * Define quais statuses a fila usa e em que ordem. Requer queues.manage.
 * Body: { ticket_status_ids: string[] }
 */
export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const companyId = await getCompanyIdFromRequest(request);
  if (!companyId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const err = await requirePermission(companyId, PERMISSIONS.queues.manage);
  if (err) {
    return NextResponse.json({ error: err.error }, { status: err.status });
  }

  const { id: queueId } = await params;
  if (!queueId) {
    return NextResponse.json({ error: "ID da fila obrigatório" }, { status: 400 });
  }

  let body: { ticket_status_ids?: string[] };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const ticketStatusIds = Array.isArray(body.ticket_status_ids) ? body.ticket_status_ids.filter(Boolean) : [];

  const supabase = await createClient();

  const { error: delErr } = await supabase
    .from("queue_ticket_statuses")
    .delete()
    .eq("queue_id", queueId);

  if (delErr) {
    return NextResponse.json({ error: delErr.message }, { status: 500 });
  }

  if (ticketStatusIds.length === 0) {
    return NextResponse.json({ ok: true });
  }

  const rows = ticketStatusIds.map((ticket_status_id, i) => ({
    queue_id: queueId,
    ticket_status_id,
    sort_order: i,
  }));

  const { error: insErr } = await supabase
    .from("queue_ticket_statuses")
    .insert(rows);

  if (insErr) {
    return NextResponse.json({ error: insErr.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
