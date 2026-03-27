import { getCompanyIdFromRequest } from "@/lib/auth/get-company";
import { requirePermission } from "@/lib/auth/get-profile";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { createClient } from "@/lib/supabase/server";
import { sendText, sendMedia } from "@/lib/uazapi/client";
import { getChannelToken } from "@/lib/uazapi/channel-token";
import { normalizePhoneForSend } from "@/lib/phone-canonical";
import { NextResponse } from "next/server";

const MEDIA_TYPES = ["image", "video", "audio", "ptt", "myaudio", "ptv", "document", "sticker"] as const;

/**
 * POST /api/broadcast-queue/send
 * Envia mensagem para um único item da fila (chamado em sequência pelo frontend com delay).
 * Body: { item_id: string, content?: string, type?: string, file?: string, caption?: string, docName?: string }
 */
export async function POST(request: Request) {
  const companyId = await getCompanyIdFromRequest(request);
  if (!companyId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const permErr = await requirePermission(companyId, PERMISSIONS.inbox.reply);
  if (permErr) {
    return NextResponse.json({ error: permErr.error }, { status: permErr.status });
  }

  let body: {
    item_id?: string;
    content?: string;
    type?: string;
    file?: string;
    caption?: string;
    docName?: string;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const itemId = typeof body?.item_id === "string" ? body.item_id.trim() : "";
  const content = typeof body?.content === "string" ? body.content.trim() : "";
  const type = typeof body?.type === "string" ? body.type.toLowerCase() : "text";
  const file = typeof body?.file === "string" ? body.file.trim() : "";
  const caption = typeof body?.caption === "string" ? body.caption.trim() : "";
  const docName = typeof body?.docName === "string" ? body.docName.trim() : "";

  const isMedia = MEDIA_TYPES.includes(type as (typeof MEDIA_TYPES)[number]) && file;
  if (!isMedia && !content) {
    return NextResponse.json({ error: "content ou (type + file) é obrigatório" }, { status: 400 });
  }
  if (!itemId) {
    return NextResponse.json({ error: "item_id é obrigatório" }, { status: 400 });
  }

  const supabase = await createClient();

  const { data: item, error: itemErr } = await supabase
    .from("broadcast_queue")
    .select("id, channel_id, channel_contact_id, status")
    .eq("id", itemId)
    .eq("company_id", companyId)
    .eq("status", "pending")
    .single();

  if (itemErr || !item) {
    return NextResponse.json({ error: "Item não encontrado ou já enviado" }, { status: 404 });
  }

  const { data: contact, error: contactErr } = await supabase
    .from("channel_contacts")
    .select("id, jid, phone")
    .eq("id", item.channel_contact_id)
    .single();

  if (contactErr || !contact) {
    return NextResponse.json({ error: "Contato não encontrado" }, { status: 404 });
  }

  const resolved = await getChannelToken(item.channel_id, companyId);
  if (!resolved) {
    return NextResponse.json({ error: "Canal não encontrado" }, { status: 404 });
  }

  const number = normalizePhoneForSend(contact.phone ?? contact.jid?.replace(/@.*$/, "") ?? "", false);
  if (!number) {
    return NextResponse.json({ error: "Número inválido" }, { status: 400 });
  }

  let result: { ok: boolean; error?: string };
  if (isMedia) {
    const uazType = type === "myaudio" ? "myaudio" : type === "ptv" ? "ptv" : type as "image" | "video" | "document" | "audio" | "ptt" | "sticker";
    result = await sendMedia(resolved.token, number, {
      type: uazType,
      file,
      text: caption || undefined,
      docName: docName || undefined,
    });
  } else {
    result = await sendText(resolved.token, number, content, { linkPreview: true });
  }

  const now = new Date().toISOString();
  if (result.ok) {
    await supabase
      .from("broadcast_queue")
      .update({ status: "sent", sent_at: now })
      .eq("id", itemId);
    return NextResponse.json({ ok: true, sent_at: now });
  } else {
    await supabase
      .from("broadcast_queue")
      .update({ status: "failed", error_message: result.error ?? "Erro ao enviar" })
      .eq("id", itemId);
    return NextResponse.json({ error: result.error ?? "Falha ao enviar" }, { status: 502 });
  }
}
