import { getCompanyIdFromCookie } from "@/lib/auth/get-company";
import { requireAdmin } from "@/lib/auth/get-profile";
import { getChannelToken } from "@/lib/uazapi/channel-token";
import {
  getProxyConfig,
  updateProxyConfig,
  deleteProxyConfig,
} from "@/lib/uazapi/client";
import { NextResponse } from "next/server";

/**
 * GET /api/uazapi/instance/proxy?channel_id=xxx
 * Retorna configuração de proxy da instância.
 */
export async function GET(request: Request) {
  const companyId = await getCompanyIdFromCookie();
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

  const result = await getProxyConfig(resolved.token);
  if (!result.ok) {
    return NextResponse.json(
      { error: result.error ?? "Failed to get proxy config" },
      { status: 502 }
    );
  }

  return NextResponse.json(result.data ?? {});
}

/**
 * POST /api/uazapi/instance/proxy
 * Configura ou altera proxy. Body: { channel_id, enable, proxy_url? }
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

  let body: { channel_id?: string; enable?: boolean; proxy_url?: string };
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

  const enable = body.enable ?? true;
  const result = await updateProxyConfig(resolved.token, {
    enable,
    ...(enable && body.proxy_url != null && { proxy_url: String(body.proxy_url).trim() }),
  });

  if (!result.ok) {
    return NextResponse.json(
      { error: result.error ?? "Failed to update proxy" },
      { status: 502 }
    );
  }

  return NextResponse.json(result.data ?? { ok: true });
}

/**
 * DELETE /api/uazapi/instance/proxy?channel_id=xxx
 * Remove proxy (volta ao padrão).
 */
export async function DELETE(request: Request) {
  const companyId = await getCompanyIdFromCookie();
  if (!companyId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const adminErr = await requireAdmin(companyId);
  if (adminErr) {
    return NextResponse.json({ error: adminErr.error }, { status: adminErr.status });
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

  const result = await deleteProxyConfig(resolved.token);
  if (!result.ok) {
    return NextResponse.json(
      { error: result.error ?? "Failed to delete proxy" },
      { status: 502 }
    );
  }

  return NextResponse.json({ response: "Proxy removed" });
}
