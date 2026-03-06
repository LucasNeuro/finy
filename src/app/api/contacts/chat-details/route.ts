import { getCompanyIdFromRequest } from "@/lib/auth/get-company";
import { getChannelToken } from "@/lib/uazapi/channel-token";
import { getChatDetails } from "@/lib/uazapi/client";
import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

/**
 * POST /api/contacts/chat-details
 * Body: { channel_id: string, number: string, preview?: boolean }
 * number: telefone (ex: 5511999999999) ou jid do grupo (ex: 120363123456789012@g.us).
 * Retorna detalhes completos do chat/contato via UAZAPI /chat/details.
 * Se a UAZAPI retornar foto (imagePreview/image), grava em channel_contacts.avatar_url para exibir na lista.
 */
export async function POST(request: Request) {
  const companyId = await getCompanyIdFromRequest(request);
  if (!companyId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { channel_id?: string; number?: string; preview?: boolean };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const channelId = typeof body?.channel_id === "string" ? body.channel_id.trim() : "";
  const number = typeof body?.number === "string" ? body.number.trim() : "";
  if (!channelId || !number) {
    return NextResponse.json(
      { error: "channel_id e number são obrigatórios" },
      { status: 400 }
    );
  }

  const resolved = await getChannelToken(channelId, companyId);
  if (!resolved) {
    return NextResponse.json({ error: "Canal não encontrado" }, { status: 404 });
  }

  const result = await getChatDetails(resolved.token, number, {
    preview: body.preview ?? true,
  });

  if (!result.ok) {
    return NextResponse.json(
      { error: result.error ?? "Falha ao obter detalhes do chat" },
      { status: 502 }
    );
  }

  const data = result.data ?? {};
  const avatarUrl = (data as { imagePreview?: string; image?: string }).imagePreview
    || (data as { image?: string }).image
    || null;
  if (avatarUrl && typeof avatarUrl === "string" && avatarUrl.trim()) {
    const supabase = await createClient();
    const jidNorm = number.includes("@") ? number : `${number.replace(/\D/g, "")}@s.whatsapp.net`;
    const jids = number === jidNorm ? [number] : [number, jidNorm];
    await supabase
      .from("channel_contacts")
      .update({ avatar_url: avatarUrl.trim(), synced_at: new Date().toISOString() })
      .eq("channel_id", channelId)
      .eq("company_id", companyId)
      .in("jid", jids);
  }

  return NextResponse.json(data);
}
