import { getCompanyIdFromCookie } from "@/lib/auth/get-company";
import { getChannelToken } from "@/lib/uazapi/channel-token";
import { updateInstancePresence } from "@/lib/uazapi/client";
import { NextResponse } from "next/server";

/**
 * POST /api/uazapi/instance/presence
 * Atualiza presença global (available | unavailable).
 * Body: { channel_id, presence: "available" | "unavailable" }
 */
export async function POST(request: Request) {
  const companyId = await getCompanyIdFromCookie();
  if (!companyId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { channel_id?: string; presence?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const channelId = typeof body?.channel_id === "string" ? body.channel_id.trim() : "";
  if (!channelId) {
    return NextResponse.json({ error: "channel_id is required" }, { status: 400 });
  }

  const presence = body.presence === "unavailable" ? "unavailable" : "available";

  const resolved = await getChannelToken(channelId, companyId);
  if (!resolved) {
    return NextResponse.json({ error: "Channel not found" }, { status: 404 });
  }

  const result = await updateInstancePresence(resolved.token, presence);
  if (!result.ok) {
    return NextResponse.json(
      { error: result.error ?? "Failed to update presence" },
      { status: 502 }
    );
  }

  return NextResponse.json({ response: "Presence updated successfully" });
}
