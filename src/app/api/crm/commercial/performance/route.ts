import { getCompanyIdFromRequest } from "@/lib/auth/get-company";
import { requirePermission } from "@/lib/auth/get-profile";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

type ConversationRow = {
  id: string;
  queue_id: string | null;
  assigned_to: string | null;
  status: string | null;
  created_at: string | null;
};

type MessageRow = {
  conversation_id: string;
  direction: "in" | "out";
  sent_at: string | null;
  created_at: string | null;
};

function asDayKey(value: string | null | undefined): string {
  if (!value) return "sem-data";
  return value.slice(0, 10);
}

function normalizeStatus(value: string | null | undefined): string {
  const status = String(value ?? "").trim().toLowerCase();
  return status || "open";
}

function diffMinutes(fromIso: string, toIso: string): number {
  return Math.max(0, Math.round((new Date(toIso).getTime() - new Date(fromIso).getTime()) / 60000));
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
  const days = Math.max(1, Math.min(Number(searchParams.get("days") ?? 30) || 30, 180));
  const queueIdParam = searchParams.get("queue_id")?.trim() || null;
  const sinceIso = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

  const [manageTicketsErr, seeAllErr] = await Promise.all([
    requirePermission(companyId, PERMISSIONS.inbox.manage_tickets),
    requirePermission(companyId, PERMISSIONS.inbox.see_all),
  ]);
  const canManage = manageTicketsErr === null || seeAllErr === null;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: queues, error: queueErr } = await supabase
    .from("queues")
    .select("id")
    .eq("company_id", companyId)
    .eq("queue_type", "commercial");

  if (queueErr) {
    return NextResponse.json({ error: queueErr.message }, { status: 500 });
  }

  let queueIds = (queues ?? []).map((q) => q.id as string);
  if (queueIdParam) {
    queueIds = queueIds.filter((id) => id === queueIdParam);
  }

  if (!canManage && user?.id) {
    const { data: ownAssignments } = await supabase
      .from("queue_assignments")
      .select("queue_id")
      .eq("company_id", companyId)
      .eq("user_id", user.id);
    const allowed = new Set((ownAssignments ?? []).map((r) => r.queue_id as string));
    queueIds = queueIds.filter((id) => allowed.has(id));
  }

  if (queueIds.length === 0) {
    return NextResponse.json({
      can_manage: canManage,
      days,
      totals: {
        leads_total: 0,
        assigned_total: 0,
        closed_total: 0,
        conversion_rate: 0,
        avg_first_response_min: null,
      },
      timeline: [],
      consultants: [],
    });
  }

  let convQuery = supabase
    .from("conversations")
    .select("id, queue_id, assigned_to, status, created_at")
    .eq("company_id", companyId)
    .in("queue_id", queueIds)
    .eq("kind", "ticket")
    .gte("created_at", sinceIso);

  if (!canManage && user?.id) {
    convQuery = convQuery.eq("assigned_to", user.id);
  }

  const { data: conversations, error: convErr } = await convQuery;
  if (convErr) {
    return NextResponse.json({ error: convErr.message }, { status: 500 });
  }

  const convList = (conversations ?? []) as ConversationRow[];
  const convIds = convList.map((c) => c.id);

  const consultantIds = [...new Set(convList.map((c) => c.assigned_to).filter(Boolean))] as string[];
  const admin = createServiceRoleClient();
  const { data: profileRows } =
    consultantIds.length > 0
      ? await admin
          .from("profiles")
          .select("user_id, full_name, email")
          .eq("company_id", companyId)
          .in("user_id", consultantIds)
      : { data: [] as { user_id: string; full_name?: string | null; email?: string | null }[] };

  const nameByUser = new Map<string, string>();
  for (const row of (profileRows ?? []) as { user_id: string; full_name?: string | null; email?: string | null }[]) {
    nameByUser.set(row.user_id, (row.full_name ?? "").trim() || row.email || "Sem nome");
  }

  let firstResponseByConversation = new Map<string, number>();
  if (convIds.length > 0 && convIds.length <= 1200) {
    const { data: messageRows, error: messageErr } = await supabase
      .from("messages")
      .select("conversation_id, direction, sent_at, created_at")
      .in("conversation_id", convIds)
      .order("sent_at", { ascending: true });

    if (!messageErr) {
      const grouped = new Map<string, MessageRow[]>();
      for (const row of (messageRows ?? []) as MessageRow[]) {
        if (!grouped.has(row.conversation_id)) grouped.set(row.conversation_id, []);
        grouped.get(row.conversation_id)!.push(row);
      }

      for (const [conversationId, rows] of grouped.entries()) {
        const firstInbound = rows.find((m) => m.direction === "in");
        if (!firstInbound) continue;
        const inboundAt = firstInbound.sent_at ?? firstInbound.created_at;
        if (!inboundAt) continue;
        const firstOutboundAfter = rows.find((m) => {
          if (m.direction !== "out") return false;
          const outAt = m.sent_at ?? m.created_at;
          return !!outAt && new Date(outAt).getTime() >= new Date(inboundAt).getTime();
        });
        if (!firstOutboundAfter) continue;
        const outAt = firstOutboundAfter.sent_at ?? firstOutboundAfter.created_at;
        if (!outAt) continue;
        firstResponseByConversation.set(conversationId, diffMinutes(inboundAt, outAt));
      }
    }
  }

  let leadsTotal = 0;
  let assignedTotal = 0;
  let closedTotal = 0;
  const timelineMap = new Map<string, { leads: number; closed: number }>();
  const perConsultant = new Map<
    string,
    {
      leads_total: number;
      closed_total: number;
      assigned_total: number;
      response_samples: number;
      response_sum_min: number;
    }
  >();

  for (const conv of convList) {
    leadsTotal += 1;
    const assigned = !!conv.assigned_to;
    const closed = normalizeStatus(conv.status) === "closed";
    if (assigned) assignedTotal += 1;
    if (closed) closedTotal += 1;

    const day = asDayKey(conv.created_at);
    const dayStats = timelineMap.get(day) ?? { leads: 0, closed: 0 };
    dayStats.leads += 1;
    if (closed) dayStats.closed += 1;
    timelineMap.set(day, dayStats);

    if (!conv.assigned_to) continue;
    if (!perConsultant.has(conv.assigned_to)) {
      perConsultant.set(conv.assigned_to, {
        leads_total: 0,
        closed_total: 0,
        assigned_total: 0,
        response_samples: 0,
        response_sum_min: 0,
      });
    }
    const row = perConsultant.get(conv.assigned_to)!;
    row.leads_total += 1;
    row.assigned_total += 1;
    if (closed) row.closed_total += 1;
    const responseMin = firstResponseByConversation.get(conv.id);
    if (typeof responseMin === "number") {
      row.response_samples += 1;
      row.response_sum_min += responseMin;
    }
  }

  const responseValues = [...firstResponseByConversation.values()];
  const avgFirstResponseMin =
    responseValues.length > 0
      ? Number(
          (
            responseValues.reduce((sum, value) => sum + value, 0) /
            responseValues.length
          ).toFixed(1)
        )
      : null;

  const consultants = [...perConsultant.entries()]
    .map(([userId, stats]) => {
      const avgResponse =
        stats.response_samples > 0
          ? Number((stats.response_sum_min / stats.response_samples).toFixed(1))
          : null;
      return {
        user_id: userId,
        full_name: nameByUser.get(userId) ?? "Sem nome",
        leads_total: stats.leads_total,
        assigned_total: stats.assigned_total,
        closed_total: stats.closed_total,
        conversion_rate:
          stats.leads_total > 0
            ? Number(((stats.closed_total / stats.leads_total) * 100).toFixed(1))
            : 0,
        avg_first_response_min: avgResponse,
      };
    })
    .sort((a, b) => b.leads_total - a.leads_total || a.full_name.localeCompare(b.full_name));

  const timeline = [...timelineMap.entries()]
    .map(([day, values]) => ({ day, ...values }))
    .sort((a, b) => a.day.localeCompare(b.day));

  const conversionRate = leadsTotal > 0 ? Number(((closedTotal / leadsTotal) * 100).toFixed(1)) : 0;

  return NextResponse.json({
    can_manage: canManage,
    days,
    totals: {
      leads_total: leadsTotal,
      assigned_total: assignedTotal,
      closed_total: closedTotal,
      conversion_rate: conversionRate,
      avg_first_response_min: avgFirstResponseMin,
    },
    timeline,
    consultants,
  });
}
