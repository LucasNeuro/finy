import { getCompanyIdFromRequest } from "@/lib/auth/get-company";
import { getChannelToken } from "@/lib/uazapi/channel-token";
import { updateGroupDescription } from "@/lib/uazapi/client";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  const companyId = await getCompanyIdFromRequest(request);
  if (!companyId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  let body: { channel_id?: string; groupjid?: string; description?: string };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
  const channelId = typeof body?.channel_id === "string" ? body.channel_id.trim() : "";
  const groupjid = typeof body?.groupjid === "string" ? body.groupjid.trim() : "";
  const description = typeof body?.description === "string" ? body.description : "";
  if (!channelId || !groupjid) return NextResponse.json({ error: "channel_id e groupjid obrigatórios" }, { status: 400 });
  const resolved = await getChannelToken(channelId, companyId);
  if (!resolved) return NextResponse.json({ error: "Canal não encontrado" }, { status: 404 });
  const result = await updateGroupDescription(resolved.token, groupjid, description);
  if (!result.ok) return NextResponse.json({ error: result.error ?? "Falha ao atualizar descrição" }, { status: 502 });
  return NextResponse.json({ group: result.data });
}
