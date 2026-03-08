import { getCompanyIdFromCookie, getCompanyIdFromRequest } from "@/lib/auth/get-company";
import { requireAdmin } from "@/lib/auth/get-profile";
import { getChannelToken } from "@/lib/uazapi/channel-token";
import { getWebhook, setWebhook } from "@/lib/uazapi/client";
import { NextResponse } from "next/server";

/**
 * GET /api/uazapi/instance/webhook?channel_id=xxx
 * Retorna webhooks configurados na instância.
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

  const result = await getWebhook(resolved.token);
  if (!result.ok) {
    return NextResponse.json(
      { error: result.error ?? "Failed to get webhook" },
      { status: 502 }
    );
  }

  return NextResponse.json(result.data ?? []);
}

/**
 * POST /api/uazapi/instance/webhook
 * Body: { channel_id, url, events?: string[], excludeMessages?: string[] }
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

  let body: { channel_id?: string; url?: string; events?: string[]; excludeMessages?: string[] };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const channelId = typeof body?.channel_id === "string" ? body.channel_id.trim() : "";
  const url = typeof body?.url === "string" ? body.url.trim() : "";
  if (!channelId || !url) {
    return NextResponse.json({ error: "channel_id and url are required" }, { status: 400 });
  }

  const resolved = await getChannelToken(channelId, companyId);
  if (!resolved) {
    return NextResponse.json({ error: "Channel not found" }, { status: 404 });
  }

  const result = await setWebhook(resolved.token, url, {
    events: Array.isArray(body.events) ? body.events : undefined,
    excludeMessages: Array.isArray(body.excludeMessages) ? body.excludeMessages : undefined,
  });

  if (!result.ok) {
    return NextResponse.json(
      { error: result.error ?? "Failed to set webhook" },
      { status: 502 }
    );
  }

  return NextResponse.json(result.data ?? { ok: true });
}
