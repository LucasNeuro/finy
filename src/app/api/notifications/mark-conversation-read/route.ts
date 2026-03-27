import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { getCompanyIdFromRequest } from "@/lib/auth/get-company";

/**
 * POST /api/notifications/mark-conversation-read
 * Body: { conversation_id: string }
 * Marca como lidas as notificações de inbox dessa conversa para o usuário atual.
 * Chamado ao abrir o chat — o item some do contador "não lidas" do sino.
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

  let body: { conversation_id?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const conversationId =
    typeof body?.conversation_id === "string" ? body.conversation_id.trim() : "";
  if (!conversationId) {
    return NextResponse.json({ error: "conversation_id é obrigatório" }, { status: 400 });
  }

  const now = new Date().toISOString();
  const { error } = await db
    .from("notifications")
    .update({ is_read: true, read_at: now })
    .eq("company_id", companyId)
    .eq("user_id", user.id)
    .eq("conversation_id", conversationId)
    .eq("is_read", false);

  if (error) {
    console.error("[notifications] mark-conversation-read error", error);
    return NextResponse.json({ error: "Erro ao atualizar notificações" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
