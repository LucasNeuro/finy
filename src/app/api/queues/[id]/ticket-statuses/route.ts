import { getCompanyIdFromRequest } from "@/lib/auth/get-company";
import { requirePermission } from "@/lib/auth/get-profile";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

const DEFAULT_SLUGS = ["open", "in_queue", "in_progress", "closed"] as const;

type StatusRow = { id: string; name: string; slug: string; color_hex: string | null; sort_order: number; is_closed: boolean };

/**
 * GET /api/queues/[id]/ticket-statuses
 * Lista statuses da fila: SEMPRE os 4 padrão (Novo, Fila, Em atendimento, Encerrados) primeiro,
 * depois os statuses exclusivos da fila na ordem configurada.
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

  const { data: queueRow } = await supabase
    .from("queues")
    .select("id")
    .eq("id", queueId)
    .eq("company_id", companyId)
    .single();
  if (!queueRow) {
    return NextResponse.json({ error: "Fila não encontrada" }, { status: 404 });
  }

  const { data: defaultRows, error: defaultErr } = await supabase
    .from("company_ticket_statuses")
    .select("id, name, slug, color_hex, sort_order, is_closed")
    .eq("company_id", companyId)
    .is("queue_id", null)
    .in("slug", [...DEFAULT_SLUGS])
    .order("sort_order", { ascending: true });

  if (defaultErr || !defaultRows?.length) {
    return NextResponse.json({ error: "Statuses padrão da empresa não encontrados" }, { status: 500 });
  }

  const defaultList: StatusRow[] = defaultRows.map((s) => ({
    id: s.id,
    name: s.name,
    slug: s.slug,
    color_hex: s.color_hex ?? "#64748B",
    sort_order: s.sort_order,
    is_closed: !!s.is_closed,
  }));
  const defaultIds = new Set(defaultList.map((s) => s.id));

  const { data: qRows, error: qErr } = await supabase
    .from("queue_ticket_statuses")
    .select("ticket_status_id, sort_order")
    .eq("queue_id", queueId)
    .order("sort_order", { ascending: true });

  if (qErr) {
    return NextResponse.json({ error: qErr.message }, { status: 500 });
  }

  const customIdsFromQueue = (qRows ?? []).map((r: { ticket_status_id: string }) => r.ticket_status_id).filter((id: string) => !defaultIds.has(id));
  const allIds = [...defaultList.map((s) => s.id), ...customIdsFromQueue];

  let byId = new Map<string, StatusRow>(defaultList.map((s) => [s.id, { ...s, color_hex: s.color_hex ?? "#64748B" }]));

  if (customIdsFromQueue.length > 0) {
    const { data: customStatuses, error: sErr } = await supabase
      .from("company_ticket_statuses")
      .select("id, name, slug, color_hex, sort_order, is_closed")
      .in("id", customIdsFromQueue)
      .eq("company_id", companyId);
    if (!sErr && customStatuses?.length) {
      customStatuses.forEach((s: StatusRow) => {
        byId.set(s.id, {
          id: s.id,
          name: s.name,
          slug: s.slug,
          color_hex: s.color_hex ?? "#64748B",
          sort_order: s.sort_order,
          is_closed: !!s.is_closed,
        });
      });
    }
  }

  const { data: queueExclusiveData } = await supabase
    .from("company_ticket_statuses")
    .select("id, name, slug, color_hex, sort_order, is_closed")
    .eq("company_id", companyId)
    .eq("queue_id", queueId)
    .order("sort_order", { ascending: true });
  const queueExclusives = (queueExclusiveData ?? []).filter((s: { id: string }) => !byId.has(s.id));

  const list: { id: string; name: string; slug: string; color_hex: string; is_closed: boolean; sort_order: number }[] = [];
  let order = 0;
  defaultList.forEach((s) => {
    list.push({ ...s, color_hex: s.color_hex ?? "#64748B", sort_order: order++ });
  });
  (qRows ?? [])
    .filter((r: { ticket_status_id: string }) => !defaultIds.has(r.ticket_status_id))
    .forEach((r: { ticket_status_id: string }) => {
      const s = byId.get(r.ticket_status_id);
      if (s) list.push({ ...s, color_hex: s.color_hex ?? "#64748B", sort_order: order++ });
    });
  queueExclusives.forEach((s: StatusRow) => {
    list.push({
      id: s.id,
      name: s.name,
      slug: s.slug,
      color_hex: s.color_hex ?? "#64748B",
      is_closed: !!s.is_closed,
      sort_order: order++,
    });
  });

  return NextResponse.json(list);
}

/**
 * PUT /api/queues/[id]/ticket-statuses
 * Define a ordem dos statuses da fila. Os 4 statuses padrão (open, in_queue, in_progress, closed)
 * nunca são removidos: se não vierem no body, são acrescentados ao final.
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

  const supabase = await createClient();

  const { data: defaultRows } = await supabase
    .from("company_ticket_statuses")
    .select("id")
    .eq("company_id", companyId)
    .is("queue_id", null)
    .in("slug", [...DEFAULT_SLUGS])
    .order("sort_order", { ascending: true });
  const defaultIds = (defaultRows ?? []).map((r: { id: string }) => r.id);

  let ticketStatusIds = Array.isArray(body.ticket_status_ids) ? body.ticket_status_ids.filter(Boolean) : [];
  defaultIds.forEach((id) => {
    if (!ticketStatusIds.includes(id)) ticketStatusIds.push(id);
  });

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
