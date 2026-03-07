import { getCompanyIdFromRequest } from "@/lib/auth/get-company";
import { getChannelToken } from "@/lib/uazapi/channel-token";
import { addContactToAgenda } from "@/lib/uazapi/client";
import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

/**
 * POST /api/contacts/add-to-agenda
 * Body: { channel_id: string, number: string, name?: string }
 * Adiciona contato à agenda do WhatsApp (UAZAPI /contact/add).
 * Atualiza contact_name em channel_contacts para o nome novo aparecer na tabela.
 */
export async function POST(request: Request) {
  const companyId = await getCompanyIdFromRequest(request);
  if (!companyId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { channel_id?: string; number?: string; name?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const channelId = typeof body?.channel_id === "string" ? body.channel_id.trim() : "";
  const number = typeof body?.number === "string" ? body.number.trim() : "";
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  if (!channelId || !number) {
    return NextResponse.json(
      { error: "channel_id e number são obrigatórios" },
      { status: 400 }
    );
  }

  const resolved = await getChannelToken(channelId, companyId);
  if (!resolved) {
    return NextResponse.json({ error: "Canal não encontrado" }, { status: 404 });
  }

  const result = await addContactToAgenda(resolved.token, number, name || number);
  if (!result.ok) {
    return NextResponse.json(
      { error: result.error ?? "Falha ao adicionar à agenda" },
      { status: 502 }
    );
  }

  const digits = number.replace(/\D/g, "");
  const jid = digits ? `${digits}@s.whatsapp.net` : "";
  if (jid && (name || number)) {
    const supabase = await createClient();
    await supabase
      .from("channel_contacts")
      .update({
        contact_name: name || null,
        first_name: name || null,
        synced_at: new Date().toISOString(),
      })
      .eq("channel_id", channelId)
      .eq("company_id", companyId)
      .eq("jid", jid);
  }

  return NextResponse.json(result.data ?? { ok: true });
}
