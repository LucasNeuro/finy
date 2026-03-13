import { getCompanyIdFromRequest } from "@/lib/auth/get-company";
import { requirePermission } from "@/lib/auth/get-profile";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { invalidateConversationList } from "@/lib/redis/inbox-state";
import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

type StatusRow = { id: string; name: string; slug: string; color_hex: string | null; sort_order: number; is_closed: boolean };

async function ensureCompanyDefaultStatuses(
  supabase: Awaited<ReturnType<typeof createClient>>,
  companyId: string
) {
  const defaults = [
    { name: "Novo", slug: "open", color_hex: "#22C55E", sort_order: 0, is_closed: false },
    { name: "Em atendimento", slug: "in_progress", color_hex: "#8B5CF6", sort_order: 1, is_closed: false },
    { name: "Encerrado", slug: "closed", color_hex: "#64748B", sort_order: 2, is_closed: true },
  ];
  const { data: existing } = await supabase
    .from("company_ticket_statuses")
    .select("id, slug")
    .eq("company_id", companyId)
    .is("queue_id", null)
    .in("slug", defaults.map((d) => d.slug));
  const bySlug = new Map((existing ?? []).map((r: { id: string; slug: string }) => [String(r.slug), r.id]));
  for (const d of defaults) {
    const id = bySlug.get(d.slug);
    if (id) {
      await supabase
        .from("company_ticket_statuses")
        .update({
          name: d.name,
          color_hex: d.color_hex,
          sort_order: d.sort_order,
          is_closed: d.is_closed,
          updated_at: new Date().toISOString(),
        })
        .eq("id", id)
        .eq("company_id", companyId);
    } else {
      await supabase
        .from("company_ticket_statuses")
        .insert({
          company_id: companyId,
          queue_id: null,
          name: d.name,
          slug: d.slug,
          color_hex: d.color_hex,
          sort_order: d.sort_order,
          is_closed: d.is_closed,
        });
    }
  }
}

/**
 * GET /api/queues/[id]/ticket-statuses
 * Lista statuses da fila.
 * Regra nova flexível:
 * - Os padrões da empresa (queue_id null) SEMPRE aparecem primeiro.
 * - Depois vêm os exclusivos da fila, na ordem de queue_ticket_statuses.
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
  await ensureCompanyDefaultStatuses(supabase, companyId);

  const { data: queueRow } = await supabase
    .from("queues")
    .select("id")
    .eq("id", queueId)
    .eq("company_id", companyId)
    .single();
  if (!queueRow) {
    return NextResponse.json({ error: "Fila não encontrada" }, { status: 404 });
  }

  const { data: qRows, error: qErr } = await supabase
    .from("queue_ticket_statuses")
    .select("ticket_status_id, sort_order")
    .eq("queue_id", queueId)
    .order("sort_order", { ascending: true });

  if (qErr) {
    return NextResponse.json({ error: qErr.message }, { status: 500 });
  }

  const { data: globals, error: gErr } = await supabase
    .from("company_ticket_statuses")
    .select("id, name, slug, color_hex, sort_order, is_closed")
    .eq("company_id", companyId)
    .is("queue_id", null)
    .order("sort_order", { ascending: true });
  if (gErr) {
    return NextResponse.json({ error: gErr.message }, { status: 500 });
  }

  const { data: queueExclusiveData, error: eErr } = await supabase
    .from("company_ticket_statuses")
    .select("id, name, slug, color_hex, sort_order, is_closed")
    .eq("company_id", companyId)
    .eq("queue_id", queueId)
    .order("sort_order", { ascending: true });
  if (eErr) {
    return NextResponse.json({ error: eErr.message }, { status: 500 });
  }

  const { data: queueOrderRows, error: oErr } = await supabase
    .from("queue_ticket_statuses")
    .select("ticket_status_id, sort_order")
    .eq("queue_id", queueId)
    .order("sort_order", { ascending: true });
  if (oErr) {
    return NextResponse.json({ error: oErr.message }, { status: 500 });
  }
  const orderById = new Map(
    (queueOrderRows ?? []).map((r: { ticket_status_id: string; sort_order: number }) => [r.ticket_status_id, r.sort_order])
  );

  const globalIds = new Set((globals ?? []).map((s: StatusRow) => s.id));
  const exclusives = (queueExclusiveData ?? [])
    .sort((a: StatusRow, b: StatusRow) => {
      const ao = orderById.get(a.id);
      const bo = orderById.get(b.id);
      if (ao == null && bo == null) return (a.sort_order ?? 0) - (b.sort_order ?? 0);
      if (ao == null) return 1;
      if (bo == null) return -1;
      return ao - bo;
    });

  const list: { id: string; name: string; slug: string; color_hex: string; is_closed: boolean; sort_order: number }[] = [];
  let order = 0;
  (globals ?? []).forEach((s: StatusRow) => {
    list.push({ ...s, color_hex: s.color_hex ?? "#64748B", sort_order: order++ });
  });
  exclusives
    .filter((s: StatusRow) => !globalIds.has(s.id))
    .forEach((s: StatusRow) => {
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
 * Define a ordem dos statuses EXCLUSIVOS da fila.
 * Os padrões da empresa são globais e aparecem sempre para todas as filas.
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

  const ticketStatusIds = Array.isArray(body.ticket_status_ids) ? body.ticket_status_ids.filter(Boolean) : [];
  if (ticketStatusIds.length === 0) {
    return NextResponse.json({ error: "Informe pelo menos um status para a fila" }, { status: 400 });
  }

  const { data: selected, error: selectedErr } = await supabase
    .from("company_ticket_statuses")
    .select("id, queue_id, is_closed")
    .eq("company_id", companyId)
    .in("id", ticketStatusIds);
  if (selectedErr) {
    return NextResponse.json({ error: selectedErr.message }, { status: 500 });
  }
  const selectedRows = (selected ?? []) as { id: string; queue_id: string | null; is_closed: boolean }[];
  if (selectedRows.length !== ticketStatusIds.length) {
    return NextResponse.json({ error: "Algum status informado não existe na empresa" }, { status: 400 });
  }
  const invalidScope = selectedRows.find((s) => s.queue_id !== null && s.queue_id !== queueId);
  if (invalidScope) {
    return NextResponse.json({ error: "Há status de outra fila na lista enviada" }, { status: 400 });
  }

  const globals = selectedRows.filter((s) => s.queue_id === null);
  const exclusives = selectedRows.filter((s) => s.queue_id === queueId);
  const hasOpen = selectedRows.some((s) => !s.is_closed);
  const hasClosed = selectedRows.some((s) => !!s.is_closed);
  if (!hasOpen || !hasClosed) {
    return NextResponse.json({ error: "A fila precisa ter ao menos 1 status aberto e 1 fechado" }, { status: 400 });
  }
  // Persistimos somente exclusivos na ordem da lista enviada.
  const exclusiveIdsInOrder = ticketStatusIds.filter((id) => exclusives.some((s) => s.id === id));

  const { error: delErr } = await supabase
    .from("queue_ticket_statuses")
    .delete()
    .eq("queue_id", queueId);

  if (delErr) {
    return NextResponse.json({ error: delErr.message }, { status: 500 });
  }

  const rows = exclusiveIdsInOrder.map((ticket_status_id, i) => ({
    queue_id: queueId,
    ticket_status_id,
    sort_order: i,
  }));

  if (rows.length > 0) {
    const { error: insErr } = await supabase
      .from("queue_ticket_statuses")
      .insert(rows);

    if (insErr) {
      return NextResponse.json({ error: insErr.message }, { status: 500 });
    }
  }

  await invalidateConversationList(companyId);
  return NextResponse.json({ ok: true });
}
