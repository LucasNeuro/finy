import { getCompanyIdFromRequest } from "@/lib/auth/get-company";
import { getChannelToken } from "@/lib/uazapi/channel-token";
import { editQuickReply, listQuickReplies } from "@/lib/uazapi/client";
import { NextResponse } from "next/server";

/**
 * GET /api/uazapi/quickreply?channel_id=xxx
 * Lista respostas rápidas (QuickReply) da instância vinculada ao canal.
 */
export async function GET(request: Request) {
  const companyId = await getCompanyIdFromRequest(request);
  if (!companyId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const channelId = searchParams.get("channel_id")?.trim();
  if (!channelId) {
    return NextResponse.json({ error: "channel_id is required" }, { status: 400 });
  }

  const resolved = await getChannelToken(channelId, companyId);
  if (!resolved) {
    return NextResponse.json({ error: "Channel not found" }, { status: 404 });
  }

  const result = await listQuickReplies(resolved.token);
  if (!result.ok) {
    return NextResponse.json(
      { error: result.error ?? "Failed to list quick replies" },
      { status: 502 }
    );
  }

  return NextResponse.json(result.data ?? []);
}

/**
 * POST /api/uazapi/quickreply
 * Cria/atualiza/exclui resposta rápida.
 * Body: { channel_id: string, id?: string, delete?: boolean, shortCut: string, type: string, text?: string, file?: string }
 */
export async function POST(request: Request) {
  const companyId = await getCompanyIdFromRequest(request);
  if (!companyId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const channelId = typeof body?.channel_id === "string" ? body.channel_id.trim() : "";
  if (!channelId) {
    return NextResponse.json({ error: "channel_id is required" }, { status: 400 });
  }

  const resolved = await getChannelToken(channelId, companyId);
  if (!resolved) {
    return NextResponse.json({ error: "Channel not found" }, { status: 404 });
  }

  const shortCut = typeof body.shortCut === "string" ? body.shortCut.trim() : "";
  const type = typeof body.type === "string" ? body.type.trim() : "";
  const text = typeof body.text === "string" ? body.text : undefined;
  const file = typeof body.file === "string" ? body.file : undefined;
  const id = typeof body.id === "string" && body.id.trim() ? body.id.trim() : undefined;
  const del = typeof body.delete === "boolean" ? body.delete : false;

  if (!shortCut || !type) {
    return NextResponse.json(
      { error: "shortCut and type are required" },
      { status: 400 }
    );
  }

  const result = await editQuickReply(resolved.token, {
    id,
    delete: del,
    shortCut,
    type,
    ...(text ? { text } : {}),
    ...(file ? { file } : {}),
  });

  if (!result.ok) {
    return NextResponse.json(
      { error: result.error ?? "Failed to edit quick reply" },
      { status: 502 }
    );
  }

  return NextResponse.json(result.data ?? { ok: true });
}

