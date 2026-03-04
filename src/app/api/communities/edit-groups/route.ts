import { getCompanyIdFromRequest } from "@/lib/auth/get-company";
import { getChannelToken } from "@/lib/uazapi/channel-token";
import { editCommunityGroups } from "@/lib/uazapi/client";
import { NextResponse } from "next/server";

/**
 * POST /api/communities/edit-groups
 * Body: { channel_id: string, community: string (JID), action: 'add' | 'remove', groupjids: string[] }
 */
export async function POST(request: Request) {
  const companyId = await getCompanyIdFromRequest(request);
  if (!companyId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { channel_id?: string; community?: string; action?: string; groupjids?: string[] };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const channelId = typeof body?.channel_id === "string" ? body.channel_id.trim() : "";
  const community = typeof body?.community === "string" ? body.community.trim() : "";
  const action = body?.action === "add" || body?.action === "remove" ? body.action : null;
  const groupjids = Array.isArray(body?.groupjids)
    ? body.groupjids.filter((j): j is string => typeof j === "string").map((j) => j.trim()).filter((j) => j.endsWith("@g.us"))
    : [];

  if (!channelId) {
    return NextResponse.json({ error: "channel_id é obrigatório" }, { status: 400 });
  }
  if (!community || !community.endsWith("@g.us")) {
    return NextResponse.json({ error: "community (JID da comunidade) é obrigatório" }, { status: 400 });
  }
  if (!action) {
    return NextResponse.json({ error: "action deve ser 'add' ou 'remove'" }, { status: 400 });
  }
  if (groupjids.length === 0) {
    return NextResponse.json({ error: "Informe ao menos um grupo (groupjids)" }, { status: 400 });
  }

  const resolved = await getChannelToken(channelId, companyId);
  if (!resolved) {
    return NextResponse.json({ error: "Canal não encontrado" }, { status: 404 });
  }

  const result = await editCommunityGroups(resolved.token, { community, action, groupjids });
  if (!result.ok) {
    return NextResponse.json(
      { error: result.error ?? "Falha ao atualizar grupos da comunidade" },
      { status: 502 }
    );
  }
  return NextResponse.json({ ok: true, success: result.success, failed: result.failed });
}
