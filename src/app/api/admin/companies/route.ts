import { NextResponse } from "next/server";
import { verifyPlatformOwnerAuth } from "@/lib/admin-auth";
import { createServiceRoleClient } from "@/lib/supabase/admin";

/**
 * GET /api/admin/companies
 * Lista todas as empresas (apenas owner da empresa dona da plataforma).
 */
export async function GET() {
  const ok = await verifyPlatformOwnerAuth();
  if (!ok) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  const supabase = createServiceRoleClient();

  const { data: companies, error } = await supabase
    .from("companies")
    .select("id, name, slug, is_active, billing_status, billing_notes, billing_updated_at, billing_plan, created_at, updated_at")
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Implantação(s): total de valor + quantidade por empresa.
  // Se a migration/tabela ainda não existir no ambiente, caímos para 0.
  const implantationsMap = new Map<string, { totalCents: number; count: number }>();
  try {
    const { data: implRows } = await supabase
      .from("company_implantations")
      .select("company_id, amount_cents, status")
      .neq("status", "CANCELLED");

    for (const r of implRows ?? []) {
      const cid = (r as Record<string, unknown>).company_id as string | undefined;
      if (!cid) continue;
      const amountCents = Number((r as Record<string, unknown>).amount_cents ?? 0);
      const prev = implantationsMap.get(cid) ?? { totalCents: 0, count: 0 };
      prev.totalCents += amountCents;
      prev.count += 1;
      implantationsMap.set(cid, prev);
    }
  } catch {
    // tabela pode não existir; ignorar
  }

  const rows = (companies ?? []).map((c: Record<string, unknown>) => {
    const impl = implantationsMap.get(c.id as string) ?? { totalCents: 0, count: 0 };
    return {
    id: c.id,
    name: c.name,
    slug: c.slug,
    is_active: c.is_active ?? true,
    billing_status: c.billing_status ?? "active",
    billing_notes: c.billing_notes ?? null,
    billing_updated_at: c.billing_updated_at ?? null,
    billing_plan: c.billing_plan ?? "basic",
    created_at: c.created_at,
    updated_at: c.updated_at,
    implantations_this_year_total_cents: impl.totalCents,
    implantations_this_year_count: impl.count,
    };
  });

  return NextResponse.json({ companies: rows });
}
