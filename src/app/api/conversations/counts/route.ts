import { getCompanyIdFromRequest } from "@/lib/auth/get-company";
import { getProfileForCompany, requirePermission } from "@/lib/auth/get-profile";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { withMetricsHeaders } from "@/lib/api/metrics";
import { getCachedCounts, setCachedCounts } from "@/lib/redis/inbox-state";
import {
  getCachedCountsFromSupabase,
  setCachedCountsInSupabase,
} from "@/lib/cache/inbox-counts-supabase";
import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

async function resolveStatusSlugs(
  supabase: Awaited<ReturnType<typeof createClient>>,
  companyId: string
): Promise<{ active: string[]; closed: string[]; unassigned: string[] }> {
  const fallbackActive = ["open", "in_progress", "in_queue", "waiting"];
  const fallbackClosed = ["closed"];
  try {
    const { data } = await supabase
      .from("company_ticket_statuses")
      .select("slug, is_closed")
      .eq("company_id", companyId);
    const rows = (data ?? []) as { slug: string; is_closed?: boolean }[];
    const active = [...new Set(rows.filter((r) => !r.is_closed).map((r) => String(r.slug || "").trim().toLowerCase()).filter(Boolean))];
    const closed = [...new Set(rows.filter((r) => !!r.is_closed).map((r) => String(r.slug || "").trim().toLowerCase()).filter(Boolean))];
    // Mantém slugs base sempre ativos para evitar zerar contagens
    // quando a configuração estiver incompleta.
    const activeFinal = [...new Set([...(active.length > 0 ? active : []), ...fallbackActive])];
    const closedFinal = [...new Set([...(closed.length > 0 ? closed : []), ...fallbackClosed])];
    const unassignedPreferred = activeFinal.filter((s) => s === "open" || s === "in_queue");
    const unassignedFinal = unassignedPreferred.length > 0 ? unassignedPreferred : activeFinal;
    return { active: activeFinal, closed: closedFinal, unassigned: unassignedFinal };
  } catch {
    return { active: fallbackActive, closed: fallbackClosed, unassigned: ["open", "in_queue"] };
  }
}

/**
 * GET /api/conversations/counts
 * Retorna contagens por aba: mine, queues, individual, groups.
 * Usado para badges nos ícones da sidebar (Filas, Meus atendimentos, Contatos, Grupos).
 */
export async function GET(request: Request) {
  const startTime = performance.now();
  const companyId = await getCompanyIdFromRequest(request);
  if (!companyId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const readErr = await requirePermission(companyId, PERMISSIONS.inbox.read);
  if (readErr) {
    return NextResponse.json({ error: readErr.error }, { status: readErr.status });
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  let allowedQueueIds: string[] | null = null;
  let allowedGroupKeys: { channel_id: string; group_jid: string }[] = [];
  let canSeeAll = false;
  let canManageTickets = false;
  if (user) {
    const profile = await getProfileForCompany(companyId);
    if (profile) {
      const [seeAllErr, manageErr] = await Promise.all([
        requirePermission(companyId, PERMISSIONS.inbox.see_all),
        requirePermission(companyId, PERMISSIONS.inbox.manage_tickets),
      ]);
      canSeeAll = seeAllErr === null;
      canManageTickets = manageErr === null;
      if (!canSeeAll && !canManageTickets) {
        const { data: assignments } = await supabase
          .from("queue_assignments")
          .select("queue_id")
          .eq("user_id", user.id)
          .eq("company_id", companyId);
        allowedQueueIds = (assignments ?? []).map((r: { queue_id: string }) => r.queue_id);
        const { data: groupAssignments } = await supabase
          .from("channel_group_assignments")
          .select("channel_id, group_jid")
          .eq("user_id", user.id)
          .eq("company_id", companyId);
        allowedGroupKeys = (groupAssignments ?? []).map((r: { channel_id: string; group_jid: string }) => ({ channel_id: r.channel_id, group_jid: r.group_jid }));
      }
    }
  }

  if (allowedQueueIds !== null && allowedQueueIds.length === 0 && allowedGroupKeys.length === 0) {
    const res = NextResponse.json({ mine: 0, queues: 0, individual: 0, groups: 0, unassigned: 0, mine_closed: 0 });
    return withMetricsHeaders(res, { cacheHit: false, startTime });
  }

  const userId = user?.id ?? "";
  if (userId) {
    const cachedRedis = await getCachedCounts(companyId, userId);
    if (cachedRedis) {
      const res = NextResponse.json(cachedRedis);
      return withMetricsHeaders(res, { cacheHit: true, startTime });
    }
    const cachedSupabase = await getCachedCountsFromSupabase(companyId, userId);
    if (cachedSupabase) {
      const res = NextResponse.json(cachedSupabase);
      return withMetricsHeaders(res, { cacheHit: true, startTime });
    }
  }

  const { active: activeStatuses, closed: closedStatuses, unassigned: unassignedStatuses } = await resolveStatusSlugs(supabase, companyId);
  let queuesQ = supabase.from("conversations").select("id", { count: "exact", head: true }).eq("company_id", companyId).in("status", activeStatuses);
  let mineQ = supabase.from("conversations").select("id", { count: "exact", head: true }).eq("company_id", companyId).eq("assigned_to", user?.id ?? "").in("status", activeStatuses);
  let individualQ = supabase.from("conversations").select("id", { count: "exact", head: true }).eq("company_id", companyId).eq("assigned_to", user?.id ?? "").eq("is_group", false).in("status", activeStatuses);
  let groupsQ = supabase.from("conversations").select("id", { count: "exact", head: true }).eq("company_id", companyId).eq("assigned_to", user?.id ?? "").eq("is_group", true).in("status", activeStatuses);
  let unassignedQ = supabase.from("conversations").select("id", { count: "exact", head: true }).eq("company_id", companyId).is("assigned_to", null).in("status", unassignedStatuses);
  let mineClosedQ = supabase.from("conversations").select("id", { count: "exact", head: true }).eq("company_id", companyId).eq("assigned_to", user?.id ?? "").in("status", closedStatuses);

  if (allowedQueueIds !== null) {
    if (allowedGroupKeys.length === 0) {
      queuesQ = queuesQ.in("queue_id", allowedQueueIds);
      mineQ = mineQ.in("queue_id", allowedQueueIds);
      individualQ = individualQ.in("queue_id", allowedQueueIds);
      groupsQ = groupsQ.in("queue_id", allowedQueueIds);
      unassignedQ = unassignedQ.in("queue_id", allowedQueueIds);
      mineClosedQ = mineClosedQ.in("queue_id", allowedQueueIds);
    } else {
      const orPred = `queue_id.in.(${allowedQueueIds.join(",")}),external_id.in.("${allowedGroupKeys.map((k) => k.group_jid).join('","')}")`;
      queuesQ = queuesQ.or(orPred);
      mineQ = mineQ.or(orPred);
      individualQ = individualQ.or(orPred);
      groupsQ = groupsQ.or(orPred);
      unassignedQ = unassignedQ.or(orPred);
      mineClosedQ = mineClosedQ.or(orPred);
    }
  }

  const [queuesRes, mineRes, individualRes, groupsRes, unassignedRes, mineClosedRes] = await Promise.all([
    queuesQ,
    mineQ,
    individualQ,
    groupsQ,
    unassignedQ,
    mineClosedQ,
  ]);

  const mine = typeof mineRes.count === "number" ? mineRes.count : 0;
  const queues = typeof queuesRes.count === "number" ? queuesRes.count : 0;
  const individual = typeof individualRes.count === "number" ? individualRes.count : 0;
  const groups = typeof groupsRes.count === "number" ? groupsRes.count : 0;
  const unassigned = typeof unassignedRes.count === "number" ? unassignedRes.count : 0;
  const mine_closed = typeof mineClosedRes.count === "number" ? mineClosedRes.count : 0;

  const payload = { mine, queues, individual, groups, unassigned, mine_closed };
  if (userId) {
    await setCachedCounts(companyId, userId, payload);
    await setCachedCountsInSupabase(companyId, userId, payload);
  }

  const res = NextResponse.json(payload);
  return withMetricsHeaders(res, { cacheHit: false, startTime });
}
