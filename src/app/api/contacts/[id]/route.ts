import { getCompanyIdFromRequest } from "@/lib/auth/get-company";
import { requirePermission } from "@/lib/auth/get-profile";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

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
