import { NextResponse } from "next/server";
import { getCompanyIdFromRequest } from "@/lib/auth/get-company";
import { requirePermission } from "@/lib/auth/get-profile";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import {
  buildMockQuotes,
  buildQuotesFromCatalog,
  computeReferencePrice,
  type QuotePayload,
  validateQuotePayload,
} from "@/lib/insurance-multicalculo";

async function requireModuleAccess(companyId: string) {
  const viewErr = await requirePermission(companyId, PERMISSIONS.insurance_multicalculo.view);
  if (!viewErr) return null;
  const manageErr = await requirePermission(companyId, PERMISSIONS.insurance_multicalculo.manage);
  if (!manageErr) return null;
  return viewErr;
}

export async function POST(request: Request) {
  const companyId = await getCompanyIdFromRequest(request);
  if (!companyId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const accessErr = await requireModuleAccess(companyId);
  if (accessErr) return NextResponse.json({ error: accessErr.error }, { status: accessErr.status });

  let body: Partial<QuotePayload>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const validation = validateQuotePayload(body, true);
  if (!validation.ok) {
    return NextResponse.json({ error: validation.errors[0], details: validation.errors }, { status: 400 });
  }

  const payload = body as QuotePayload;
  const reference = computeReferencePrice(payload);

  try {
    const supabase = createServiceRoleClient();
    const { data, error } = await supabase
      .from("insurance_partner_catalog")
      .select(
        "id, name, slug, logo_storage_path, insurance_partner_mock_simulation!inner ( price_factor, coverages_text, discount_label )",
      )
      .eq("kind", "insurer")
      .eq("is_active", true);

    if (error) throw error;

    const rows = (data ?? []).map((row: Record<string, unknown>) => {
      let mock = row.insurance_partner_mock_simulation as
        | { price_factor: number; coverages_text: string; discount_label: string }
        | { price_factor: number; coverages_text: string; discount_label: string }[]
        | null
        | undefined;
      if (Array.isArray(mock)) mock = mock[0] ?? null;
      return {
        id: row.id as string,
        name: row.name as string,
        slug: row.slug as string,
        logo_storage_path: (row.logo_storage_path as string | null) ?? null,
        insurance_partner_mock_simulation: mock ?? null,
      };
    });

    const fromCatalog = buildQuotesFromCatalog(rows, reference, 6);
    if (fromCatalog.length > 0) {
      return NextResponse.json({ quotes: fromCatalog });
    }
  } catch (e) {
    console.warn("[insurance-multicalculo/calculate] catálogo indisponível, usando mock fixo:", e);
  }

  return NextResponse.json({ quotes: buildMockQuotes(payload) });
}
