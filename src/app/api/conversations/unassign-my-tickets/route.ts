import { getCompanyIdFromRequest } from "@/lib/auth/get-company";
import { requirePermission } from "@/lib/auth/get-profile";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { invalidateConversationList } from "@/lib/redis/inbox-state";
import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

/**
 * POST /api/conversations/unassign-my-tickets
 * Desatribui todos os tickets do usuário logado (esvazia "Meus").
 * Seta assigned_to = null e status = 'open' para voltar às filas em Abertos.
 * Aguardando é para casos específicos (ex: esperando resposta); desatribuídos vão para Abertos.
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

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data, error } = await supabase
    .from("conversations")
    .update({
      assigned_to: null,
      status: "open",
      updated_at: new Date().toISOString(),
    })
    .eq("company_id", companyId)
    .eq("assigned_to", user.id)
    .select("id");

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const count = Array.isArray(data) ? data.length : 0;
  await invalidateConversationList(companyId);

  return NextResponse.json({ count });
}
