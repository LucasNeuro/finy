import { getCompanyIdFromRequest } from "@/lib/auth/get-company";
import { getChannelToken } from "@/lib/uazapi/channel-token";
import { getGroupInfo } from "@/lib/uazapi/client";
import { NextResponse } from "next/server";

/**
 * POST /api/groups/info
 * Body: { channel_id: string, groupjid: string, getInviteLink?: boolean }
 */
export async function POST(request: Request) {
  const companyId = await getCompanyIdFromRequest(request);
  if (!companyId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  let body: { channel_id?: string; groupjid?: string; getInviteLink?: boolean };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
  const channelId = typeof body?.channel_id === "string" ? body.channel_id.trim() : "";
  const groupjid = typeof body?.groupjid === "string" ? body.groupjid.trim() : "";
  if (!channelId || !groupjid) return NextResponse.json({ error: "channel_id e groupjid são obrigatórios" }, { status: 400 });
  if (!groupjid.endsWith("@g.us")) return NextResponse.json({ error: "groupjid inválido" }, { status: 400 });
  const resolved = await getChannelToken(channelId, companyId);
  if (!resolved) return NextResponse.json({ error: "Canal não encontrado" }, { status: 404 });
  const result = await getGroupInfo(resolved.token, groupjid, { getInviteLink: body.getInviteLink !== false });
  if (!result.ok) return NextResponse.json({ error: result.error ?? "Falha ao obter informações do grupo" }, { status: 502 });
  return NextResponse.json(result.data ?? {});
}
