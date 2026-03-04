import { getCompanyIdFromRequest } from "@/lib/auth/get-company";
import { getChannelToken } from "@/lib/uazapi/channel-token";
import { updateGroupParticipants } from "@/lib/uazapi/client";
import { NextResponse } from "next/server";

const VALID_ACTIONS = ["add", "remove", "promote", "demote", "approve", "reject"] as const;

/**
 * POST /api/groups/update-participants
 * Body: { channel_id: string, groupjid: string, action: string, participants: string[] }
 * action: add | remove | promote | demote | approve | reject. Apenas admins.
 */
export async function POST(request: Request) {
  const companyId = await getCompanyIdFromRequest(request);
  if (!companyId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { channel_id?: string; groupjid?: string; action?: string; participants?: string[] };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const channelId = typeof body?.channel_id === "string" ? body.channel_id.trim() : "";
  const groupjid = typeof body?.groupjid === "string" ? body.groupjid.trim() : "";
  const action = typeof body?.action === "string" ? body.action.trim().toLowerCase() : "";
  const participants = Array.isArray(body?.participants)
    ? body.participants.filter((p): p is string => typeof p === "string").map((p) => String(p).trim())
    : [];

  if (!channelId || !groupjid) {
    return NextResponse.json(
      { error: "channel_id e groupjid são obrigatórios" },
      { status: 400 }
    );
  }
  if (!VALID_ACTIONS.includes(action as (typeof VALID_ACTIONS)[number])) {
    return NextResponse.json(
      { error: "action deve ser: add, remove, promote, demote, approve ou reject" },
      { status: 400 }
    );
  }
  if (participants.length === 0) {
    return NextResponse.json(
      { error: "participants deve ser um array não vazio" },
      { status: 400 }
    );
  }

  const resolved = await getChannelToken(channelId, companyId);
  if (!resolved) {
    return NextResponse.json({ error: "Canal não encontrado" }, { status: 404 });
  }

  const result = await updateGroupParticipants(
    resolved.token,
    groupjid,
    action as "add" | "remove" | "promote" | "demote" | "approve" | "reject",
    participants
  );
  if (!result.ok) {
    return NextResponse.json(
      { error: result.error ?? "Falha ao atualizar participantes" },
      { status: 502 }
    );
  }
  return NextResponse.json({ group: result.data });
}
