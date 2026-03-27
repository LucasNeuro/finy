import { getCompanyIdFromRequest } from "@/lib/auth/get-company";
import { requirePermission } from "@/lib/auth/get-profile";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { createClient } from "@/lib/supabase/server";
import { sendCampaignSimple } from "@/lib/uazapi/client";
import { getChannelToken } from "@/lib/uazapi/channel-token";
import { toCanonicalJid } from "@/lib/phone-canonical";
import { NextResponse } from "next/server";

const MEDIA_TYPES = ["image", "video", "audio", "ptt", "myaudio", "ptv", "document", "sticker"] as const;

const UAZAPI_TYPE_MAP: Record<string, "text" | "image" | "video" | "audio" | "document" | "sticker"> = {
  text: "text",
  image: "image",
  video: "video",
  audio: "audio",
  ptt: "audio",
  myaudio: "audio",
  ptv: "video",
  document: "document",
  sticker: "sticker",
};

/**
 * POST /api/broadcast-queue/send-via-uazapi
 * Envia campanha via UAZAPI /sender/simple — delay aleatório, processamento no servidor.
 * Body: { item_ids: string[], content?: string, type?: string, file?: string, caption?: string, docName?: string, folder?: string }
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
    item_ids?: string[];
    content?: string;
    type?: string;
    file?: string;
    caption?: string;
    docName?: string;
    folder?: string;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const itemIds = Array.isArray(body?.item_ids) ? body.item_ids.filter((id): id is string => typeof id === "string") : [];
  const content = typeof body?.content === "string" ? body.content.trim() : "";
  const type = typeof body?.type === "string" ? body.type.toLowerCase() : "text";
  const file = typeof body?.file === "string" ? body.file.trim() : "";
  const caption = typeof body?.caption === "string" ? body.caption.trim() : "";
  const docName = typeof body?.docName === "string" ? body.docName.trim() : "";
  const folder = typeof body?.folder === "string" ? body.folder.trim() : undefined;

  const isMedia = MEDIA_TYPES.includes(type as (typeof MEDIA_TYPES)[number]) && file;
  if (!isMedia && !content) {
    return NextResponse.json({ error: "content ou (type + file) é obrigatório" }, { status: 400 });
  }
  if (itemIds.length === 0) {
    return NextResponse.json({ error: "item_ids é obrigatório e deve ter ao menos um item" }, { status: 400 });
  }

  const supabase = await createClient();

  const { data: items, error: itemsErr } = await supabase
    .from("broadcast_queue")
    .select("id, channel_id, channel_contact_id, status")
    .in("id", itemIds)
    .eq("company_id", companyId)
    .eq("status", "pending");

  if (itemsErr) {
    return NextResponse.json({ error: itemsErr.message }, { status: 500 });
  }

  const validItems = (items ?? []).filter((i) => i.status === "pending");
  if (validItems.length === 0) {
    return NextResponse.json({ error: "Nenhum item pendente encontrado" }, { status: 404 });
  }

  const contactIds = [...new Set(validItems.map((i) => i.channel_contact_id))];
  const { data: contacts, error: contactsErr } = await supabase
    .from("channel_contacts")
    .select("id, jid, phone")
    .in("id", contactIds);

  if (contactsErr || !contacts?.length) {
    return NextResponse.json({ error: "Contatos não encontrados" }, { status: 404 });
  }

  const contactMap = new Map(contacts.map((c) => [c.id, c]));

  const uazType = UAZAPI_TYPE_MAP[type] ?? "text";
  const text = isMedia ? (caption || content || "") : content;
  const baseFolder = folder ?? `Campanha ${new Date().toISOString().slice(0, 10)}`;

  const byChannel = new Map<string, { items: typeof validItems; numbers: string[] }>();
  for (const item of validItems) {
    const contact = contactMap.get(item.channel_contact_id);
    if (!contact) continue;
    const raw = contact.jid ?? contact.phone ?? "";
    const jid = raw.includes("@") ? raw : toCanonicalJid(raw.replace(/\D/g, ""), false);
    if (!jid || !jid.endsWith("@s.whatsapp.net")) continue;

    const entry = byChannel.get(item.channel_id) ?? { items: [], numbers: [] };
    entry.items.push(item);
    entry.numbers.push(jid);
    byChannel.set(item.channel_id, entry);
  }

  if (byChannel.size === 0) {
    return NextResponse.json({ error: "Nenhum número válido para envio" }, { status: 400 });
  }

  const now = new Date().toISOString();
  let totalCount = 0;
  const errors: string[] = [];

  for (const [channelId, { items: channelItems, numbers: channelNumbers }] of byChannel) {
    const resolved = await getChannelToken(channelId, companyId);
    if (!resolved) {
      errors.push(`Canal ${channelId} não encontrado`);
      continue;
    }

    const result = await sendCampaignSimple(resolved.token, {
      numbers: channelNumbers,
      type: uazType,
      delayMin: 25,
      delayMax: 45,
      scheduled_for: Date.now(),
      folder: byChannel.size > 1 ? `${baseFolder} - ${channelId.slice(0, 8)}` : baseFolder,
      text: text || undefined,
      file: isMedia ? file : undefined,
      docName: type === "document" ? docName || undefined : undefined,
      linkPreview: !isMedia,
    });

    if (result.ok) {
      await supabase
        .from("broadcast_queue")
        .update({ status: "sent", sent_at: now })
        .in("id", channelItems.map((i) => i.id));
      totalCount += channelNumbers.length;
    } else {
      errors.push(result.error ?? "Falha ao enviar");
    }
  }

  if (totalCount === 0 && errors.length > 0) {
    return NextResponse.json(
      { error: errors.join("; ") ?? "Falha ao enviar campanha" },
      { status: 502 }
    );
  }

  return NextResponse.json({
    ok: true,
    count: totalCount,
    status: "queued",
    sent_at: now,
    ...(errors.length > 0 && { warnings: errors }),
  });
}
