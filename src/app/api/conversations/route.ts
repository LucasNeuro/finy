import { getCompanyIdFromRequest } from "@/lib/auth/get-company";
import { getProfileForCompany, requirePermission } from "@/lib/auth/get-profile";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

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
  const queueIdParam = searchParams.get("queue_id") ?? undefined;
  const status = searchParams.get("status") ?? undefined;
  const limit = Math.min(Number(searchParams.get("limit")) || 50, 100);
  const offset = Number(searchParams.get("offset")) || 0;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  let allowedQueueIds: string[] | null = null;
  let allowedGroupKeys: { channel_id: string; group_jid: string }[] = [];
  if (user) {
    const profile = await getProfileForCompany(companyId);
    if (profile) {
      const seeAllErr = await requirePermission(companyId, PERMISSIONS.inbox.see_all);
      const canSeeAll = seeAllErr === null;
      if (!canSeeAll) {
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

  type ConvRow = { id: string; channel_id: string; external_id: string; customer_phone: string; customer_name: string | null; queue_id: string | null; assigned_to: string | null; status: string; last_message_at: string; created_at: string };

  if (allowedQueueIds !== null && allowedQueueIds.length === 0 && allowedGroupKeys.length === 0) {
    return NextResponse.json({ data: [], total: 0 });
  }

  const selectFields = "id, channel_id, external_id, customer_phone, customer_name, queue_id, assigned_to, status, last_message_at, created_at";

  let q = supabase
    .from("conversations")
    .select(selectFields, { count: "exact" })
    .eq("company_id", companyId)
    .order("last_message_at", { ascending: false });

  if (allowedQueueIds !== null) {
    if (allowedGroupKeys.length === 0) {
      q = q.in("queue_id", allowedQueueIds);
    } else {
      q = q.or(`queue_id.in.(${allowedQueueIds.join(",")}),external_id.in.("${allowedGroupKeys.map((k) => k.group_jid).join('","')}")`);
    }
  }
  if (queueIdParam) {
    q = q.eq("queue_id", queueIdParam);
    if (allowedQueueIds !== null && !allowedQueueIds.includes(queueIdParam)) {
      const groupJids = [...new Set(allowedGroupKeys.map((k) => k.group_jid))];
      if (groupJids.length === 0) return NextResponse.json({ data: [], total: 0 });
      q = supabase
        .from("conversations")
        .select(selectFields, { count: "exact" })
        .eq("company_id", companyId)
        .in("external_id", groupJids)
        .order("last_message_at", { ascending: false });
      const filteredByChannel = (rows: ConvRow[]) => rows.filter((c) => allowedGroupKeys.some((k) => k.channel_id === c.channel_id && k.group_jid === c.external_id));
      const { data: groupData, error: groupErr, count: groupCount } = await (status ? q.eq("status", status) : q).range(offset, offset + limit - 1);
      if (groupErr) return NextResponse.json({ error: groupErr.message }, { status: 500 });
      const list = filteredByChannel((groupData ?? []) as ConvRow[]);
      return NextResponse.json({ data: list, total: list.length });
    }
  }
  if (status) q = q.eq("status", status);
  q = q.range(offset, offset + limit - 1);

  const { data, error, count } = await q;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  let result = (data ?? []) as ConvRow[];
  if (allowedQueueIds !== null && allowedGroupKeys.length > 0) {
    result = result.filter((c) => {
      if (c.queue_id && allowedQueueIds!.includes(c.queue_id)) return true;
      if (allowedGroupKeys.some((k) => k.channel_id === c.channel_id && k.group_jid === c.external_id)) return true;
      return false;
    });
  }
  return NextResponse.json({ data: result, total: count ?? result.length });
}
