import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCompanyIdFromRequest } from "@/lib/auth/get-company";
import { requirePermission } from "@/lib/auth/get-profile";
import { PERMISSIONS } from "@/lib/auth/permissions";
import {
  enrichInsuranceMulticalculoQuoteRow,
  validateQuotePayload,
} from "@/lib/insurance-multicalculo";

async function requireModuleAccess(companyId: string) {
  const viewErr = await requirePermission(companyId, PERMISSIONS.insurance_multicalculo.view);
  if (!viewErr) return null;
  const manageErr = await requirePermission(companyId, PERMISSIONS.insurance_multicalculo.manage);
  if (!manageErr) return null;
  return viewErr;
}

export async function GET(request: Request) {
  const companyId = await getCompanyIdFromRequest(request);
  if (!companyId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const accessErr = await requireModuleAccess(companyId);
  if (accessErr) return NextResponse.json({ error: accessErr.error }, { status: accessErr.status });

  const url = new URL(request.url);
  const latest = url.searchParams.get("latest") === "1";
  const supabase = await createClient();
  const query = supabase
    .from("insurance_multicalculo_quotes")
    .select("*")
    .eq("company_id", companyId)
    .order("updated_at", { ascending: false })
    .limit(latest ? 1 : 20);
  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (latest) {
    const row = data?.[0] ?? null;
    return NextResponse.json(row ? enrichInsuranceMulticalculoQuoteRow(row as Record<string, unknown>) : null);
  }
  const rows = (data ?? []).map((row) => enrichInsuranceMulticalculoQuoteRow(row as Record<string, unknown>));
  return NextResponse.json(rows);
}

export async function POST(request: Request) {
  const companyId = await getCompanyIdFromRequest(request);
  if (!companyId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const accessErr = await requireModuleAccess(companyId);
  if (accessErr) return NextResponse.json({ error: accessErr.error }, { status: accessErr.status });

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

  const payload = {
    company_id: companyId,
    created_by: userId,
    updated_by: userId,
    title: typeof body.title === "string" && body.title.trim() ? body.title.trim() : "Simulação",
    status: typeof body.status === "string" ? body.status : "draft",
    insured_data: body.insured_data ?? {},
    driver_data: body.driver_data ?? {},
    vehicle_data: body.vehicle_data ?? {},
    questionnaire_data: body.questionnaire_data ?? {},
    policy_data: body.policy_data ?? {},
    coverage_data: body.coverage_data ?? {},
    services_data: body.services_data ?? {},
    quotes_result: Array.isArray(body.quotes_result) ? body.quotes_result : [],
    selected_quote: body.selected_quote ?? null,
    notes: typeof body.notes === "string" ? body.notes : null,
  };

  const { data, error } = await supabase.from("insurance_multicalculo_quotes").insert(payload).select("*").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ? enrichInsuranceMulticalculoQuoteRow(data as Record<string, unknown>) : data);
}
