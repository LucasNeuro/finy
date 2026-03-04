import { getCompanyIdFromRequest } from "@/lib/auth/get-company";
import { getChannelToken } from "@/lib/uazapi/channel-token";
import { updateGroupName } from "@/lib/uazapi/client";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  const companyId = await getCompanyIdFromRequest(request);
  if (!companyId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  let body: { channel_id?: string; groupjid?: string; name?: string };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
  const channelId = typeof body?.channel_id === "string" ? body.channel_id.trim() : "";
  const groupjid = typeof body?.groupjid === "string" ? body.groupjid.trim() : "";
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  if (!channelId || !groupjid || !name) return NextResponse.json({ error: "channel_id, groupjid e name obrigatórios" }, { status: 400 });
  const resolved = await getChannelToken(channelId, companyId);
  if (!resolved) return NextResponse.json({ error: "Canal não encontrado" }, { status: 404 });
  const result = await updateGroupName(resolved.token, groupjid, name);
  if (!result.ok) return NextResponse.json({ error: result.error ?? "Falha ao atualizar nome" }, { status: 502 });
  return NextResponse.json({ group: result.data });
}
