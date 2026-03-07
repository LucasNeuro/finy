import { getCompanyIdFromRequest } from "@/lib/auth/get-company";
import { getChannelToken } from "@/lib/uazapi/channel-token";
import { leaveGroup } from "@/lib/uazapi/client";
import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

/**
 * POST /api/groups/delete
 * Body: { channel_id: string, groupjid: string, leave_first?: boolean }
 * Sai do grupo/comunidade no WhatsApp (se leave_first !== false) e remove da nossa lista (channel_groups).
 * "Deletar de vez": some da lista e, quando possível, sai no WhatsApp.
 */
export async function POST(request: Request) {
  const companyId = await getCompanyIdFromRequest(request);
  if (!companyId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { channel_id?: string; groupjid?: string; leave_first?: boolean };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const channelId = typeof body?.channel_id === "string" ? body.channel_id.trim() : "";
  const groupjid = typeof body?.groupjid === "string" ? body.groupjid.trim() : "";
  const leaveFirst = body?.leave_first !== false;

  if (!channelId || !groupjid) {
    return NextResponse.json(
      { error: "channel_id e groupjid são obrigatórios" },
      { status: 400 }
    );
  }

  if (!groupjid.endsWith("@g.us")) {
    return NextResponse.json(
      { error: "groupjid deve ser o ID do grupo/comunidade (ex: 120363...@g.us)" },
      { status: 400 }
    );
  }

  if (leaveFirst) {
    const resolved = await getChannelToken(channelId, companyId);
    if (resolved) {
      const result = await leaveGroup(resolved.token, groupjid);
      if (!result.ok) {
        // Continua e remove da lista mesmo se falhar ao sair (ex: já saiu, sem permissão)
        console.warn("[groups/delete] leaveGroup falhou:", result.error);
      }
    }
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("channel_groups")
    .delete()
    .eq("channel_id", channelId)
    .eq("jid", groupjid)
    .eq("company_id", companyId)
    .select("id")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({ error: "Grupo/comunidade não encontrado na lista" }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}
