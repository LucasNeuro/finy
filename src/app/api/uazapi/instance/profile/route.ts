import { getCompanyIdFromRequest } from "@/lib/auth/get-company";
import { requireAdmin } from "@/lib/auth/get-profile";
import { getChannelToken } from "@/lib/uazapi/channel-token";
import { updateProfileName, updateProfileImage } from "@/lib/uazapi/client";
import { NextResponse } from "next/server";

/**
 * POST /api/uazapi/instance/profile
 * Body: { channel_id, name?: string, image?: string }
 * - name: atualiza nome do perfil WhatsApp (max 25 chars)
 * - image: URL, base64 ou "remove"/"delete" para remover
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

  let body: { channel_id?: string; name?: string; image?: string };
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

  const updates: string[] = [];

  if (typeof body.name === "string" && body.name.trim()) {
    const r = await updateProfileName(resolved.token, body.name.trim().slice(0, 25));
    if (!r.ok) {
      return NextResponse.json({ error: r.error ?? "Failed to update profile name" }, { status: 502 });
    }
    updates.push("name");
  }

  if (body.image !== undefined) {
    const img = typeof body.image === "string" ? body.image : String(body.image);
    const r = await updateProfileImage(resolved.token, img);
    if (!r.ok) {
      return NextResponse.json({ error: r.error ?? "Failed to update profile image" }, { status: 502 });
    }
    updates.push("image");
  }

  if (updates.length === 0) {
    return NextResponse.json({ error: "name or image is required" }, { status: 400 });
  }

  return NextResponse.json({ updated: updates });
}
