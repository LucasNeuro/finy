import { getCompanyIdFromRequest } from "@/lib/auth/get-company";
import { getProfileForCompany } from "@/lib/auth/get-profile";
import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const companyId = await getCompanyIdFromRequest(request);
  if (!companyId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { searchParams } = new URL(request.url);
  const queueIdParam = searchParams.get("queue_id") ?? undefined;
  const status = searchParams.get("status") ?? undefined;
  const limit = Math.min(Number(searchParams.get("limit")) || 50, 100);
  const offset = Number(searchParams.get("offset")) || 0;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  let allowedQueueIds: string[] | null = null;
  if (user) {
    const profile = await getProfileForCompany(companyId);
    const isFullAccess = profile?.is_owner || (profile?.role === "admin" && !profile?.role_id);
    if (!isFullAccess && profile) {
      const { data: assignments } = await supabase
        .from("queue_assignments")
        .select("queue_id")
        .eq("user_id", user.id)
        .eq("company_id", companyId);
      allowedQueueIds = (assignments ?? []).map((r: { queue_id: string }) => r.queue_id);
    }
  }

  let q = supabase
    .from("conversations")
    .select("id, channel_id, external_id, customer_phone, customer_name, queue_id, assigned_to, status, last_message_at, created_at", { count: "exact" })
    .eq("company_id", companyId)
    .order("last_message_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (allowedQueueIds !== null) {
    if (allowedQueueIds.length === 0) {
      return NextResponse.json({ data: [], total: 0 });
    }
    q = q.in("queue_id", allowedQueueIds);
  }
  if (queueIdParam) {
    q = q.eq("queue_id", queueIdParam);
    if (allowedQueueIds !== null && !allowedQueueIds.includes(queueIdParam)) {
      return NextResponse.json({ data: [], total: 0 });
    }
  }
  if (status) q = q.eq("status", status);

  const { data, error, count } = await q;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ data: data ?? [], total: count ?? 0 });
}
