import { getCompanyIdFromRequest } from "@/lib/auth/get-company";
import { requireAdmin } from "@/lib/auth/get-profile";
import { getChannelToken } from "@/lib/uazapi/channel-token";
import { updateProfileName, updateProfileImage } from "@/lib/uazapi/client";
import { NextResponse } from "next/server";

const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/gif", "image/webp"];
const MAX_IMAGE_BYTES = 5 * 1024 * 1024; // 5MB

/**
 * Normaliza image para o formato aceito pela UAZAPI: base64, URL ou "remove"/"delete".
 * - data URL (base64) → extrai só o base64 e envia como data:image/...;base64,XXX
 * - URL http(s) → baixa a imagem, valida tipo e envia em base64 (evita erro "not a valid image")
 * - "remove"/"delete" → envia como está
 */
async function normalizeProfileImage(image: string): Promise<{ ok: true; value: string } | { ok: false; error: string }> {
  const s = image.trim();
  if (s === "remove" || s === "delete") {
    return { ok: true, value: s };
  }
  if (s.startsWith("data:image/") && s.includes(";base64,")) {
    const base64 = s.split(";base64,")[1];
    if (!base64) return { ok: false, error: "Imagem inválida." };
    if (base64.length > (MAX_IMAGE_BYTES * 4) / 3 + 100) {
      return { ok: false, error: "Imagem muito grande. Máximo 5MB." };
    }
    return { ok: true, value: s };
  }
  if (s.startsWith("http://") || s.startsWith("https://")) {
    try {
      const res = await fetch(s, { signal: AbortSignal.timeout(15000), redirect: "follow" });
      if (!res.ok) {
        return { ok: false, error: "Não foi possível acessar a URL da imagem." };
      }
      const contentType = (res.headers.get("content-type") ?? "").toLowerCase();
      const isImage = ALLOWED_IMAGE_TYPES.some((t) => contentType.startsWith(t)) || contentType.startsWith("image/");
      if (!isImage) {
        return { ok: false, error: "A URL não aponta para uma imagem válida (JPEG, PNG, GIF ou WebP)." };
      }
      const buf = Buffer.from(await res.arrayBuffer());
      if (buf.length > MAX_IMAGE_BYTES) {
        return { ok: false, error: "Imagem muito grande. Máximo 5MB." };
      }
      const mime = contentType.split(";")[0].trim() || "image/jpeg";
      const base64 = buf.toString("base64");
      return { ok: true, value: `data:${mime};base64,${base64}` };
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Erro ao buscar imagem";
      return { ok: false, error: `URL da imagem: ${msg}` };
    }
  }
  return { ok: false, error: "Envie uma URL de imagem, uma imagem em base64 ou use 'remove' para remover." };
}

/**
 * POST /api/uazapi/instance/profile
 * Body: { channel_id, name?: string, image?: string }
 * - name: atualiza nome do perfil WhatsApp (max 25 chars)
 * - image: URL, data URL (base64), ou "remove"/"delete" para remover
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
    const normalized = await normalizeProfileImage(img);
    if (!normalized.ok) {
      return NextResponse.json({ error: normalized.error }, { status: 400 });
    }
    const r = await updateProfileImage(resolved.token, normalized.value);
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
