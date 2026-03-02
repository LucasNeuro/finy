import { getCompanyIdFromCookie } from "@/lib/auth/get-company";
import { requireAdmin } from "@/lib/auth/get-profile";
import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

/**
 * GET /api/company/links
 * Retorna o link da empresa atual (para admin ver/gerenciar)
 */
export async function GET() {
  const companyId = await getCompanyIdFromCookie();
  if (!companyId) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("company_links")
    .select("id, company_id, slug, is_active, created_at, updated_at")
    .eq("company_id", companyId)
    .single();

  if (error || !data) {
    return NextResponse.json({ error: error?.message ?? "Link não encontrado" }, { status: 404 });
  }

  return NextResponse.json(data);
}

/**
 * PATCH /api/company/links
 * Atualiza is_active do link (apenas admin)
 */
export async function PATCH(request: Request) {
  const companyId = await getCompanyIdFromCookie();
  if (!companyId) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  const adminError = await requireAdmin(companyId);
  if (adminError) {
    return NextResponse.json({ error: adminError.error }, { status: adminError.status });
  }

  let body: { is_active?: boolean };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const isActive = typeof body?.is_active === "boolean" ? body.is_active : undefined;
  if (isActive === undefined) {
    return NextResponse.json({ error: "is_active é obrigatório" }, { status: 400 });
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("company_links")
    .update({
      is_active: isActive,
      updated_at: new Date().toISOString(),
    })
    .eq("company_id", companyId)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data);
}
