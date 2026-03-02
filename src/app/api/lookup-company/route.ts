import { createServiceRoleClient } from "@/lib/supabase/admin";
import { NextResponse } from "next/server";

function toDigits(s: string): string {
  return s.replace(/\D/g, "");
}

/**
 * GET /api/lookup-company?cnpj=XX.XXX.XXX/XXXX-XX
 * Retorna o slug e nome da empresa se o CNPJ estiver cadastrado e ativo.
 * Público - sem autenticação.
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const cnpjRaw = searchParams.get("cnpj");
  const cnpj = cnpjRaw ? toDigits(cnpjRaw) : "";

  if (cnpj.length !== 14) {
    return NextResponse.json(
      { error: "CNPJ inválido. Informe os 14 dígitos." },
      { status: 400 }
    );
  }

  const admin = createServiceRoleClient();

  const { data: company, error: companyError } = await admin
    .from("companies")
    .select("id, name, slug")
    .eq("cnpj", cnpj)
    .single();

  if (companyError || !company) {
    return NextResponse.json(
      { error: "Empresa não encontrada com este CNPJ." },
      { status: 404 }
    );
  }

  const { data: link, error: linkError } = await admin
    .from("company_links")
    .select("slug, is_active")
    .eq("company_id", company.id)
    .single();

  if (linkError || !link || !link.is_active) {
    return NextResponse.json(
      { error: "Acesso não disponível para esta empresa." },
      { status: 404 }
    );
  }

  const slug = link.slug ?? company.slug;
  if (!slug) {
    return NextResponse.json(
      { error: "Link da empresa não configurado." },
      { status: 404 }
    );
  }

  return NextResponse.json({
    slug,
    name: company.name ?? undefined,
  });
}
