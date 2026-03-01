import { getCompanyIdFromCookie } from "@/lib/auth/get-company";
import { requireAdmin } from "@/lib/auth/get-profile";
import { getChannelToken } from "@/lib/uazapi/channel-token";
import { updateDelaySettings } from "@/lib/uazapi/client";
import { NextResponse } from "next/server";

/**
 * POST /api/uazapi/instance/delay
 * Body: { channel_id, msg_delay_min: number, msg_delay_max: number }
 */
export async function POST(request: Request) {
  const companyId = await getCompanyIdFromCookie();
  if (!companyId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const adminErr = await requireAdmin(companyId);
  if (adminErr) {
    return NextResponse.json({ error: adminErr.error }, { status: adminErr.status });
  }

  let body: { channel_id?: string; msg_delay_min?: number; msg_delay_max?: number };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const channelId = typeof body?.channel_id === "string" ? body.channel_id.trim() : "";
  const msg_delay_min = Math.max(0, Number(body?.msg_delay_min) || 0);
  const msg_delay_max = Math.max(msg_delay_min, Number(body?.msg_delay_max) || msg_delay_min);

  if (!channelId) {
    return NextResponse.json({ error: "channel_id is required" }, { status: 400 });
  }

  const resolved = await getChannelToken(channelId, companyId);
  if (!resolved) {
    return NextResponse.json({ error: "Channel not found" }, { status: 404 });
  }

  const result = await updateDelaySettings(resolved.token, msg_delay_min, msg_delay_max);
  if (!result.ok) {
    return NextResponse.json(
      { error: result.error ?? "Failed to update delay" },
      { status: 502 }
    );
  }

  return NextResponse.json({
    msg_delay_min,
    msg_delay_max,
    instance: result.instance,
  });
}
