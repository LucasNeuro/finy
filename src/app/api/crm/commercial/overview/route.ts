import { getCompanyIdFromRequest } from "@/lib/auth/get-company";
import { requirePermission } from "@/lib/auth/get-profile";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { toCanonicalDigits } from "@/lib/phone-canonical";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

type QueueRow = { id: string; name: string; slug: string };
type AssignmentRow = { queue_id: string; user_id: string };
type ConversationMetricRow = {
  id: string;
  queue_id: string | null;
  assigned_to: string | null;
  status: string | null;
  created_at: string | null;
  last_message_at: string | null;
};
type ConversationBoardRow = {
  id: string;
  queue_id: string | null;
  channel_id: string | null;
  assigned_to: string | null;
  status: string | null;
  customer_name: string | null;
  customer_phone: string | null;
  last_message_at: string | null;
};

function scoreTierFromLeadScore(score: number | null): "hot" | "warm" | "cold" | null {
  if (score == null) return null;
  if (score >= 70) return "hot";
  if (score >= 40) return "warm";
  return "cold";
}

function toIsoDaysAgo(days: number): string {
  const now = Date.now();
  return new Date(now - days * 24 * 60 * 60 * 1000).toISOString();
}

function normalizeStatus(status: string | null | undefined): string {
  const value = String(status ?? "").trim().toLowerCase();
  return value || "open";
}

export async function GET(request: Request) {
  const companyId = await getCompanyIdFromRequest(request);
  if (!companyId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const readErr = await requirePermission(companyId, PERMISSIONS.inbox.read);
  if (readErr) {
    return NextResponse.json({ error: readErr.error }, { status: readErr.status });
  }

  const { searchParams } = new URL(request.url);
  const queueIdParam = searchParams.get("queue_id")?.trim() || null;
  const lookbackDays = Math.max(1, Math.min(Number(searchParams.get("days") ?? 30) || 30, 180));
  const recentSince = toIsoDaysAgo(lookbackDays);

  const [manageTicketsErr, seeAllErr] = await Promise.all([
    requirePermission(companyId, PERMISSIONS.inbox.manage_tickets),
    requirePermission(companyId, PERMISSIONS.inbox.see_all),
  ]);
  const canManage = manageTicketsErr === null || seeAllErr === null;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: queueRows, error: queueErr } = await supabase
    .from("queues")
    .select("id, name, slug")
    .eq("company_id", companyId)
    .eq("queue_type", "commercial")
    .order("name");

  if (queueErr) {
    return NextResponse.json({ error: queueErr.message }, { status: 500 });
  }

  let queues = (queueRows ?? []) as QueueRow[];
  if (queueIdParam) {
    queues = queues.filter((q) => q.id === queueIdParam);
  }

  if (queues.length === 0) {
    return NextResponse.json({
      can_manage: canManage,
      queues: [],
      totals: {
        leads_total: 0,
        active_total: 0,
        closed_total: 0,
        unassigned_total: 0,
        new_last_days: 0,
      },
      consultants: [],
      pipeline: [],
      board: [],
    });
  }

  const queueIds = queues.map((q) => q.id);

  const { data: assignmentRows, error: assignmentErr } = await supabase
    .from("queue_assignments")
    .select("queue_id, user_id")
    .eq("company_id", companyId)
    .in("queue_id", queueIds);

  if (assignmentErr) {
    return NextResponse.json({ error: assignmentErr.message }, { status: 500 });
  }

  const allAssignments = (assignmentRows ?? []) as AssignmentRow[];

  if (!canManage && user?.id) {
    const allowedQueueIds = new Set(
      allAssignments.filter((r) => r.user_id === user.id).map((r) => r.queue_id)
    );
    queues = queues.filter((q) => allowedQueueIds.has(q.id));
  }

  if (queues.length === 0) {
    return NextResponse.json({
      can_manage: canManage,
      queues: [],
      totals: {
        leads_total: 0,
        active_total: 0,
        closed_total: 0,
        unassigned_total: 0,
        new_last_days: 0,
      },
      consultants: [],
      pipeline: [],
      board: [],
    });
  }

  const scopedQueueIds = queues.map((q) => q.id);
  const scopedAssignments = allAssignments.filter((r) => scopedQueueIds.includes(r.queue_id));
  const consultantIds = [...new Set(scopedAssignments.map((r) => r.user_id))];

  const admin = createServiceRoleClient();
  const { data: profileRows } =
    consultantIds.length > 0
      ? await admin
          .from("profiles")
          .select("user_id, full_name, email, is_active")
          .eq("company_id", companyId)
          .in("user_id", consultantIds)
      : {
          data: [] as {
            user_id: string;
            full_name?: string | null;
            email?: string | null;
            is_active?: boolean | null;
          }[],
        };

  const profileByUser = new Map<
    string,
    { full_name: string; email: string | null; is_active: boolean }
  >();
  for (const p of (profileRows ?? []) as {
    user_id: string;
    full_name?: string | null;
    email?: string | null;
    is_active?: boolean | null;
  }[]) {
    profileByUser.set(p.user_id, {
      full_name: (p.full_name ?? "").trim() || p.email || "Sem nome",
      email: p.email ?? null,
      is_active: p.is_active !== false,
    });
  }

  let metricQuery = supabase
    .from("conversations")
    .select("id, queue_id, assigned_to, status, created_at, last_message_at")
    .eq("company_id", companyId)
    .in("queue_id", scopedQueueIds)
    .eq("kind", "ticket");

  let boardQuery = supabase
    .from("conversations")
    .select("id, queue_id, channel_id, assigned_to, status, customer_name, customer_phone, last_message_at")
    .eq("company_id", companyId)
    .in("queue_id", scopedQueueIds)
    .eq("kind", "ticket")
    .order("last_message_at", { ascending: false })
    .limit(150);

  if (!canManage && user?.id) {
    metricQuery = metricQuery.eq("assigned_to", user.id);
    boardQuery = boardQuery.eq("assigned_to", user.id);
  }

  const [{ data: metricsRows, error: metricsErr }, { data: boardRows, error: boardErr }] =
    await Promise.all([metricQuery, boardQuery]);

  if (metricsErr) {
    return NextResponse.json({ error: metricsErr.message }, { status: 500 });
  }
  if (boardErr) {
    return NextResponse.json({ error: boardErr.message }, { status: 500 });
  }

  const metrics = (metricsRows ?? []) as ConversationMetricRow[];
  const boardData = (boardRows ?? []) as ConversationBoardRow[];

  const scoreByPair = new Map<string, { lead_score: number | null; estimated_value_cents: number | null }>();
  const phonesByChannel = new Map<string, Set<string>>();
  for (const row of boardData) {
    const ch = row.channel_id;
    const ph = row.customer_phone;
    if (!ch || !ph) continue;
    const c = toCanonicalDigits(ph.replace(/\D/g, ""));
    if (!c) continue;
    if (!phonesByChannel.has(ch)) phonesByChannel.set(ch, new Set());
    phonesByChannel.get(ch)!.add(c);
  }

  const OWNER_PHONE_CHUNK = 100;
  for (const [chId, phoneSet] of phonesByChannel) {
    const list = [...phoneSet];
    for (let i = 0; i < list.length; i += OWNER_PHONE_CHUNK) {
      const chunk = list.slice(i, i + OWNER_PHONE_CHUNK);
      const { data: owners } = await admin
        .from("commercial_contact_owners")
        .select("channel_id, phone_canonical, lead_score, estimated_value_cents")
        .eq("company_id", companyId)
        .eq("channel_id", chId)
        .in("phone_canonical", chunk);
      for (const o of owners ?? []) {
        const r = o as {
          channel_id: string;
          phone_canonical: string;
          lead_score: number | null;
          estimated_value_cents: number | null;
        };
        scoreByPair.set(`${r.channel_id}|${r.phone_canonical}`, {
          lead_score: r.lead_score ?? null,
          estimated_value_cents: r.estimated_value_cents ?? null,
        });
      }
    }
  }

  const queueById = new Map(scopedQueueIds.map((id) => [id, queues.find((q) => q.id === id) ?? null]));
  const queueToConsultants = new Map<string, string[]>();
  for (const qid of scopedQueueIds) {
    queueToConsultants.set(
      qid,
      scopedAssignments.filter((r) => r.queue_id === qid).map((r) => r.user_id)
    );
  }

  const consultantMetricSeed = new Map<
    string,
    {
      leads_total: number;
      active_total: number;
      closed_total: number;
      unresponsive_total: number;
      new_last_days: number;
      queues: Set<string>;
      last_activity_at: string | null;
    }
  >();

  for (const userId of consultantIds) {
    consultantMetricSeed.set(userId, {
      leads_total: 0,
      active_total: 0,
      closed_total: 0,
      unresponsive_total: 0,
      new_last_days: 0,
      queues: new Set(
        scopedAssignments.filter((a) => a.user_id === userId).map((a) => a.queue_id)
      ),
      last_activity_at: null,
    });
  }

  const pipelineMap = new Map<string, number>();
  let leadsTotal = 0;
  let activeTotal = 0;
  let closedTotal = 0;
  let unassignedTotal = 0;
  let newLastDays = 0;

  for (const conv of metrics) {
    const normalized = normalizeStatus(conv.status);
    const isClosed = normalized === "closed";
    const isRecent = !!conv.created_at && conv.created_at >= recentSince;
    const isUnresponsive =
      !isClosed &&
      !!conv.last_message_at &&
      new Date(conv.last_message_at).getTime() < Date.now() - 48 * 60 * 60 * 1000;

    leadsTotal += 1;
    if (isClosed) closedTotal += 1;
    else activeTotal += 1;
    if (!conv.assigned_to) unassignedTotal += 1;
    if (isRecent) newLastDays += 1;

    pipelineMap.set(normalized, (pipelineMap.get(normalized) ?? 0) + 1);

    const assignedTo = conv.assigned_to ?? null;
    if (!assignedTo || !consultantMetricSeed.has(assignedTo)) continue;
    const byConsultant = consultantMetricSeed.get(assignedTo)!;
    byConsultant.leads_total += 1;
    if (isClosed) byConsultant.closed_total += 1;
    else byConsultant.active_total += 1;
    if (isUnresponsive) byConsultant.unresponsive_total += 1;
    if (isRecent) byConsultant.new_last_days += 1;
    if (
      conv.last_message_at &&
      (!byConsultant.last_activity_at ||
        new Date(conv.last_message_at).getTime() > new Date(byConsultant.last_activity_at).getTime())
    ) {
      byConsultant.last_activity_at = conv.last_message_at;
    }
  }

  const consultants = [...consultantMetricSeed.entries()]
    .map(([userId, value]) => {
      const identity = profileByUser.get(userId);
      const conversion =
        value.leads_total > 0 ? Number(((value.closed_total / value.leads_total) * 100).toFixed(1)) : 0;
      return {
        user_id: userId,
        full_name: identity?.full_name ?? "Sem nome",
        email: identity?.email ?? null,
        is_active: identity?.is_active ?? true,
        leads_total: value.leads_total,
        active_total: value.active_total,
        closed_total: value.closed_total,
        unresponsive_total: value.unresponsive_total,
        new_last_days: value.new_last_days,
        conversion_rate: conversion,
        queue_ids: [...value.queues],
        last_activity_at: value.last_activity_at,
      };
    })
    .sort((a, b) => b.leads_total - a.leads_total || a.full_name.localeCompare(b.full_name));

  const queueMetrics = scopedQueueIds.map((queueId) => {
    const queueConversations = metrics.filter((c) => c.queue_id === queueId);
    const assignedCount = queueConversations.filter((c) => !!c.assigned_to).length;
    const closedCount = queueConversations.filter((c) => normalizeStatus(c.status) === "closed").length;
    return {
      id: queueId,
      name: queueById.get(queueId)?.name ?? "(sem nome)",
      slug: queueById.get(queueId)?.slug ?? "",
      consultants: queueToConsultants.get(queueId)?.length ?? 0,
      leads_total: queueConversations.length,
      assigned_total: assignedCount,
      unassigned_total: queueConversations.length - assignedCount,
      closed_total: closedCount,
      active_total: queueConversations.length - closedCount,
    };
  });

  const board = boardData.map((item) => {
    const canon = item.customer_phone ? toCanonicalDigits(item.customer_phone.replace(/\D/g, "")) : null;
    const extra =
      item.channel_id && canon ? scoreByPair.get(`${item.channel_id}|${canon}`) : undefined;
    const lead_score = extra?.lead_score ?? null;
    return {
      ...item,
      status: normalizeStatus(item.status),
      assigned_to_name: item.assigned_to
        ? profileByUser.get(item.assigned_to)?.full_name ?? "Sem nome"
        : null,
      queue_name: item.queue_id ? queueById.get(item.queue_id)?.name ?? null : null,
      lead_score,
      estimated_value_cents: extra?.estimated_value_cents ?? null,
      score_tier: scoreTierFromLeadScore(lead_score),
    };
  });

  const pipeline = [...pipelineMap.entries()]
    .map(([status, count]) => ({ status, count }))
    .sort((a, b) => b.count - a.count);

  return NextResponse.json({
    can_manage: canManage,
    days: lookbackDays,
    queues: queueMetrics,
    totals: {
      leads_total: leadsTotal,
      active_total: activeTotal,
      closed_total: closedTotal,
      unassigned_total: unassignedTotal,
      new_last_days: newLastDays,
    },
    consultants,
    pipeline,
    board,
  });
}
