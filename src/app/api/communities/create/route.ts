import { getCompanyIdFromRequest } from "@/lib/auth/get-company";
import { getChannelToken } from "@/lib/uazapi/channel-token";
import { createCommunity, type UazapiGroupInfo } from "@/lib/uazapi/client";
import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

/**
 * POST /api/communities/create
 * Body: { channel_id: string, name: string }
 */
export async function POST(request: Request) {
  const companyId = await getCompanyIdFromRequest(request);
  if (!companyId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { channel_id?: string; name?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const channelId = typeof body?.channel_id === "string" ? body.channel_id.trim() : "";
  const name = typeof body?.name === "string" ? body.name.trim() : "";

  if (!channelId) {
    return NextResponse.json({ error: "channel_id é obrigatório" }, { status: 400 });
  }
  if (!name) {
    return NextResponse.json({ error: "name é obrigatório" }, { status: 400 });
  }

  const resolved = await getChannelToken(channelId, companyId);
  if (!resolved) {
    return NextResponse.json({ error: "Canal não encontrado" }, { status: 404 });
  }

  const result = await createCommunity(resolved.token, name);
  if (!result.ok) {
    return NextResponse.json(
      { error: result.error ?? "Falha ao criar comunidade" },
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
        name: ((group as UazapiGroupInfo).Name ?? name).trim() || null,
        topic: null,
        invite_link: ((group as UazapiGroupInfo).InviteLink ?? (group as { invite_link?: string }).invite_link ?? "").trim() || null,
        synced_at: new Date().toISOString(),
      },
      { onConflict: "channel_id,jid" }
    );
  }

  return NextResponse.json(group ?? { ok: true });
}
