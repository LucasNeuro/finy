import { getCompanyIdFromRequest } from "@/lib/auth/get-company";
import { getChannelToken } from "@/lib/uazapi/channel-token";
import { blockChat } from "@/lib/uazapi/client";
import { NextResponse } from "next/server";

/**
 * POST /api/contacts/block
 * Body: { channel_id: string, number: string, block: boolean }
 * Bloqueia ou desbloqueia contato no WhatsApp da instância.
 */
export async function POST(request: Request) {
  const companyId = await getCompanyIdFromRequest(request);
  if (!companyId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { channel_id?: string; number?: string; block?: boolean };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const channelId = typeof body?.channel_id === "string" ? body.channel_id.trim() : "";
  const number = typeof body?.number === "string" ? body.number.trim() : "";
  const block = body?.block === true;
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

  const result = await blockChat(resolved.token, number, block);
  if (!result.ok) {
    return NextResponse.json(
      { error: result.error ?? "Falha ao bloquear/desbloquear" },
      { status: 502 }
    );
  }
  return NextResponse.json({ ok: true });
}
