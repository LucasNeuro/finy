import { getCompanyIdFromRequest } from "@/lib/auth/get-company";
import { getProfileForCompany, requirePermission } from "@/lib/auth/get-profile";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { invalidateConversationList } from "@/lib/redis/inbox-state";
import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

/**
 * POST /api/conversations/reset-to-open
 * Coloca todos os tickets da aba selecionada em status "open" para corresponder ao Kanban.
 * Body: { filter: "queues" | "mine" }
 */
export async function POST(request: Request) {
  const companyId = await getCompanyIdFromRequest(request);
  if (!companyId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const err = await requirePermission(companyId, PERMISSIONS.inbox.read);
  if (err) {
    return NextResponse.json({ error: err.error }, { status: err.status });
  }

  let body: { filter?: string };
  try {
    body = await request.json().catch(() => ({}));
  } catch {
    body = {};
  }
  const filter = body.filter === "mine" ? "mine" : body.filter === "queues" ? "queues" : null;
  if (!filter) {
    return NextResponse.json({ error: "filter deve ser 'queues' ou 'mine'" }, { status: 400 });
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let q = supabase
    .from("conversations")
    .update({
      status: "open",
      updated_at: new Date().toISOString(),
    })
    .eq("company_id", companyId)
    .neq("status", "closed");

  if (filter === "mine") {
    q = q.eq("assigned_to", user.id);
  } else {
    const profile = await getProfileForCompany(companyId);
    const [seeAllErr] = await Promise.all([
      requirePermission(companyId, PERMISSIONS.inbox.see_all),
    ]);
    const canSeeAll = seeAllErr === null;

    if (!canSeeAll && profile) {
      const { data: assignments } = await supabase
        .from("queue_assignments")
        .select("queue_id")
        .eq("user_id", user.id)
        .eq("company_id", companyId);
      const allowedQueueIds = (assignments ?? []).map((r: { queue_id: string }) => r.queue_id);
      const { data: groupAssignments } = await supabase
        .from("channel_group_assignments")
        .select("channel_id, group_jid")
        .eq("user_id", user.id)
        .eq("company_id", companyId);
      const allowedGroupKeys = (groupAssignments ?? []).map((r: { channel_id: string; group_jid: string }) => ({ channel_id: r.channel_id, group_jid: r.group_jid }));

      if (allowedQueueIds.length === 0 && allowedGroupKeys.length === 0) {
        return NextResponse.json({ count: 0 });
      }
      if (allowedGroupKeys.length === 0) {
        q = q.in("queue_id", allowedQueueIds);
      } else {
        const groupJids = allowedGroupKeys.map((k) => k.group_jid);
        const queuePart = allowedQueueIds.length > 0 ? `queue_id.in.(${allowedQueueIds.join(",")})` : "";
        const groupPart = `external_id.in.("${groupJids.join('","')}")`;
        const orPred = queuePart ? `${queuePart},${groupPart}` : groupPart;
        q = q.or(orPred);
      }
    }
  }

  const { data, error } = await q.select("id");

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const count = Array.isArray(data) ? data.length : 0;
  await invalidateConversationList(companyId);

  return NextResponse.json({ count });
}
