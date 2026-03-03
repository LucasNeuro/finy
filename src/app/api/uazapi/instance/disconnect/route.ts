import { getCompanyIdFromRequest } from "@/lib/auth/get-company";
import { requireAdmin } from "@/lib/auth/get-profile";
import { getChannelToken } from "@/lib/uazapi/channel-token";
import { disconnectInstance } from "@/lib/uazapi/client";
import { NextResponse } from "next/server";

/**
 * POST /api/uazapi/instance/disconnect
 * Desconecta a instância do WhatsApp (exige novo QR para reconectar).
 * Body: { channel_id: string }
 */
export async function POST(request: Request) {
  const companyId = await getCompanyIdFromRequest(request);
  if (!companyId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const adminErr = await requireAdmin(companyId);
  if (adminErr) {
    return NextResponse.json({ error: adminErr.error }, { status: adminErr.status });
  }

  let body: { channel_id?: string };
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

  const result = await disconnectInstance(resolved.token);
  if (!result.ok) {
    return NextResponse.json(
      { error: result.error ?? "Failed to disconnect" },
      { status: 502 }
    );
  }

  return NextResponse.json({
    response: "Disconnected",
    instance: result.instance,
  });
}
