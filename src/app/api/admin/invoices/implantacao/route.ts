import { NextResponse } from "next/server";
import { verifyPlatformOwnerAuth } from "@/lib/admin-auth";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { emitInvoice } from "@/lib/cora";
import { randomUUID } from "crypto";

const INVOICES_BUCKET = "company-invoices";
const SIGNED_URL_EXPIRES = 60 * 60; // 1 hora

export async function POST(request: Request) {
  const ok = await verifyPlatformOwnerAuth();
  if (!ok) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  let body: { company_id?: string; amount_reais?: unknown; due_date?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const companyId = body?.company_id;
  if (!companyId) return NextResponse.json({ error: "company_id é obrigatório" }, { status: 400 });

  const amountReais = Number(body?.amount_reais);
  if (!Number.isFinite(amountReais) || amountReais <= 0) {
    return NextResponse.json({ error: "amount_reais deve ser um número > 0" }, { status: 400 });
  }

  const dueDate = body?.due_date;
  if (typeof dueDate !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(dueDate)) {
    return NextResponse.json({ error: "due_date deve estar no formato YYYY-MM-DD" }, { status: 400 });
  }

  const dueDateObj = new Date(`${dueDate}T00:00:00.000Z`);
  if (Number.isNaN(dueDateObj.getTime())) {
    return NextResponse.json({ error: "due_date inválida" }, { status: 400 });
  }

  const today = new Date();
  const todayUtc = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
  if (dueDateObj < todayUtc) {
    return NextResponse.json({ error: "due_date precisa ser futura" }, { status: 400 });
  }

  const supabase = createServiceRoleClient();

  // Garante bucket
  try {
    const { data: buckets } = await supabase.storage.listBuckets();
    if (!buckets?.some((b) => b.name === INVOICES_BUCKET)) {
      await supabase.storage.createBucket(INVOICES_BUCKET, {
        public: false,
        fileSizeLimit: 10485760,
      });
    }
  } catch {
    /* bucket pode já existir */
  }

  const { data: company, error: companyError } = await supabase
    .from("companies")
    .select(
      "id, name, slug, cnpj, razao_social, nome_fantasia, email, logradouro, numero, complemento, bairro, cep, uf, municipio"
    )
    .eq("id", companyId)
    .single();

  if (companyError || !company) {
    return NextResponse.json({ error: "Empresa não encontrada" }, { status: 404 });
  }

  const cnpjDigits = (company.cnpj ?? "").replace(/\D/g, "");
  if (cnpjDigits.length !== 14) {
    return NextResponse.json(
      { error: "Empresa sem CNPJ válido. Cadastre o CNPJ no perfil da empresa para gerar cobrança." },
      { status: 400 }
    );
  }

  const hasAddress =
    company.logradouro &&
    company.numero &&
    company.bairro &&
    company.municipio &&
    company.uf &&
    company.cep;

  if (!hasAddress) {
    return NextResponse.json(
      {
        error:
          "Empresa sem endereço completo. Cadastre logradouro, número, bairro, cidade, UF e CEP no perfil para gerar cobrança.",
      },
      { status: 400 }
    );
  }

  const amountCents = Math.max(500, Math.round(amountReais * 100));

  const customerName = (
    (company.nome_fantasia ?? company.razao_social ?? company.name ?? "").slice(0, 60) || company.name
  ) as string;
  const customerEmail = (company.email ?? "").slice(0, 60) || undefined;

  const address = {
    street: String(company.logradouro).slice(0, 200),
    number: String(company.numero).slice(0, 20),
    district: String(company.bairro).slice(0, 100),
    city: String(company.municipio).slice(0, 100),
    state: String(company.uf).slice(0, 2).toUpperCase(),
    zip_code: String(company.cep).replace(/\D/g, "").slice(0, 8),
    complement: (company.complemento ? String(company.complemento) : "").slice(0, 100),
  };

  const dueDateStr = dueDate; // YYYY-MM-DD

  const payload = {
    code: `clicvend-${companyId}-implant-${dueDateStr.replace(/-/g, "")}`,
    customer: {
      name: customerName,
      email: customerEmail,
      document: { identity: cnpjDigits, type: "CNPJ" as const },
      address,
    },
    services: [
      {
        name: "Taxa de Implantação ClicVend",
        description: `Cobrança de implantação (${dueDateStr})`.slice(0, 100),
        amount: amountCents,
      },
    ],
    payment_terms: {
      due_date: dueDateStr,
      fine: { rate: 2 },
      interest: { rate: 1 },
    },
    notification: customerEmail
      ? {
          name: customerName,
          channels: [
            {
              contact: customerEmail,
              channel: "EMAIL" as const,
              rules: [
                "NOTIFY_FIVE_DAYS_BEFORE_DUE_DATE",
                "NOTIFY_ON_DUE_DATE",
                "NOTIFY_TWO_DAYS_AFTER_DUE_DATE",
                "NOTIFY_WHEN_PAID",
              ],
            },
          ],
        }
      : undefined,
    payment_forms: ["BANK_SLIP", "PIX"] as const,
  };

  const idempotencyKey = randomUUID();
  const invoice = await emitInvoice(payload, idempotencyKey);

  const bankSlipUrl = invoice.payment_options?.bank_slip?.url ?? null;
  const pixEmv = invoice.pix?.emv ?? null;

  let pdf_signed_url: string | null = null;
  let storagePath: string | null = null;

  if (bankSlipUrl) {
    try {
      const pdfRes = await fetch(bankSlipUrl, { headers: { Accept: "application/pdf" } });
      if (pdfRes.ok) {
        const buf = Buffer.from(await pdfRes.arrayBuffer());
        const contentType = pdfRes.headers.get("content-type") ?? "application/pdf";
        if (contentType.includes("pdf") || buf.length > 100) {
          const path = `${companyId}/implantacao-${dueDateStr}.pdf`;
          storagePath = path;
          const { error: uploadErr } = await supabase.storage
            .from(INVOICES_BUCKET)
            .upload(path, buf, { contentType: "application/pdf", upsert: true });

          if (!uploadErr) {
            const { data: signedData } = await supabase.storage
              .from(INVOICES_BUCKET)
              .createSignedUrl(path, SIGNED_URL_EXPIRES);
            pdf_signed_url = signedData?.signedUrl ?? null;
          }
        }
      }
    } catch {
      /* fallback: apenas retornar link */
    }
  }

  // Registra a cobrança de implantação para que o dashboard considere nos totais.
  // Observação: a tabela tem UNIQUE(company_id, due_date), então repetir o mesmo vencimento
  // por empresa faz update do registro.
  try {
    await supabase.from("company_implantations").upsert(
      {
        company_id: companyId,
        cora_invoice_id: invoice.id,
        due_date: dueDateStr,
        amount_cents: amountCents,
        status: invoice.status ?? "OPEN",
        bank_slip_url: bankSlipUrl,
        pix_emv: pixEmv,
        storage_path: storagePath,
      },
      { onConflict: "company_id,due_date" }
    );
  } catch (e) {
    console.warn("[implantacao] Falha ao registrar company_implantations:", e);
  }

  return NextResponse.json({
    ok: true,
    bank_slip_url: bankSlipUrl,
    pix_emv: pixEmv,
    pdf_signed_url,
  });
}

