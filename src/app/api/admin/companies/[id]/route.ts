import { NextResponse } from "next/server";
import { verifyPlatformOwnerAuth } from "@/lib/admin-auth";
import {
  DEFAULT_ENABLED_MODULES,
  normalizeEnabledModules,
} from "@/lib/company/enabled-modules";
import { createServiceRoleClient } from "@/lib/supabase/admin";

/**
 * PATCH /api/admin/companies/[id]
 * Atualiza empresa: is_active, billing, enabled_modules, multicalculo_seguros_enabled.
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const ok = await verifyPlatformOwnerAuth();
  if (!ok) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  const { id } = await params;
  if (!id) {
    return NextResponse.json({ error: "ID obrigatório" }, { status: 400 });
  }

  let body: {
    is_active?: boolean;
    billing_status?: string;
    billing_notes?: string;
    billing_plan?: string;
    enabled_modules?: Record<string, boolean>;
    multicalculo_seguros_enabled?: boolean;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const supabase = createServiceRoleClient();

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };

  if (typeof body.is_active === "boolean") {
    updates.is_active = body.is_active;
    if (!body.is_active) {
      updates.deactivated_at = new Date().toISOString();
    } else {
      updates.deactivated_at = null;
    }
  }
  if (body.billing_status !== undefined) {
    const valid = ["active", "trial", "suspended", "cancelled"];
    if (valid.includes(String(body.billing_status))) {
      updates.billing_status = body.billing_status;
      updates.billing_updated_at = new Date().toISOString();
    }
  }
  if (body.billing_notes !== undefined) {
    updates.billing_notes =
      typeof body.billing_notes === "string" ? body.billing_notes.trim() || null : null;
  }
  if (body.billing_plan !== undefined) {
    const valid = ["basic", "plus", "extra"];
    if (valid.includes(String(body.billing_plan))) {
      updates.billing_plan = body.billing_plan;
    }
  }

  if (typeof body.multicalculo_seguros_enabled === "boolean") {
    updates.multicalculo_seguros_enabled = body.multicalculo_seguros_enabled;
  }

  if (body.enabled_modules !== undefined && body.enabled_modules !== null && typeof body.enabled_modules === "object") {
    const { data: existing } = await supabase
      .from("companies")
      .select("enabled_modules")
      .eq("id", id)
      .single();
    const current = normalizeEnabledModules(existing?.enabled_modules);
    const next = { ...current };
    const allowed = new Set(Object.keys(DEFAULT_ENABLED_MODULES));
    for (const [k, v] of Object.entries(body.enabled_modules)) {
      if (!allowed.has(k) || typeof v !== "boolean") continue;
      next[k] = v;
    }
    updates.enabled_modules = next;
  }

  const { data, error } = await supabase
    .from("companies")
    .update(updates)
    .eq("id", id)
    .select(
      "id, name, slug, is_active, billing_status, billing_notes, billing_updated_at, billing_plan, enabled_modules, multicalculo_seguros_enabled"
    )
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (updates.is_active !== undefined) {
    await supabase
      .from("company_links")
      .update({ is_active: updates.is_active })
      .eq("company_id", id);
  }

  return NextResponse.json({ ok: true, company: data });
}
