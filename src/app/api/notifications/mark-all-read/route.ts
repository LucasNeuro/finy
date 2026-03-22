import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { getCompanyIdFromRequest } from "@/lib/auth/get-company";

/**
 * POST /api/notifications/mark-all-read
 * Marca todas as notificações do usuário na empresa atual como lidas.
 */
export async function POST(request: Request) {
  const companyId = await getCompanyIdFromRequest(request);
  if (!companyId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabaseUser = await createClient();
  const {
    data: { user },
  } = await supabaseUser.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let db: typeof supabaseUser | ReturnType<typeof createServiceRoleClient> = supabaseUser;
  try {
    db = createServiceRoleClient();
  } catch {
    /* fallback sessão */
  }

  const { error } = await db
    .from("notifications")
    .update({ is_read: true, read_at: new Date().toISOString() })
    .eq("company_id", companyId)
    .eq("user_id", user.id)
    .eq("is_read", false);

  if (error) {
    console.error("[notifications] mark-all-read error", error);
    return NextResponse.json(
      { error: "Erro ao marcar notificações como lidas" },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true });
}

