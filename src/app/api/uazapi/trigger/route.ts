import { getCompanyIdFromRequest } from "@/lib/auth/get-company";
import { getChannelToken } from "@/lib/uazapi/channel-token";
import { editTrigger, listTriggers } from "@/lib/uazapi/client";
import { NextResponse } from "next/server";

/**
 * GET /api/uazapi/trigger?channel_id=xxx
 * Lista triggers de chatbot da instância vinculada ao canal.
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

  const result = await listTriggers(resolved.token);
  if (!result.ok) {
    return NextResponse.json(
      { error: result.error ?? "Failed to list triggers" },
      { status: 502 }
    );
  }

  return NextResponse.json(result.data ?? []);
}

/**
 * POST /api/uazapi/trigger
 * Cria/atualiza/exclui trigger.
 * Body: { channel_id: string, id?: string, delete?: boolean, trigger: ChatbotTrigger }
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

  const payload: {
    id?: string;
    delete?: boolean;
    trigger: Record<string, unknown>;
  } = {
    trigger: {},
  };

  if (typeof body.id === "string" && body.id.trim()) {
    payload.id = body.id.trim();
  }
  if (typeof body.delete === "boolean") {
    payload.delete = body.delete;
  }
  if (body.trigger && typeof body.trigger === "object") {
    payload.trigger = body.trigger as Record<string, unknown>;
  }

  if (!payload.trigger || Object.keys(payload.trigger).length === 0) {
    return NextResponse.json(
      { error: "trigger payload is required" },
      { status: 400 }
    );
  }

  const result = await editTrigger(resolved.token, payload as Parameters<typeof editTrigger>[1]);
  if (!result.ok) {
    return NextResponse.json(
      { error: result.error ?? "Failed to edit trigger" },
      { status: 502 }
    );
  }

  return NextResponse.json(result.data ?? payload);
}

