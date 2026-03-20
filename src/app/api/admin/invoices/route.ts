import { NextResponse } from "next/server";
import { verifyPlatformOwnerAuth } from "@/lib/admin-auth";
import { createServiceRoleClient } from "@/lib/supabase/admin";

const INVOICES_BUCKET = "company-invoices";
const SIGNED_URL_EXPIRES = 60 * 60; // 1 hora

/**
 * GET /api/admin/invoices?company_id=xxx
 * Lista boletos de uma empresa. Retorna signed URLs para PDFs no storage.
 */
export async function GET(request: Request) {
  const ok = await verifyPlatformOwnerAuth();
  if (!ok) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const companyId = searchParams.get("company_id");
  if (!companyId) {
    return NextResponse.json({ error: "company_id é obrigatório" }, { status: 400 });
  }

  const supabase = createServiceRoleClient();

  let invoices:
    | Array<{
        id: string;
        month: number;
        year: number;
        amount_cents: number;
        due_date: string;
        status: string;
        bank_slip_url: string | null;
      }>
    | null = null;

  try {
    const res = await supabase
      .from("company_invoices")
      .select("id, month, year, amount_cents, due_date, status, bank_slip_url")
      .eq("company_id", companyId)
      .order("year", { ascending: false })
      .order("month", { ascending: false });

    invoices = res.data ?? [];

    if (res.error) {
      console.error(`[GET invoices] DB error company_id=${companyId}:`, res.error);
      const msg = String(res.error.message ?? res.error);
      if (msg.toLowerCase().includes("schema cache") && msg.includes("company_invoices")) {
        return NextResponse.json(
          {
            error:
              "Tabela `public.company_invoices` não encontrada/indisponível no Supabase (schema cache). Garanta que as migrações dessa tabela foram aplicadas no ambiente atual.",
          },
          { status: 500 }
        );
      }
      return NextResponse.json({ error: msg }, { status: 500 });
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error(`[GET invoices] Exception company_id=${companyId}:`, e);
    if (msg.toLowerCase().includes("schema cache") && msg.includes("company_invoices")) {
      return NextResponse.json(
        {
          error:
            "Tabela `public.company_invoices` não encontrada/indisponível no Supabase (schema cache). Garanta que as migrações dessa tabela foram aplicadas no ambiente atual.",
        },
        { status: 500 }
      );
    }
    return NextResponse.json({ error: msg }, { status: 500 });
  }

  const withUrls = (invoices ?? []).map((inv) => ({
    ...inv,
    pdf_url: null as string | null,
    bank_slip_url: inv.bank_slip_url,
  }));

  try {
    const { data: withStorage, error: storageErr } = await supabase
      .from("company_invoices")
      .select("id, storage_path")
      .eq("company_id", companyId);
    if (!storageErr && withStorage) {
      for (let i = 0; i < withUrls.length; i++) {
        const row = withStorage.find((r) => r.id === withUrls[i].id);
        const path = (row as { storage_path?: string } | undefined)?.storage_path;
        if (path) {
          const { data: signed } = await supabase.storage
            .from(INVOICES_BUCKET)
            .createSignedUrl(path, SIGNED_URL_EXPIRES);
          withUrls[i].pdf_url = signed?.signedUrl ?? null;
        }
      }
    }
  } catch {
    /* storage_path pode não existir; usar bank_slip_url */
  }

  return NextResponse.json({ invoices: withUrls });
}
