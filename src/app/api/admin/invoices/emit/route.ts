import { NextResponse } from "next/server";
import { verifyPlatformOwnerAuth } from "@/lib/admin-auth";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { emitInvoice } from "@/lib/cora";
import { randomUUID } from "crypto";

const INVOICES_BUCKET = "company-invoices";

const PLAN_VALUES: Record<string, number> = {
  basic: 350,
  plus: 600,
  extra: 980,
};

const PLAN_LABELS: Record<string, string> = {
  basic: "Basic",
  plus: "Plus",
  extra: "Extra",
};

const MONTH_NAMES = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

/**
 * POST /api/admin/invoices/emit
 * Emite boletos via Cora para uma empresa (1 a 12 meses).
 * Body: { company_id: string, months?: number }
 */
export async function POST(request: Request) {
  const ok = await verifyPlatformOwnerAuth();
  if (!ok) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  let body: { company_id?: string; months?: number };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const companyId = body?.company_id;
  if (!companyId) {
    return NextResponse.json({ error: "company_id é obrigatório" }, { status: 400 });
  }

  const months = Math.min(12, Math.max(1, Number(body?.months) || 12));

  const supabase = createServiceRoleClient();

  try {
    const { data: buckets } = await supabase.storage.listBuckets();
    if (!buckets?.some((b) => b.name === INVOICES_BUCKET)) {
      await supabase.storage.createBucket(INVOICES_BUCKET, {
        public: false,
        fileSizeLimit: 10485760,
      });
    }
  } catch {
    /* bucket pode já existir via migration */
  }

  const { data: company, error: companyError } = await supabase
    .from("companies")
    .select("id, name, slug, cnpj, razao_social, nome_fantasia, email, logradouro, numero, complemento, bairro, cep, uf, municipio, billing_plan")
    .eq("id", companyId)
    .single();

  if (companyError || !company) {
    return NextResponse.json({ error: "Empresa não encontrada" }, { status: 404 });
  }

  const cnpjDigits = (company.cnpj ?? "").replace(/\D/g, "");
  if (cnpjDigits.length !== 14) {
    return NextResponse.json(
      { error: "Empresa sem CNPJ válido. Cadastre o CNPJ no perfil da empresa para emitir boletos." },
      { status: 400 }
    );
  }

  const hasAddress =
    company.logradouro && company.numero && company.bairro && company.municipio && company.uf && company.cep;
  if (!hasAddress) {
    return NextResponse.json(
      { error: "Empresa sem endereço completo. Cadastre logradouro, número, bairro, cidade, UF e CEP no perfil." },
      { status: 400 }
    );
  }

  const plan = (company.billing_plan as string) ?? "basic";
  const amountReais = PLAN_VALUES[plan] ?? 350;
  const amountCents = Math.max(500, amountReais * 100);

  const customerName = (company.nome_fantasia ?? company.razao_social ?? company.name ?? "").slice(0, 60) || company.name;
  const customerEmail = (company.email ?? "").slice(0, 60) || undefined;

  const address =
    company.logradouro && company.numero && company.bairro && company.municipio && company.uf && company.cep
      ? {
          street: String(company.logradouro).slice(0, 200),
          number: String(company.numero).slice(0, 20),
          district: String(company.bairro).slice(0, 100),
          city: String(company.municipio).slice(0, 100),
          state: String(company.uf).slice(0, 2).toUpperCase(),
          zip_code: String(company.cep).replace(/\D/g, "").slice(0, 8),
          complement: (company.complemento ? String(company.complemento) : "").slice(0, 100),
        }
      : undefined;

  const now = new Date();
  const results: { month: number; year: number; success: boolean; invoiceId?: string; error?: string }[] = [];

  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  for (let i = 0; i < months; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
    const month = d.getMonth() + 1;
    const year = d.getFullYear();
    let dueDate = new Date(year, d.getMonth(), 10);
    if (dueDate < today) {
      dueDate = new Date(today);
      dueDate.setDate(dueDate.getDate() + 1);
    }
    const dueDateStr = dueDate.toISOString().slice(0, 10);

    const serviceName = `Mensalidade Smart Vendas - Plano ${PLAN_LABELS[plan] ?? plan}`;
    const serviceDesc = `${MONTH_NAMES[d.getMonth()]} ${year}`.slice(0, 100);

    try {
      const payload = {
        code: `clicvend-${companyId}-${year}-${month}`,
        customer: {
          name: customerName,
          email: customerEmail,
          document: { identity: cnpjDigits, type: "CNPJ" as const },
          address,
        },
        services: [{ name: serviceName, description: serviceDesc, amount: amountCents }],
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
      };

      const idempotencyKey = randomUUID();
      const invoice = await emitInvoice(payload, idempotencyKey);

      const bankSlipUrl = invoice.payment_options?.bank_slip?.url ?? null;
      let storagePath: string | null = null;

      if (bankSlipUrl) {
        try {
          const pdfRes = await fetch(bankSlipUrl, { headers: { Accept: "application/pdf" } });
          if (pdfRes.ok) {
            const buf = Buffer.from(await pdfRes.arrayBuffer());
            const contentType = pdfRes.headers.get("content-type") ?? "application/pdf";
            if (contentType.includes("pdf") || buf.length > 100) {
              const path = `${companyId}/${year}-${String(month).padStart(2, "0")}.pdf`;
              const { error: uploadErr } = await supabase.storage
                .from(INVOICES_BUCKET)
                .upload(path, buf, { contentType: "application/pdf", upsert: true });
              if (!uploadErr) storagePath = path;
            }
          }
        } catch {
          /* fallback: manter só bank_slip_url */
        }
      }

      const { error: upsertErr } = await supabase
        .from("company_invoices")
        .upsert(
          {
            company_id: companyId,
            cora_invoice_id: invoice.id,
            cora_code: invoice.code,
            amount_cents: amountCents,
            due_date: dueDateStr,
            status: invoice.status ?? "OPEN",
            month,
            year,
            bank_slip_url: bankSlipUrl,
            bank_slip_barcode: invoice.payment_options?.bank_slip?.barcode ?? null,
            bank_slip_digitable: invoice.payment_options?.bank_slip?.digitable ?? null,
            pix_emv: invoice.pix?.emv ?? null,
            storage_path: storagePath,
          },
          { onConflict: "company_id,month,year" }
        );
      if (upsertErr) {
        console.error(
          `[Cora emit] Falha ao gravar company_invoices ${month}/${year}:`,
          upsertErr
        );
        throw new Error(`Falha ao gravar company_invoices: ${upsertErr.message ?? String(upsertErr)}`);
      }

      results.push({ month, year, success: true, invoiceId: invoice.id });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Erro desconhecido";
      console.error(`[Cora emit] Falha ${month}/${year}:`, msg);
      results.push({ month, year, success: false, error: msg });
    }
  }

  const successCount = results.filter((r) => r.success).length;
  const firstError = results.find((r) => !r.success)?.error;
  return NextResponse.json({
    ok: successCount > 0,
    emitted: successCount,
    total: months,
    firstError: successCount === 0 ? firstError : undefined,
    results,
  });
}
