import { getCompanyIdFromRequest } from "@/lib/auth/get-company";
import { requirePermission } from "@/lib/auth/get-profile";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { invalidateConversationList } from "@/lib/redis/inbox-state";
import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

/**
 * PUT /api/ticket-statuses/reorder
 * Reordena os status da empresa. Body: { order: [id1, id2, id3, ...] }
 * Requer queues.manage.
 */
export async function PUT(request: Request) {
  const companyId = await getCompanyIdFromRequest(request);
  if (!companyId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const err = await requirePermission(companyId, PERMISSIONS.queues.manage);
  if (err) {
    return NextResponse.json({ error: err.error }, { status: err.status });
  }

  let body: { order?: string[] };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const order = Array.isArray(body.order) ? body.order.filter(Boolean) : [];
  if (order.length === 0) {
    return NextResponse.json({ error: "Ordem vazia" }, { status: 400 });
  }

  const supabase = await createClient();

  for (let i = 0; i < order.length; i++) {
    const { error } = await supabase
      .from("company_ticket_statuses")
      .update({ sort_order: i, updated_at: new Date().toISOString() })
      .eq("id", order[i])
      .eq("company_id", companyId)
      .is("queue_id", null);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
  }

  await invalidateConversationList(companyId);
  return NextResponse.json({ ok: true });
}
