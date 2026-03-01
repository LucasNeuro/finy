import { getCompanyIdFromCookie } from "@/lib/auth/get-company";
import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const companyId = await getCompanyIdFromCookie();
  if (!companyId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { searchParams } = new URL(request.url);
  const queueId = searchParams.get("queue_id") ?? undefined;
  const status = searchParams.get("status") ?? undefined;
  const limit = Math.min(Number(searchParams.get("limit")) || 50, 100);
  const offset = Number(searchParams.get("offset")) || 0;

  const supabase = await createClient();
  let q = supabase
    .from("conversations")
    .select("id, channel_id, external_id, customer_phone, customer_name, queue_id, assigned_to, status, last_message_at, created_at", { count: "exact" })
    .eq("company_id", companyId)
    .order("last_message_at", { ascending: false })
    .range(offset, offset + limit - 1);
  if (queueId) q = q.eq("queue_id", queueId);
  if (status) q = q.eq("status", status);
  const { data, error, count } = await q;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ data: data ?? [], total: count ?? 0 });
}
