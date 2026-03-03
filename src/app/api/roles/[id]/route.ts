import { getCompanyIdFromRequest } from "@/lib/auth/get-company";
import { requirePermission } from "@/lib/auth/get-profile";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const companyId = await getCompanyIdFromRequest(request);
  if (!companyId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const err = await requirePermission(companyId, PERMISSIONS.users.manage);
  if (err) return NextResponse.json({ error: err.error }, { status: err.status });

  const { id } = await context.params;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("roles")
    .select("id, name, permissions, created_at, updated_at")
    .eq("id", id)
    .eq("company_id", companyId)
    .single();

  if (error || !data) return NextResponse.json({ error: "Cargo não encontrado" }, { status: 404 });
  return NextResponse.json(data);
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const companyId = await getCompanyIdFromRequest(request);
  if (!companyId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const err = await requirePermission(companyId, PERMISSIONS.users.manage);
  if (err) return NextResponse.json({ error: err.error }, { status: err.status });

  const { id } = await context.params;
  let body: { name?: string; permissions?: string[] };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const supabase = await createClient();
  const updates: { name?: string; permissions?: string[]; updated_at: string } = {
    updated_at: new Date().toISOString(),
  };
  if (typeof body?.name === "string" && body.name.trim()) updates.name = body.name.trim();
  if (Array.isArray(body?.permissions)) updates.permissions = body.permissions;

  if (Object.keys(updates).length <= 1) {
    return NextResponse.json({ error: "Nenhuma alteração" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("roles")
    .update(updates)
    .eq("id", id)
    .eq("company_id", companyId)
    .select("id, name, permissions, created_at, updated_at")
    .single();

  if (error) {
    if (error.code === "23505") return NextResponse.json({ error: "Já existe um cargo com este nome" }, { status: 409 });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json(data);
}

export async function DELETE(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const companyId = await getCompanyIdFromRequest(request);
  if (!companyId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const err = await requirePermission(companyId, PERMISSIONS.users.manage);
  if (err) return NextResponse.json({ error: err.error }, { status: err.status });

  const { id } = await context.params;
  const supabase = await createClient();
  const { data: existing } = await supabase
    .from("roles")
    .select("id")
    .eq("id", id)
    .eq("company_id", companyId)
    .single();

  if (!existing) return NextResponse.json({ error: "Cargo não encontrado" }, { status: 404 });

  const { error: delError } = await supabase.from("roles").delete().eq("id", id).eq("company_id", companyId);
  if (delError) return NextResponse.json({ error: delError.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
