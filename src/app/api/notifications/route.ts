import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { getCompanyIdFromRequest } from "@/lib/auth/get-company";

type NotificationRow = {
  id: string;
  company_id: string;
  user_id: string;
  kind: string;
  title: string;
  body: string | null;
  link: string | null;
  data: unknown;
  is_read: boolean;
  created_at: string;
  conversation_id?: string | null;
};

/**
 * GET /api/notifications
 * Lista notificações recentes do usuário logado na empresa atual.
 * Query params:
 *  - limit: número máximo de registros (padrão 20, máx 100)
 *  - unread: "1" para retornar apenas não lidas
 */
export async function GET(request: Request) {
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

  /** Service role + filtro explícito por user.id: evita linhas “invisíveis” por RLS/jwt edge cases. */
  let db = supabaseUser as typeof supabaseUser | ReturnType<typeof createServiceRoleClient>;
  try {
    db = createServiceRoleClient();
  } catch {
    /* SUPABASE_SERVICE_ROLE_KEY ausente (ex.: dev): mantém cliente com sessão */
  }

  const url = new URL(request.url);
  const limitParam = parseInt(url.searchParams.get("limit") || "20", 10);
  const unreadOnly = url.searchParams.get("unread") === "1";
  const limit = Number.isFinite(limitParam)
    ? Math.max(1, Math.min(100, limitParam))
    : 20;

  let query = db
    .from("notifications")
    .select(
      "id, company_id, user_id, kind, title, body, link, data, is_read, created_at, conversation_id",
      { count: "exact" }
    )
    .eq("company_id", companyId)
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (unreadOnly) {
    query = query.eq("is_read", false);
  }

  let { data, error, count } = await query;

  // Coluna conversation_id ainda não migrada: tenta sem ela
  if (error?.message?.includes("conversation_id") || error?.code === "42703") {
    let q2 = db
      .from("notifications")
      .select("id, company_id, user_id, kind, title, body, link, data, is_read, created_at", { count: "exact" })
      .eq("company_id", companyId)
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(limit);
    if (unreadOnly) q2 = q2.eq("is_read", false);
    const r2 = await q2;
    data = r2.data;
    error = r2.error;
    count = r2.count;
  }

  if (error) {
    console.error("[notifications] GET error", error);
    return NextResponse.json({ error: "Erro ao carregar notificações" }, { status: 500 });
  }

  const rows = (data ?? []) as (NotificationRow & { conversation_id?: string | null })[];

  let unreadTotal: number | null = null;
  const unreadCountQ = db
    .from("notifications")
    .select("*", { count: "exact", head: true })
    .eq("company_id", companyId)
    .eq("user_id", user.id)
    .eq("is_read", false);
  const { count: u1, error: unreadErr } = await unreadCountQ;
  if (!unreadErr && typeof u1 === "number") unreadTotal = u1;
  if (unreadErr) {
    console.error("[notifications] GET unread count error", unreadErr);
  }

  const unread = typeof unreadTotal === "number" ? unreadTotal : rows.filter((n) => !n.is_read).length;

  return NextResponse.json({
    items: rows,
    unread,
    total: count ?? rows.length,
  });
}

