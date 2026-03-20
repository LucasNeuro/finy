import { NextResponse } from "next/server";
import { verifyPlatformOwnerAuth } from "@/lib/admin-auth";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import {
  getInvoiceDetailsFromCoraMtls,
  listImplantationInvoicesFromCora,
} from "@/lib/cora";

const INVOICES_BUCKET = "company-invoices";

function extractDueDatesFromStorage(objectNames: string[], companyId: string): string[] {
  const re = new RegExp(`^${companyId}/implantacao-(\\d{4}-\\d{2}-\\d{2})\\.pdf$`);
  const dueDates: string[] = [];
  for (const name of objectNames) {
    const m = name.match(re);
    if (m?.[1]) dueDates.push(m[1]);
  }
  // Unique + sort
  return Array.from(new Set(dueDates)).sort();
}

function expectedCoraCode(companyId: string, dueDate: string) {
  return `clicvend-${companyId}-implant-${dueDate.replace(/-/g, "")}`;
}

function isoRange(dueDates: string[]): { start: string; end: string } | null {
  if (!dueDates.length) return null;
  return { start: dueDates[0], end: dueDates[dueDates.length - 1] };
}

export async function POST(request: Request) {
  const ok = await verifyPlatformOwnerAuth();
  if (!ok) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  let body: { company_id?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const companyId = body.company_id;
  if (!companyId) return NextResponse.json({ error: "company_id é obrigatório" }, { status: 400 });

  const supabase = createServiceRoleClient();

  // Busca os PDFs no bucket para descobrir quais vencimentos já foram emitidos.
  let objectNames: string[] = [];
  try {
    const { data } = await supabase.storage.from(INVOICES_BUCKET).list(`${companyId}/`);
    objectNames = (data ?? []).map((o: any) => String(o.name ?? o));
  } catch (e) {
    // Fica ok: se falhar listar objetos, voltamos sem backfill.
  }

  const dueDates = extractDueDatesFromStorage(objectNames, companyId);
  if (!dueDates.length) {
    return NextResponse.json(
      {
        error:
          "Não encontrei PDFs de implantação no bucket (company-invoices) para esta empresa. Emita a implantação ou verifique storage_path/nome do arquivo.",
        expectedPrefix: `${companyId}/implantacao-YYYY-MM-DD.pdf`,
      },
      { status: 400 }
    );
  }

  const { data: company, error: companyError } = await supabase
    .from("companies")
    .select("id, cnpj")
    .eq("id", companyId)
    .single();

  if (companyError || !company) {
    return NextResponse.json({ error: "Empresa não encontrada" }, { status: 404 });
  }

  const cnpjDigits = (company.cnpj ?? "").replace(/\D/g, "");
  if (cnpjDigits.length !== 14) {
    return NextResponse.json({ error: "CNPJ inválido na empresa" }, { status: 400 });
  }

  const range = isoRange(dueDates);
  if (!range) {
    return NextResponse.json({ error: "Não foi possível definir range" }, { status: 400 });
  }

  const listResp = await listImplantationInvoicesFromCora({
    companyId,
    cnpjDigits,
    start: range.start,
    end: range.end,
  });

  const items = (listResp.items ?? []).filter(Boolean) as { id?: string; code?: string }[];

  let inserted = 0;
  let processed = 0;

  for (const dueDate of dueDates) {
    const code = expectedCoraCode(companyId, dueDate);
    let match: { id?: string; code?: string } | undefined = items.find((it) => it.code === code);

    // Se a lista não trouxer code/id, tentamos listar só aquele vencimento.
    if (!match?.id) {
      const singleList = await listImplantationInvoicesFromCora({
        companyId,
        cnpjDigits,
        start: dueDate,
        end: dueDate,
      });
      const singleItems = (singleList.items ?? []).filter(Boolean) as { id?: string; code?: string }[];
      const match2 = singleItems.find((it) => it.code === code);
      if (!match2?.id) continue;
      match = match2;
    }

    if (!match?.id) continue;

    processed += 1;
    const details = await getInvoiceDetailsFromCoraMtls(match.id);

    const amountCents = Math.max(0, Math.round((details.total_amount ?? 0) * 100));
    const bankSlipUrl = details.payment_options?.bank_slip?.url ?? null;
    const pixEmv = details.pix?.emv ?? null;

    const storagePath = `${companyId}/implantacao-${dueDate}.pdf`;

    try {
      const { error: upsertErr } = await supabase.from("company_implantations").upsert(
        {
          company_id: companyId,
          cora_invoice_id: details.id,
          due_date: dueDate,
          amount_cents: amountCents,
          status: details.status ?? "OPEN",
          bank_slip_url: bankSlipUrl,
          pix_emv: pixEmv,
          storage_path: storagePath,
        },
        { onConflict: "company_id,due_date" }
      );
      if (!upsertErr) inserted += 1;
    } catch {
      // caso a tabela não exista
    }
  }

  return NextResponse.json({
    ok: true,
    inserted,
    processed,
    dueDates,
  });
}

