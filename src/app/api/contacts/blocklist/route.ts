import { getCompanyIdFromRequest } from "@/lib/auth/get-company";
import { getChannelToken } from "@/lib/uazapi/channel-token";
import { getBlocklist } from "@/lib/uazapi/client";
import { NextResponse } from "next/server";

/**
 * GET /api/contacts/blocklist?channel_id=xxx
 * Retorna lista de JIDs bloqueados na instância (channel_id obrigatório).
 */
export async function GET(request: Request) {
  const companyId = await getCompanyIdFromRequest(request);
  if (!companyId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const channelId = searchParams.get("channel_id")?.trim();
  if (!channelId) {
    return NextResponse.json(
      { error: "channel_id é obrigatório" },
      { status: 400 }
    );
  }

  const resolved = await getChannelToken(channelId, companyId);
  if (!resolved) {
    return NextResponse.json({ error: "Canal não encontrado" }, { status: 404 });
  }

  const result = await getBlocklist(resolved.token);
  if (!result.ok) {
    return NextResponse.json(
      { error: result.error ?? "Falha ao listar bloqueados" },
      { status: 502 }
    );
  }
  return NextResponse.json({ blockList: result.data ?? [] });
}
