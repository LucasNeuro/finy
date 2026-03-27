/**
 * Edge Function: executa pipelines de broadcast agendados.
 * Chamada pelo pg_cron a cada minuto.
 *
 * Variáveis de ambiente (configurar no Supabase Dashboard):
 * - UAZAPI_BASE_URL: URL da API UAZAPI (ex: https://clicvend.uazapi.com)
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function toCanonicalJid(raw: string, _isGroup: boolean): string {
  const digits = (raw ?? "").replace(/\D/g, "").replace(/@.*$/, "").trim();
  if (!digits) return raw.trim();
  let d = digits;
  if (d.length === 10 || d.length === 11) d = "55" + d;
  if ((d.length === 12 || d.length === 13) && d.startsWith("55")) return d + "@s.whatsapp.net";
  return digits + "@s.whatsapp.net";
}

function parseTime(t: string): number | null {
  if (!t || typeof t !== "string") return null;
  const m = t.trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  return parseInt(m[1]!, 10) * 60 + parseInt(m[2]!, 10);
}

async function sendCampaignSimple(
  token: string,
  payload: {
    numbers: string[];
    type: string;
    delayMin: number;
    delayMax: number;
    scheduled_for: number;
    folder?: string;
    text?: string;
    file?: string;
    linkPreview?: boolean;
  }
): Promise<{ ok: boolean; error?: string }> {
  const baseUrl = (Deno.env.get("UAZAPI_BASE_URL") ?? "https://free.uazapi.com").replace(/\/$/, "");
  const res = await fetch(`${baseUrl}/sender/simple`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      token,
    },
    body: JSON.stringify({
      numbers: payload.numbers,
      type: payload.type,
      delayMin: payload.delayMin,
      delayMax: payload.delayMax,
      scheduled_for: payload.scheduled_for,
      folder: payload.folder,
      text: payload.text,
      file: payload.file,
      linkPreview: payload.linkPreview,
    }),
  });
  const text = await res.text();
  let data: { error?: string } | undefined;
  try {
    data = text ? (JSON.parse(text) as { error?: string }) : undefined;
  } catch {
    // ignore
  }
  if (!res.ok) {
    return { ok: false, error: (data?.error ?? text) || res.statusText };
  }
  return { ok: true };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST" && req.method !== "GET") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const authHeader = req.headers.get("authorization");
  const cronSecret = Deno.env.get("CRON_SECRET");
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, supabaseKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });

  const tz = Deno.env.get("BROADCAST_CRON_TZ") ?? "America/Sao_Paulo";
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

  const { data: pipelines, error } = await supabase
    .from("broadcast_pipelines")
    .select("id, company_id, name, config, queue_item_ids")
    .eq("status", "scheduled");

  if (error || !pipelines?.length) {
    return new Response(JSON.stringify({ run: 0, message: "Nenhum pipeline agendado" }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
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

    const validItems = (items ?? []).filter((i: { status: string }) => i.status === "pending");
    if (validItems.length === 0) continue;

    const contactIds = [...new Set(validItems.map((i: { channel_contact_id: string }) => i.channel_contact_id))];
    const { data: contacts } = await supabase
      .from("channel_contacts")
      .select("id, jid, phone")
      .in("id", contactIds);

    if (!contacts?.length) continue;

    const contactMap = new Map(contacts.map((c: { id: string }) => [c.id, c]));
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
      const raw = (contact as { jid?: string; phone?: string }).jid ?? (contact as { phone?: string }).phone ?? "";
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
      const { data: channel } = await supabase
        .from("channels")
        .select("id, uazapi_token_encrypted")
        .eq("id", channelId)
        .eq("company_id", pipeline.company_id)
        .single();

      if (!channel?.uazapi_token_encrypted) continue;

      const result = await sendCampaignSimple(channel.uazapi_token_encrypted, {
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
          .in("id", channelItems.map((i: { id: string }) => i.id));
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

  return new Response(JSON.stringify({ run: executed }), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
