import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
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

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const limitParam = parseInt(url.searchParams.get("limit") || "20", 10);
  const unreadOnly = url.searchParams.get("unread") === "1";
  const limit = Number.isFinite(limitParam)
    ? Math.max(1, Math.min(100, limitParam))
    : 20;

  let query = supabase
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

  const { data, error, count } = await query;
  if (error) {
    console.error("[notifications] GET error", error);
    return NextResponse.json({ error: "Erro ao carregar notificações" }, { status: 500 });
  }

  const rows = (data ?? []) as (NotificationRow & { conversation_id?: string | null })[];

  const { count: unreadTotal, error: unreadErr } = await supabase
    .from("notifications")
    .select("*", { count: "exact", head: true })
    .eq("company_id", companyId)
    .eq("user_id", user.id)
    .eq("is_read", false);

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

