import { getCompanyIdFromRequest } from "@/lib/auth/get-company";
import { requirePermission } from "@/lib/auth/get-profile";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { NextResponse } from "next/server";

/**
 * GET /api/queues/[id]/assignments
 * Lista atendentes atribuídos a esta caixa (fila).
 */
export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const companyId = await getCompanyIdFromRequest(request);
  if (!companyId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const err = await requirePermission(companyId, PERMISSIONS.queues.manage);
  if (err) {
    return NextResponse.json({ error: err.error }, { status: err.status });
  }
  const { id: queueId } = await context.params;
  if (!queueId) {
    return NextResponse.json({ error: "Queue ID required" }, { status: 400 });
  }

  const supabase = await createClient();
  const { data: queue } = await supabase
    .from("queues")
    .select("id, company_id")
    .eq("id", queueId)
    .eq("company_id", companyId)
    .single();
  if (!queue) {
    return NextResponse.json({ error: "Fila não encontrada" }, { status: 404 });
  }

  const { data: rows, error } = await supabase
    .from("queue_assignments")
    .select("user_id")
    .eq("queue_id", queueId)
    .eq("company_id", companyId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const userIds = (rows ?? []).map((r) => r.user_id);

  const admin = createServiceRoleClient();
  const { data: allProfiles } = await admin
    .from("profiles")
    .select("user_id, full_name, email")
    .eq("company_id", companyId);

  const allUsers = (allProfiles ?? []).map((p) => ({
    user_id: (p as { user_id: string }).user_id,
    full_name: (p as { full_name?: string }).full_name ?? null,
    email: (p as { email?: string }).email ?? null,
  }));

  const assignedUsers = userIds.length === 0 ? [] : allUsers.filter((u) => userIds.includes(u.user_id));

  return NextResponse.json({ user_ids: userIds, users: assignedUsers, all_users: allUsers });
}

/**
 * PUT /api/queues/[id]/assignments
 * Body: { user_ids: string[] }
 * Define os atendentes atribuídos a esta caixa (substitui a lista).
 */
export async function PUT(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const companyId = await getCompanyIdFromRequest(request);
  if (!companyId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const err = await requirePermission(companyId, PERMISSIONS.queues.manage);
  if (err) {
    return NextResponse.json({ error: err.error }, { status: err.status });
  }
  const { id: queueId } = await context.params;
  if (!queueId) {
    return NextResponse.json({ error: "Queue ID required" }, { status: 400 });
  }

  let body: { user_ids?: string[] };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const userIds = Array.isArray(body?.user_ids)
    ? body.user_ids.filter((id): id is string => typeof id === "string").map((id) => id.trim()).filter(Boolean)
    : [];

  const supabase = await createClient();
  const { data: queue } = await supabase
    .from("queues")
    .select("id, company_id")
    .eq("id", queueId)
    .eq("company_id", companyId)
    .single();
  if (!queue) {
    return NextResponse.json({ error: "Fila não encontrada" }, { status: 404 });
  }

  const { error: delError } = await supabase
    .from("queue_assignments")
    .delete()
    .eq("queue_id", queueId)
    .eq("company_id", companyId);
  if (delError) {
    return NextResponse.json({ error: delError.message }, { status: 500 });
  }

  if (userIds.length > 0) {
    const rows = userIds.map((user_id) => ({
      queue_id: queueId,
      user_id,
      company_id: companyId,
    }));
    const { error: insertError } = await supabase.from("queue_assignments").insert(rows);
    if (insertError) {
      return NextResponse.json({ error: insertError.message }, { status: 500 });
    }
  }

  return NextResponse.json({ ok: true, user_ids: userIds });
}
