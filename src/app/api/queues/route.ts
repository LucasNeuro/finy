import { getCompanyIdFromRequest } from "@/lib/auth/get-company";
import { getProfileForCompany, requireAdmin } from "@/lib/auth/get-profile";
import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

function isColumnMissingError(message: string): boolean {
  const lower = message.toLowerCase();
  return (
    lower.includes("business_hours") ||
    lower.includes("special_dates") ||
    (lower.includes("column") && lower.includes("does not exist"))
  );
}

export async function GET(request: Request) {
  const companyId = await getCompanyIdFromRequest(request);
  if (!companyId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { searchParams } = new URL(request.url);
  const forInbox = searchParams.get("for_inbox") === "1";

  const supabase = await createClient();
  let allowedQueueIds: string[] | null = null;
  if (forInbox) {
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      const profile = await getProfileForCompany(companyId);
      const isFullAccess = profile?.is_owner || (profile?.role === "admin" && !profile?.role_id);
      if (!isFullAccess) {
        const { data: assignments } = await supabase
          .from("queue_assignments")
          .select("queue_id")
          .eq("user_id", user.id)
          .eq("company_id", companyId);
        allowedQueueIds = (assignments ?? []).map((r: { queue_id: string }) => r.queue_id);
      }
    }
  }

  type Row = { id: string; name: string; slug: string; created_at?: string; business_hours?: unknown; special_dates?: unknown };
  let data: Row[] | null = null;
  let error: { message: string } | null = null;

  let q = supabase
    .from("queues")
    .select("id, name, slug, created_at, business_hours, special_dates")
    .eq("company_id", companyId)
    .order("name");
  if (allowedQueueIds !== null) {
    if (allowedQueueIds.length === 0) {
      return NextResponse.json([]);
    }
    q = q.in("id", allowedQueueIds);
  }
  const res = await q;
  data = res.data;
  error = res.error;

  if (error && isColumnMissingError(error.message)) {
    const fallback = await supabase
      .from("queues")
      .select("id, name, slug, created_at")
      .eq("company_id", companyId)
      .order("name");
    if (fallback.error) {
      return NextResponse.json({ error: fallback.error.message }, { status: 500 });
    }
    const withExtras = (fallback.data ?? []).map((row) => ({
      ...row,
      business_hours: [] as unknown,
      special_dates: [] as unknown,
    }));
    return NextResponse.json(withExtras);
  }
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  const normalized = (data ?? []).map((row) => ({
    ...row,
    special_dates: Array.isArray(row.special_dates) ? row.special_dates : [],
  }));
  return NextResponse.json(normalized);
}

export async function POST(request: Request) {
  const companyId = await getCompanyIdFromRequest(request);
  if (!companyId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const adminError = await requireAdmin(companyId);
  if (adminError) {
    return NextResponse.json({ error: adminError.error }, { status: adminError.status });
  }
  let body: { name?: string; slug?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  const slug = typeof body?.slug === "string" ? body.slug.trim().toLowerCase().replace(/\s+/g, "-") : "";
  if (!name || !slug) {
    return NextResponse.json({ error: "name and slug required" }, { status: 400 });
  }
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("queues")
    .insert({ company_id: companyId, name, slug })
    .select("id, name, slug, created_at")
    .single();
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json(data);
}
