import { getCompanyIdFromRequest } from "@/lib/auth/get-company";
import { getChannelToken } from "@/lib/uazapi/channel-token";
import { getChatDetails } from "@/lib/uazapi/client";
import { NextResponse } from "next/server";

/**
 * POST /api/contacts/chat-details
 * Body: { channel_id: string, number: string, preview?: boolean }
 * number: telefone (ex: 5511999999999) ou jid do grupo (ex: 120363123456789012@g.us).
 * Retorna detalhes completos do chat/contato via UAZAPI /chat/details.
 */
export async function POST(request: Request) {
  const companyId = await getCompanyIdFromRequest(request);
  if (!companyId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { channel_id?: string; number?: string; preview?: boolean };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const channelId = typeof body?.channel_id === "string" ? body.channel_id.trim() : "";
  const number = typeof body?.number === "string" ? body.number.trim() : "";
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

  const result = await getChatDetails(resolved.token, number, {
    preview: body.preview ?? true,
  });

  if (!result.ok) {
    return NextResponse.json(
      { error: result.error ?? "Falha ao obter detalhes do chat" },
      { status: 502 }
    );
  }

  return NextResponse.json(result.data ?? {});
}
