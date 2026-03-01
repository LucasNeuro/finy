import { getCompanyIdFromCookie } from "@/lib/auth/get-company";
import { getChannelToken } from "@/lib/uazapi/channel-token";
import { getInstancePrivacy, setInstancePrivacy } from "@/lib/uazapi/client";
import { NextResponse } from "next/server";

const PRIVACY_KEYS = [
  "groupadd",
  "last",
  "status",
  "profile",
  "readreceipts",
  "online",
  "calladd",
] as const;

/**
 * GET /api/uazapi/instance/privacy?channel_id=xxx
 * Retorna configurações de privacidade da instância.
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

  const result = await getInstancePrivacy(resolved.token);
  if (!result.ok) {
    return NextResponse.json(
      { error: result.error ?? "Failed to get privacy settings" },
      { status: 502 }
    );
  }

  return NextResponse.json(result.data ?? {});
}

/**
 * POST /api/uazapi/instance/privacy
 * Atualiza configurações de privacidade.
 * Body: { channel_id, groupadd?, last?, status?, profile?, readreceipts?, online?, calladd? }
 */
export async function POST(request: Request) {
  const companyId = await getCompanyIdFromCookie();
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

  const settings: Record<string, string> = {};
  for (const key of PRIVACY_KEYS) {
    const v = body[key];
    if (typeof v === "string" && v.trim()) {
      settings[key] = v.trim();
    }
  }

  if (Object.keys(settings).length === 0) {
    return NextResponse.json(
      { error: "At least one privacy setting is required" },
      { status: 400 }
    );
  }

  const result = await setInstancePrivacy(resolved.token, settings);
  if (!result.ok) {
    return NextResponse.json(
      { error: result.error ?? "Failed to update privacy" },
      { status: 502 }
    );
  }

  return NextResponse.json(result.data ?? settings);
}
