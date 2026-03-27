import { getCompanyIdFromRequest } from "@/lib/auth/get-company";
import { requirePermission } from "@/lib/auth/get-profile";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { isCommercialQueue } from "@/lib/queue/commercial";
import { peekNextAgentForQueue } from "@/lib/queue/round-robin";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

async function requireCommercialManagerPermission(companyId: string) {
  const manageTicketsErr = await requirePermission(companyId, PERMISSIONS.inbox.manage_tickets);
  if (!manageTicketsErr) return null;
  const queuesManageErr = await requirePermission(companyId, PERMISSIONS.queues.manage);
  if (!queuesManageErr) return null;
  return manageTicketsErr;
}

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const companyId = await getCompanyIdFromRequest(request);
  if (!companyId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const permErr = await requireCommercialManagerPermission(companyId);
  if (permErr) {
    return NextResponse.json({ error: permErr.error }, { status: permErr.status });
  }

  const { id: queueId } = await context.params;
  if (!queueId) {
    return NextResponse.json({ error: "Queue ID required" }, { status: 400 });
  }

  const supabase = await createClient();
  const { data: queue, error: queueErr } = await supabase
    .from("queues")
    .select("id, name, slug")
    .eq("id", queueId)
    .eq("company_id", companyId)
    .single();

  if (queueErr || !queue) {
    return NextResponse.json({ error: "Fila não encontrada" }, { status: 404 });
  }

  const commercial = await isCommercialQueue(supabase, companyId, queueId);
  if (!commercial) {
    return NextResponse.json({ error: "A fila não é do tipo comercial" }, { status: 400 });
  }

  const { data: assignmentRows, error: assignmentErr } = await supabase
    .from("queue_assignments")
    .select("user_id")
    .eq("company_id", companyId)
    .eq("queue_id", queueId);

  if (assignmentErr) {
    return NextResponse.json({ error: assignmentErr.message }, { status: 500 });
  }

  const userIds = [...new Set((assignmentRows ?? []).map((r) => r.user_id).filter(Boolean))] as string[];
  const admin = createServiceRoleClient();

  const { data: profileRows } =
    userIds.length > 0
      ? await admin
          .from("profiles")
          .select("user_id, full_name, email")
          .eq("company_id", companyId)
          .in("user_id", userIds)
      : { data: [] as { user_id: string; full_name?: string | null; email?: string | null }[] };

  const nameByUser = new Map<string, { full_name: string; email: string | null }>();
  for (const p of (profileRows ?? []) as { user_id: string; full_name?: string | null; email?: string | null }[]) {
    nameByUser.set(p.user_id, {
      full_name: (p.full_name ?? "").trim() || p.email || "Sem nome",
      email: p.email ?? null,
    });
  }

  const { data: conversations, error: convErr } = await supabase
    .from("conversations")
    .select("assigned_to, status, created_at")
    .eq("company_id", companyId)
    .eq("queue_id", queueId)
    .eq("kind", "ticket");

  if (convErr) {
    return NextResponse.json({ error: convErr.message }, { status: 500 });
  }

  const stats = new Map<
    string,
    { total_assigned: number; open_count: number; closed_count: number; last_assigned_at: string | null }
  >();
  for (const userId of userIds) {
    stats.set(userId, { total_assigned: 0, open_count: 0, closed_count: 0, last_assigned_at: null });
  }

  let unassignedCount = 0;
  for (const conv of (conversations ?? []) as { assigned_to?: string | null; status?: string | null; created_at?: string | null }[]) {
    const assignedTo = conv.assigned_to ?? null;
    const createdAt = conv.created_at ?? null;
    const isClosed = String(conv.status ?? "").toLowerCase() === "closed";

    if (!assignedTo) {
      unassignedCount += 1;
      continue;
    }
    if (!stats.has(assignedTo)) continue;
    const current = stats.get(assignedTo)!;
    current.total_assigned += 1;
    if (isClosed) current.closed_count += 1;
    else current.open_count += 1;
    if (createdAt && (!current.last_assigned_at || new Date(createdAt).getTime() > new Date(current.last_assigned_at).getTime())) {
      current.last_assigned_at = createdAt;
    }
  }

  const rrState = await peekNextAgentForQueue(companyId, queueId);

  const agents = userIds.map((userId) => {
    const identity = nameByUser.get(userId);
    const byUser = stats.get(userId) ?? {
      total_assigned: 0,
      open_count: 0,
      closed_count: 0,
      last_assigned_at: null,
    };
    return {
      user_id: userId,
      full_name: identity?.full_name ?? "Sem nome",
      email: identity?.email ?? null,
      ...byUser,
      is_next: rrState.nextAgentId === userId,
      is_last: rrState.lastAgentId === userId,
    };
  });

  return NextResponse.json({
    queue,
    pointer: {
      last_agent_id: rrState.lastAgentId,
      next_agent_id: rrState.nextAgentId,
    },
    unassigned_count: unassignedCount,
    agents,
  });
}
