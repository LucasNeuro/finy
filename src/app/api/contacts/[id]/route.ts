import { getCompanyIdFromRequest } from "@/lib/auth/get-company";
import { requirePermission } from "@/lib/auth/get-profile";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

/**
 * PATCH /api/contacts/[id]
 * Atualiza campos editáveis do contato salvo (channel_contacts).
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const companyId = await getCompanyIdFromRequest(request);
  if (!companyId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const err = await requirePermission(companyId, PERMISSIONS.contacts.manage);
  if (err) {
    return NextResponse.json({ error: err.error }, { status: err.status });
  }

  const { id } = await params;
  if (!id) {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }

  let body: { contact_name?: string | null; first_name?: string | null; phone?: string | null };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const updates: { contact_name?: string | null; first_name?: string | null; phone?: string | null } = {};
  if ("contact_name" in body) {
    updates.contact_name = typeof body.contact_name === "string" ? body.contact_name.trim().slice(0, 120) : null;
  }
  if ("first_name" in body) {
    updates.first_name = typeof body.first_name === "string" ? body.first_name.trim().slice(0, 120) : null;
  }
  if ("phone" in body) {
    const digits = typeof body.phone === "string" ? body.phone.replace(/\D/g, "").slice(0, 20) : "";
    updates.phone = digits || null;
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "Nenhum campo para atualizar" }, { status: 400 });
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("channel_contacts")
    .update(updates)
    .eq("id", id)
    .eq("company_id", companyId)
    .select("id, channel_id, jid, phone, contact_name, first_name, avatar_url, synced_at")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({ error: "Contato não encontrado" }, { status: 404 });
  }

  return NextResponse.json(data);
}

/**
 * DELETE /api/contacts/[id]
 * Remove o contato da lista sincronizada (channel_contacts) da empresa.
 * Não remove da agenda do WhatsApp na UAZAPI, apenas do nosso banco.
 */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const companyId = await getCompanyIdFromRequest(_request);
  if (!companyId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const err = await requirePermission(companyId, PERMISSIONS.contacts.manage);
  if (err) {
    return NextResponse.json({ error: err.error }, { status: err.status });
  }

  const { id } = await params;
  if (!id) {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("channel_contacts")
    .delete()
    .eq("id", id)
    .eq("company_id", companyId)
    .select("id")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({ error: "Contato não encontrado" }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}
