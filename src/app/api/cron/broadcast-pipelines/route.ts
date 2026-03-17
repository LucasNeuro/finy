import { createServiceRoleClient } from "@/lib/supabase/admin";
import { sendCampaignSimple } from "@/lib/uazapi/client";
import { getChannelToken } from "@/lib/uazapi/channel-token";
import { toCanonicalJid } from "@/lib/phone-canonical";
import { NextResponse } from "next/server";

/**
 * GET /api/cron/broadcast-pipelines
 * Chamado pelo cron a cada minuto. Executa pipelines agendados cujo horário está ativo.
 * Requer header CRON_SECRET para segurança.
 */
export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Usar horário de Brasília (o servidor Vercel roda em UTC)
  const tz = process.env.BROADCAST_CRON_TZ ?? "America/Sao_Paulo";
  const formatter = new Intl.DateTimeFormat("pt-BR", {
    timeZone: tz,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const parts = formatter.formatToParts(new Date());
  const hour = parseInt(parts.find((p) => p.type === "hour")?.value ?? "0", 10);
  const minute = parseInt(parts.find((p) => p.type === "minute")?.value ?? "0", 10);
  const currentMinutes = hour * 60 + minute;

  function parseTime(t: string): number | null {
    if (!t || typeof t !== "string") return null;
    const m = t.trim().match(/^(\d{1,2}):(\d{2})$/);
    if (!m) return null;
    return parseInt(m[1]!, 10) * 60 + parseInt(m[2]!, 10);
  }

  const supabase = createServiceRoleClient();

  const { data: pipelines, error } = await supabase
    .from("broadcast_pipelines")
    .select("id, company_id, name, config, queue_item_ids")
    .eq("status", "scheduled");

  if (error || !pipelines?.length) {
    return NextResponse.json({ run: 0, message: "Nenhum pipeline agendado" });
  }

  let executed = 0;
  for (const pipeline of pipelines) {
    const config = (pipeline.config ?? {}) as Record<string, unknown>;
    const horario = config.horario as Record<string, string> | undefined;
    const inicio = parseTime(horario?.inicio ?? "");
    const fim = parseTime(horario?.fim ?? "");

    if (inicio == null || fim == null) continue;
    if (currentMinutes < inicio || currentMinutes > fim) continue;

    const queueItemIds = (pipeline.queue_item_ids ?? []) as string[];
    if (queueItemIds.length === 0) continue;

    const { data: items } = await supabase
      .from("broadcast_queue")
      .select("id, channel_id, channel_contact_id, status")
      .in("id", queueItemIds)
      .eq("company_id", pipeline.company_id)
      .eq("status", "pending");

    const validItems = (items ?? []).filter((i) => i.status === "pending");
    if (validItems.length === 0) continue;

    const contactIds = [...new Set(validItems.map((i) => i.channel_contact_id))];
    const { data: contacts } = await supabase
      .from("channel_contacts")
      .select("id, jid, phone")
      .in("id", contactIds);

    if (!contacts?.length) continue;

    const contactMap = new Map(contacts.map((c) => [c.id, c]));
    const mensagem = config.mensagem as Record<string, string> | undefined;
    const delay = config.delay as Record<string, string> | undefined;
    const content = (mensagem?.text ?? "").trim();
    const file = (mensagem?.file ?? "").trim();
    const delayMin = Math.max(2, parseInt(String(delay?.min ?? "25"), 10) || 25);
    const delayMax = Math.max(delayMin, parseInt(String(delay?.max ?? "45"), 10) || 45);

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

    if (byChannel.size === 0) continue;

    const nowStr = new Date().toISOString();
    await supabase
      .from("broadcast_pipelines")
      .update({ status: "running", updated_at: nowStr })
      .eq("id", pipeline.id);

    let totalCount = 0;
    for (const [channelId, { items: channelItems, numbers: channelNumbers }] of byChannel) {
      const resolved = await getChannelToken(channelId, pipeline.company_id);
      if (!resolved) continue;

      const result = await sendCampaignSimple(resolved.token, {
        numbers: channelNumbers,
        type: file ? "image" : "text",
        delayMin,
        delayMax,
        scheduled_for: Date.now(),
        folder: `Pipeline ${pipeline.name} ${nowStr.slice(0, 10)}`,
        text: content || undefined,
        file: file || undefined,
        linkPreview: !file,
      });

      if (result.ok) {
        await supabase
          .from("broadcast_queue")
          .update({ status: "sent", sent_at: nowStr })
          .in("id", channelItems.map((i) => i.id));
        totalCount += channelNumbers.length;
      }
    }

    await supabase
      .from("broadcast_pipelines")
      .update({
        status: totalCount > 0 ? "completed" : "failed",
        updated_at: new Date().toISOString(),
      })
      .eq("id", pipeline.id);

    executed++;
  }

  return NextResponse.json({ run: executed });
}
