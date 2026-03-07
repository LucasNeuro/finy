import { getCompanyIdFromRequest } from "@/lib/auth/get-company";
import { requirePermission } from "@/lib/auth/get-profile";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

/**
 * POST /api/ticket-statuses
 * Cria novo status na empresa. Requer queues.manage.
 */
export async function POST(request: Request) {
  const companyId = await getCompanyIdFromRequest(request);
  if (!companyId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const err = await requirePermission(companyId, PERMISSIONS.queues.manage);
  if (err) {
    return NextResponse.json({ error: err.error }, { status: err.status });
  }

  let body: { name?: string; slug?: string; color_hex?: string; sort_order?: number; is_closed?: boolean; queue_id?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const name = (body.name ?? "").trim();
  const slug = (body.slug ?? name.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, "-")).trim() || "status";
  const color_hex = (body.color_hex ?? "#64748B").trim() || "#64748B";
  const sort_order = typeof body.sort_order === "number" ? body.sort_order : 0;
  const is_closed = !!body.is_closed;
  const queue_id = typeof body.queue_id === "string" && body.queue_id.trim() ? body.queue_id.trim() : null;

  if (!name) {
    return NextResponse.json({ error: "Nome é obrigatório" }, { status: 400 });
  }

  const supabase = await createClient();

  if (queue_id) {
    const { data: q } = await supabase.from("queues").select("id").eq("id", queue_id).eq("company_id", companyId).single();
    if (!q) {
      return NextResponse.json({ error: "Fila não encontrada" }, { status: 404 });
    }
  }

  const { data, error } = await supabase
    .from("company_ticket_statuses")
    .insert({
      company_id: companyId,
      name,
      slug,
      color_hex,
      sort_order,
      is_closed,
      ...(queue_id && { queue_id }),
    })
    .select("id, name, slug, color_hex, sort_order, is_closed")
    .single();

  if (error) {
    if (error.code === "23505") return NextResponse.json({ error: "Já existe um status com esse slug" }, { status: 409 });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data);
}

/**
 * GET /api/ticket-statuses?queue_id=xxx (opcional)
 * Lista statuses do Kanban da empresa. Se queue_id for passado, retorna os statuses
 * configurados para essa caixa (e ordem); senão retorna todos os statuses da empresa.
 */
export async function GET(request: Request) {
  const companyId = await getCompanyIdFromRequest(request);
  if (!companyId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const readErr = await requirePermission(companyId, PERMISSIONS.tickets.view);
  if (readErr) {
    return NextResponse.json({ error: readErr.error }, { status: readErr.status });
  }

  const { searchParams } = new URL(request.url);
  const queueId = searchParams.get("queue_id")?.trim();

  const supabase = await createClient();

  if (queueId) {
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
      if (!qsErr && queueSpecific && queueSpecific.length > 0) {
        const list = queueSpecific.map((s) => ({
          id: s.id,
          name: s.name,
          slug: s.slug,
          color_hex: s.color_hex ?? "#64748B",
          is_closed: !!s.is_closed,
          sort_order: s.sort_order ?? 0,
        }));
        return NextResponse.json(list);
      }
    }
    if (statusIds.length > 0) {
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

      return NextResponse.json(list);
    }
  }

  let statuses: { id: string; name: string; slug: string; color_hex?: string; sort_order?: number; is_closed?: boolean }[] | null = null;
  let error: { message: string } | null = null;

  const qWithQueue = supabase
    .from("company_ticket_statuses")
    .select("id, name, slug, color_hex, sort_order, is_closed")
    .eq("company_id", companyId)
    .is("queue_id", null)
    .order("sort_order", { ascending: true });
  const resWithQueue = await qWithQueue;
  if (resWithQueue.error) {
    const qFallback = supabase
      .from("company_ticket_statuses")
      .select("id, name, slug, color_hex, sort_order, is_closed")
      .eq("company_id", companyId)
      .order("sort_order", { ascending: true });
    const resFallback = await qFallback;
    if (resFallback.error) {
      return NextResponse.json({ error: resFallback.error.message }, { status: 500 });
    }
    statuses = resFallback.data;
  } else {
    statuses = resWithQueue.data;
  }

  const list = (statuses ?? []).map((s) => ({
    id: s.id,
    name: s.name,
    slug: s.slug,
    color_hex: s.color_hex ?? "#64748B",
    is_closed: !!s.is_closed,
    sort_order: s.sort_order,
  }));

  return NextResponse.json(list);
}
