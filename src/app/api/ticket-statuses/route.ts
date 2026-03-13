import { getCompanyIdFromRequest } from "@/lib/auth/get-company";
import { requirePermission } from "@/lib/auth/get-profile";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { invalidateConversationList } from "@/lib/redis/inbox-state";
import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

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

  const MAX_QUEUE_EXCLUSIVE_STATUSES = 9;

  if (queue_id) {
    const { data: q } = await supabase.from("queues").select("id").eq("id", queue_id).eq("company_id", companyId).single();
    if (!q) {
      return NextResponse.json({ error: "Fila não encontrada" }, { status: 404 });
    }
    const { count, error: countErr } = await supabase
      .from("company_ticket_statuses")
      .select("id", { count: "exact", head: true })
      .eq("company_id", companyId)
      .eq("queue_id", queue_id);
    if (!countErr && (count ?? 0) >= MAX_QUEUE_EXCLUSIVE_STATUSES) {
      return NextResponse.json(
        { error: `Cada fila pode ter no máximo ${MAX_QUEUE_EXCLUSIVE_STATUSES} statuses exclusivos.` },
        { status: 400 }
      );
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

  if (queue_id && data) {
    const { data: qRows } = await supabase
      .from("queue_ticket_statuses")
      .select("sort_order")
      .eq("queue_id", queue_id)
      .order("sort_order", { ascending: false })
      .limit(1);
    const nextOrder = (qRows?.[0] as { sort_order?: number } | undefined)?.sort_order ?? -1;
    await supabase.from("queue_ticket_statuses").insert({
      queue_id,
      ticket_status_id: data.id,
      sort_order: nextOrder + 1,
    });
  }

  await invalidateConversationList(companyId);
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
  const includeAll = searchParams.get("include_all") === "1";

  const supabase = await createClient();
  await ensureCompanyDefaultStatuses(supabase, companyId);

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

  if (includeAll) {
    const { data: allStatuses, error: allErr } = await supabase
      .from("company_ticket_statuses")
      .select("id, name, slug, color_hex, sort_order, is_closed, queue_id")
      .eq("company_id", companyId)
      .order("queue_id", { ascending: true, nullsFirst: true })
      .order("sort_order", { ascending: true });
    if (allErr) {
      return NextResponse.json({ error: allErr.message }, { status: 500 });
    }
    const list = (allStatuses ?? []).map((s) => ({
      id: s.id,
      name: s.name,
      slug: s.slug,
      color_hex: s.color_hex ?? "#64748B",
      is_closed: !!s.is_closed,
      sort_order: s.sort_order,
    }));
    return NextResponse.json(list);
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
