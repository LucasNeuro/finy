import { getCompanyIdFromRequest } from "@/lib/auth/get-company";
import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

/**
 * GET /api/company/agents
 * Lista atendentes da empresa (para dropdown de atribuição a grupos/comunidades).
 */
export async function GET(request: Request) {
  const companyId = await getCompanyIdFromRequest(request);
  if (!companyId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("profiles")
    .select("id, user_id, full_name, email")
    .eq("company_id", companyId)
    .eq("is_active", true)
    .order("full_name");

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  const list = (data ?? []).map((p) => ({
    id: p.id,
    user_id: p.user_id,
    full_name: p.full_name ?? p.email ?? "Sem nome",
    email: p.email ?? undefined,
  }));
  return NextResponse.json(list);
}
