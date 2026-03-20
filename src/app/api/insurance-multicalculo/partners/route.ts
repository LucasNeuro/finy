import { NextResponse } from "next/server";
import { getCompanyIdFromRequest } from "@/lib/auth/get-company";
import { requirePermission } from "@/lib/auth/get-profile";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { publicInsurancePartnerLogoUrl, resolvePartnerLogoStoragePath } from "@/lib/insurance-multicalculo";

async function requireModuleAccess(companyId: string) {
  const viewErr = await requirePermission(companyId, PERMISSIONS.insurance_multicalculo.view);
  if (!viewErr) return null;
  const manageErr = await requirePermission(companyId, PERMISSIONS.insurance_multicalculo.manage);
  if (!manageErr) return null;
  return viewErr;
}

/** Lista bancos e seguradoras do catálogo (logos via Storage quando `logo_storage_path` preenchido). */
export async function GET(request: Request) {
  const companyId = await getCompanyIdFromRequest(request);
  if (!companyId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const accessErr = await requireModuleAccess(companyId);
  if (accessErr) return NextResponse.json({ error: accessErr.error }, { status: accessErr.status });

  const { searchParams } = new URL(request.url);
  const kind = searchParams.get("kind"); // bank | insurer | null = all

  try {
    const supabase = createServiceRoleClient();
    let q = supabase
      .from("insurance_partner_catalog")
      .select("id, kind, name, segment, slug, logo_storage_path, sort_order")
      .eq("is_active", true)
      .order("sort_order", { ascending: true });
    if (kind === "bank" || kind === "insurer") {
      q = q.eq("kind", kind);
    }
    const { data, error } = await q;
    if (error) throw error;
    const partners = (data ?? []).map((p) => ({
      ...p,
      logo_url: publicInsurancePartnerLogoUrl(resolvePartnerLogoStoragePath(p.slug, p.logo_storage_path)),
    }));
    return NextResponse.json({ partners });
  } catch (e) {
    console.error("[insurance-multicalculo/partners]", e);
    return NextResponse.json({ error: "Falha ao listar parceiros." }, { status: 500 });
  }
}
