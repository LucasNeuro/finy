import { getCompanyIdFromRequest } from "@/lib/auth/get-company";
import { getChannelToken } from "@/lib/uazapi/channel-token";
import { joinGroup, type UazapiGroupInfo } from "@/lib/uazapi/client";
import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

/**
 * POST /api/groups/join
 * Body: { channel_id: string, invitecode: string }
 */
export async function POST(request: Request) {
  const companyId = await getCompanyIdFromRequest(request);
  if (!companyId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { channel_id?: string; invitecode?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const channelId = typeof body?.channel_id === "string" ? body.channel_id.trim() : "";
  const invitecode = typeof body?.invitecode === "string" ? body.invitecode.trim() : "";

  if (!channelId) {
    return NextResponse.json({ error: "channel_id é obrigatório" }, { status: 400 });
  }
  if (!invitecode) {
    return NextResponse.json({ error: "invitecode (link ou código de convite) é obrigatório" }, { status: 400 });
  }

  const resolved = await getChannelToken(channelId, companyId);
  if (!resolved) {
    return NextResponse.json({ error: "Canal não encontrado" }, { status: 404 });
  }

  const result = await joinGroup(resolved.token, invitecode);
  if (!result.ok) {
    return NextResponse.json(
      { error: result.error ?? "Falha ao entrar no grupo" },
      { status: 502 }
    );
  }

  const group = result.data;
  if (group?.JID) {
    const supabase = await createClient();
    await supabase.from("channel_groups").upsert(
      {
        channel_id: channelId,
        company_id: companyId,
        jid: (group as UazapiGroupInfo).JID?.trim() ?? "",
        name: ((group as UazapiGroupInfo).Name ?? "").trim() || null,
        topic: ((group as UazapiGroupInfo).Topic ?? "").trim() || null,
        invite_link: ((group as UazapiGroupInfo).InviteLink ?? (group as { invite_link?: string }).invite_link ?? "").trim() || null,
        synced_at: new Date().toISOString(),
      },
      { onConflict: "channel_id,jid" }
    );
  }

  return NextResponse.json(group ?? { ok: true });
}
