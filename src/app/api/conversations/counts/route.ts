import { getCompanyIdFromRequest } from "@/lib/auth/get-company";
import { getProfileForCompany, requirePermission } from "@/lib/auth/get-profile";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

/**
 * GET /api/conversations/counts
 * Retorna contagens por aba: mine, queues, individual, groups.
 * Usado para badges nos ícones da sidebar (Filas, Meus atendimentos, Contatos, Grupos).
 */
export async function GET(request: Request) {
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
    return NextResponse.json({ mine: 0, queues: 0, individual: 0, groups: 0 });
  }

  let queuesQ = supabase.from("conversations").select("id", { count: "exact", head: true }).eq("company_id", companyId);
  let mineQ = supabase.from("conversations").select("id", { count: "exact", head: true }).eq("company_id", companyId).eq("assigned_to", user?.id ?? "");
  let individualQ = supabase.from("conversations").select("id", { count: "exact", head: true }).eq("company_id", companyId).eq("assigned_to", user?.id ?? "").eq("is_group", false);
  let groupsQ = supabase.from("conversations").select("id", { count: "exact", head: true }).eq("company_id", companyId).eq("assigned_to", user?.id ?? "").eq("is_group", true);

  if (allowedQueueIds !== null) {
    if (allowedGroupKeys.length === 0) {
      queuesQ = queuesQ.in("queue_id", allowedQueueIds);
      mineQ = mineQ.in("queue_id", allowedQueueIds);
      individualQ = individualQ.in("queue_id", allowedQueueIds);
      groupsQ = groupsQ.in("queue_id", allowedQueueIds);
    } else {
      const orPred = `queue_id.in.(${allowedQueueIds.join(",")}),external_id.in.("${allowedGroupKeys.map((k) => k.group_jid).join('","')}")`;
      queuesQ = queuesQ.or(orPred);
      mineQ = mineQ.or(orPred);
      individualQ = individualQ.or(orPred);
      groupsQ = groupsQ.or(orPred);
    }
  }

  const [queuesRes, mineRes, individualRes, groupsRes] = await Promise.all([
    queuesQ,
    mineQ,
    individualQ,
    groupsQ,
  ]);

  const mine = typeof mineRes.count === "number" ? mineRes.count : 0;
  const queues = typeof queuesRes.count === "number" ? queuesRes.count : 0;
  const individual = typeof individualRes.count === "number" ? individualRes.count : 0;
  const groups = typeof groupsRes.count === "number" ? groupsRes.count : 0;

  return NextResponse.json({ mine, queues, individual, groups });
}
