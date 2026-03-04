import { getCompanyIdFromRequest } from "@/lib/auth/get-company";
import { getChannelToken } from "@/lib/uazapi/channel-token";
import { leaveGroup } from "@/lib/uazapi/client";
import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

/**
 * POST /api/groups/leave
 * Body: { channel_id: string, groupjid: string }
 * Sai do grupo na instância WhatsApp.
 */
export async function POST(request: Request) {
  const companyId = await getCompanyIdFromRequest(request);
  if (!companyId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { channel_id?: string; groupjid?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const channelId = typeof body?.channel_id === "string" ? body.channel_id.trim() : "";
  const groupjid = typeof body?.groupjid === "string" ? body.groupjid.trim() : "";
  if (!channelId || !groupjid) {
    return NextResponse.json(
      { error: "channel_id e groupjid são obrigatórios" },
      { status: 400 }
    );
  }

  if (!groupjid.endsWith("@g.us")) {
    return NextResponse.json(
      { error: "groupjid deve ser o ID do grupo (ex: 120363...@g.us)" },
      { status: 400 }
    );
  }

  const resolved = await getChannelToken(channelId, companyId);
  if (!resolved) {
    return NextResponse.json({ error: "Canal não encontrado" }, { status: 404 });
  }

  const result = await leaveGroup(resolved.token, groupjid);
  if (!result.ok) {
    return NextResponse.json(
      { error: result.error ?? "Falha ao sair do grupo" },
      { status: 502 }
    );
  }

  const supabase = await createClient();
  const { error: updateError } = await supabase
    .from("channel_groups")
    .update({ left_at: new Date().toISOString() })
    .eq("channel_id", channelId)
    .eq("jid", groupjid)
    .eq("company_id", companyId);

  if (updateError) {
    console.error("[groups/leave] Erro ao marcar left_at em channel_groups:", updateError);
  }

  return NextResponse.json({ ok: true });
}
