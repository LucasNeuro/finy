import { getCompanyIdFromRequest } from "@/lib/auth/get-company";
import { requirePermission } from "@/lib/auth/get-profile";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { createClient } from "@/lib/supabase/server";
import { sendCampaignSimple } from "@/lib/uazapi/client";
import { getChannelToken } from "@/lib/uazapi/channel-token";
import { toCanonicalJid } from "@/lib/phone-canonical";
import { NextResponse } from "next/server";

const MEDIA_TYPES = ["image", "video", "audio", "ptt", "document", "sticker"] as const;

/**
 * POST /api/broadcast-pipelines/[id]/run
 * Executa um pipeline: envia mensagens aos itens da fila usando a config do pipeline.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const companyId = await getCompanyIdFromRequest(request);
  if (!companyId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const permErr = await requirePermission(companyId, PERMISSIONS.broadcast.manage);
  if (permErr) {
    return NextResponse.json({ error: permErr.error }, { status: permErr.status });
  }

  const { id: pipelineId } = await params;
  if (!pipelineId) {
    return NextResponse.json({ error: "Pipeline ID é obrigatório" }, { status: 400 });
  }

  const supabase = await createClient();

  const { data: pipeline, error: pipelineErr } = await supabase
    .from("broadcast_pipelines")
    .select("id, name, config, queue_item_ids, status")
    .eq("id", pipelineId)
    .eq("company_id", companyId)
    .single();

  if (pipelineErr || !pipeline) {
    return NextResponse.json({ error: "Pipeline não encontrado" }, { status: 404 });
  }

  const config = (pipeline.config ?? {}) as Record<string, unknown>;
  const mensagem = config.mensagem as Record<string, string> | undefined;
  const delay = config.delay as Record<string, string> | undefined;
  const envio = config.envio as Record<string, string> | undefined;
  const queueItemIds = (pipeline.queue_item_ids ?? []) as string[];

  if (queueItemIds.length === 0) {
    return NextResponse.json(
      { error: "Pipeline não tem contatos na fila. Salve o fluxo com contatos selecionados." },
      { status: 400 }
    );
  }

  const content = (mensagem?.text ?? "").trim();
  const file = (mensagem?.file ?? "").trim();
  const useUazapi = (envio?.tipo ?? "otimizado") === "otimizado";
  const delayMin = Math.max(2, parseInt(String(delay?.min ?? "25"), 10) || 25);
  const delayMax = Math.max(delayMin, parseInt(String(delay?.max ?? "45"), 10) || 45);

  const type = file ? "image" : "text";

  const { data: items, error: itemsErr } = await supabase
    .from("broadcast_queue")
    .select("id, channel_id, channel_contact_id, status")
    .in("id", queueItemIds)
    .eq("company_id", companyId)
    .eq("status", "pending");

  if (itemsErr) {
    return NextResponse.json({ error: itemsErr.message }, { status: 500 });
  }

  const validItems = (items ?? []).filter((i) => i.status === "pending");
  if (validItems.length === 0) {
    return NextResponse.json(
      { error: "Nenhum item pendente na fila. Os contatos podem já ter sido enviados." },
      { status: 400 }
    );
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
  const text = file ? (content || "") : content;
  const baseFolder = `Pipeline ${pipeline.name} ${new Date().toISOString().slice(0, 10)}`;

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

  await supabase
    .from("broadcast_pipelines")
    .update({ status: "running", updated_at: new Date().toISOString() })
    .eq("id", pipelineId);

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
      type: file ? "image" : "text",
      delayMin,
      delayMax,
      scheduled_for: Date.now(),
      folder: byChannel.size > 1 ? `${baseFolder} - ${channelId.slice(0, 8)}` : baseFolder,
      text: text || undefined,
      file: file || undefined,
      linkPreview: !file,
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

  await supabase
    .from("broadcast_pipelines")
    .update({
      status: totalCount > 0 ? "completed" : "failed",
      updated_at: new Date().toISOString(),
    })
    .eq("id", pipelineId);

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
