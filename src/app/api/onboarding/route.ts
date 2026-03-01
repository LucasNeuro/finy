import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { NextResponse } from "next/server";

type OnboardingBody = {
  name?: string;
  slug?: string;
  cnpj?: string;
  razao_social?: string;
  nome_fantasia?: string;
  situacao_cadastral?: string;
  logradouro?: string;
  numero?: string;
  complemento?: string;
  bairro?: string;
  cep?: string;
  uf?: string;
  municipio?: string;
  email?: string;
  telefones?: unknown;
  opencnpj_raw?: unknown;
  queue_name?: string;
};

function str(v: unknown): string | undefined {
  return typeof v === "string" && v.trim() ? v.trim() : undefined;
}

function toDigits(s: string): string {
  return s.replace(/\D/g, "");
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: OnboardingBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const name = str(body?.name) ?? "";
  const slugRaw = str(body?.slug);
  const slug = slugRaw
    ? slugRaw.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "")
    : "";
  if (!name || !slug) {
    return NextResponse.json({ error: "name and slug required" }, { status: 400 });
  }

  const admin = createServiceRoleClient();

  const existingSlug = await admin.from("companies").select("id").eq("slug", slug).single();
  if (existingSlug.data) {
    return NextResponse.json({ error: "Slug already in use" }, { status: 409 });
  }

  const cnpjClean = body.cnpj ? toDigits(body.cnpj) : null;
  if (cnpjClean && cnpjClean.length === 14) {
    const existingCnpj = await admin.from("companies").select("id").eq("cnpj", cnpjClean).single();
    if (existingCnpj.data) {
      return NextResponse.json({ error: "CNPJ já cadastrado" }, { status: 409 });
    }
  }

  const companyInsert: Record<string, unknown> = {
    name,
    slug,
    ...(cnpjClean && cnpjClean.length === 14 && { cnpj: cnpjClean }),
    ...(str(body.razao_social) && { razao_social: str(body.razao_social) }),
    ...(str(body.nome_fantasia) && { nome_fantasia: str(body.nome_fantasia) }),
    ...(str(body.situacao_cadastral) && { situacao_cadastral: str(body.situacao_cadastral) }),
    ...(str(body.logradouro) && { logradouro: str(body.logradouro) }),
    ...(str(body.numero) && { numero: str(body.numero) }),
    ...(str(body.complemento) && { complemento: str(body.complemento) }),
    ...(str(body.bairro) && { bairro: str(body.bairro) }),
    ...(str(body.cep) && { cep: str(body.cep) }),
    ...(str(body.uf) && { uf: str(body.uf) }),
    ...(str(body.municipio) && { municipio: str(body.municipio) }),
    ...(str(body.email) && { email: str(body.email) }),
    ...(body.telefones != null && { telefones: body.telefones }),
    ...(body.opencnpj_raw != null && { opencnpj_raw: body.opencnpj_raw }),
  };

  const { data: company, error: companyError } = await admin
    .from("companies")
    .insert(companyInsert)
    .select("id, name, slug")
    .single();
  if (companyError || !company) {
    return NextResponse.json({ error: companyError?.message ?? "Failed to create company" }, { status: 500 });
  }

  const { error: profileError } = await admin.from("profiles").insert({
    user_id: user.id,
    company_id: company.id,
    role: "admin",
  });
  if (profileError) {
    return NextResponse.json({ error: profileError.message }, { status: 500 });
  }

  const queueName = str(body.queue_name) || "Padrão";
  const queueSlug = queueName.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "") || "default";
  const { data: queue } = await admin
    .from("queues")
    .insert({ company_id: company.id, name: queueName, slug: queueSlug })
    .select("id")
    .single();

  return NextResponse.json({
    company: { id: company.id, name: company.name, slug: company.slug },
    queue: queue ? { id: queue.id } : null,
  });
}
