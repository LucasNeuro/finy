import { getCompanyIdFromCookie } from "@/lib/auth/get-company";
import { requireAdmin } from "@/lib/auth/get-profile";
import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { NextResponse } from "next/server";

export async function GET() {
  const companyId = await getCompanyIdFromCookie();
  if (!companyId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("companies")
    .select(
      "id, name, slug, cnpj, razao_social, nome_fantasia, situacao_cadastral, porte_empresa, natureza_juridica, email, logradouro, numero, complemento, bairro, cep, uf, municipio"
    )
    .eq("id", companyId)
    .single();
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json(data ?? {});
}

const EDITABLE_FIELDS = [
  "name",
  "nome_fantasia",
  "email",
  "logradouro",
  "numero",
  "complemento",
  "bairro",
  "cep",
  "uf",
  "municipio",
] as const;

export async function PATCH(request: Request) {
  const companyId = await getCompanyIdFromCookie();
  if (!companyId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const adminError = await requireAdmin(companyId);
  if (adminError) {
    return NextResponse.json({ error: adminError.error }, { status: adminError.status });
  }
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const updates: Record<string, string> = {};
  for (const key of EDITABLE_FIELDS) {
    const v = body[key];
    if (typeof v === "string") {
      updates[key] = v.trim();
    } else if (v === null || v === undefined) {
      updates[key] = "";
    }
  }
  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });
  }
  const admin = createServiceRoleClient();
  const { data, error } = await admin
    .from("companies")
    .update(updates)
    .eq("id", companyId)
    .select()
    .single();
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json(data);
}
