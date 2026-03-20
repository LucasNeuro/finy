import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCompanyIdFromRequest } from "@/lib/auth/get-company";
import { requirePermission } from "@/lib/auth/get-profile";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { enrichInsuranceMulticalculoQuoteRow, validateQuotePayload } from "@/lib/insurance-multicalculo";

async function requireModuleAccess(companyId: string) {
  const viewErr = await requirePermission(companyId, PERMISSIONS.insurance_multicalculo.view);
  if (!viewErr) return null;
  const manageErr = await requirePermission(companyId, PERMISSIONS.insurance_multicalculo.manage);
  if (!manageErr) return null;
  return viewErr;
}

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const companyId = await getCompanyIdFromRequest(request);
  if (!companyId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const accessErr = await requireModuleAccess(companyId);
  if (accessErr) return NextResponse.json({ error: accessErr.error }, { status: accessErr.status });
  const { id } = await context.params;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("insurance_multicalculo_quotes")
    .select("*")
    .eq("company_id", companyId)
    .eq("id", id)
    .single();
  if (error) return NextResponse.json({ error: "Simulação não encontrada" }, { status: 404 });
  return NextResponse.json(enrichInsuranceMulticalculoQuoteRow(data as Record<string, unknown>));
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const companyId = await getCompanyIdFromRequest(request);
  if (!companyId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const accessErr = await requireModuleAccess(companyId);
  if (accessErr) return NextResponse.json({ error: accessErr.error }, { status: accessErr.status });
  const { id } = await context.params;

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const validation = validateQuotePayload(body as any, false);
  if (!validation.ok) {
    return NextResponse.json({ error: validation.errors[0], details: validation.errors }, { status: 400 });
  }

  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  const userId = auth.user?.id ?? null;

  const updates: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
    updated_by: userId,
  };
  const fields = [
    "title",
    "status",
    "insured_data",
    "driver_data",
    "vehicle_data",
    "questionnaire_data",
    "policy_data",
    "coverage_data",
    "services_data",
    "quotes_result",
    "selected_quote",
    "notes",
  ];
  for (const key of fields) {
    if (key in body) updates[key] = body[key as keyof typeof body];
  }

  const { data, error } = await supabase
    .from("insurance_multicalculo_quotes")
    .update(updates)
    .eq("company_id", companyId)
    .eq("id", id)
    .select("*")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ? enrichInsuranceMulticalculoQuoteRow(data as Record<string, unknown>) : data);
}
