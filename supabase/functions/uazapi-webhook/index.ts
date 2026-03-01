// Supabase Edge Function: receptor do webhook global UAZAPI.
// Configure no servidor UAZAPI a URL: https://SEU_PROJETO.supabase.co/functions/v1/uazapi-webhook
// Payload: { event, instance, data } (WebhookEvent). Só processamos event === "messages" e !data.fromMe.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type WebhookPayload = {
  event?: string;
  instance?: string;
  data?: {
    chatId?: string;
    chatid?: string;
    from?: string;
    number?: string;
    text?: string;
    body?: string;
    fromMe?: boolean;
    timestamp?: number;
    wa_contactName?: string;
    pushName?: string;
    name?: string;
    id?: string;
    key?: { id?: string };
    [key: string]: unknown;
  };
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const body = (await req.json()) as WebhookPayload;
    const event = body?.event;
    const instanceId = body?.instance;
    const data = body?.data ?? {};

    if (!instanceId) {
      return new Response(
        JSON.stringify({ error: "Missing instance" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (event !== "messages") {
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (data.fromMe === true) {
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const externalId = (data.chatId ?? data.chatid ?? "") as string;
    const customerPhone = (data.from ?? data.number ?? data.wa_id ?? "") as string;
    const content = (data.text ?? data.body ?? data.content ?? "") as string;
    const rawTs = data.timestamp ?? data.sent_at;
    const sentAt =
      rawTs != null && (typeof rawTs === "number" || typeof rawTs === "string")
        ? new Date(typeof rawTs === "number" ? rawTs * 1000 : rawTs).toISOString()
        : new Date().toISOString();

    if (!externalId || !content) {
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });

    const { data: channel, error: channelError } = await supabase
      .from("channels")
      .select("id, company_id, queue_id")
      .eq("uazapi_instance_id", instanceId)
      .eq("is_active", true)
      .single();

    if (channelError || !channel) {
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const queueId = channel.queue_id ?? null;
    const companyId = channel.company_id;
    const channelId = channel.id;

    const { data: existing } = await supabase
      .from("conversations")
      .select("id")
      .eq("channel_id", channelId)
      .eq("external_id", externalId)
      .single();

    let conversationId: string;
    if (existing) {
      conversationId = existing.id;
      await supabase
        .from("conversations")
        .update({
          last_message_at: sentAt,
          updated_at: new Date().toISOString(),
        })
        .eq("id", conversationId);
    } else {
      const { data: inserted, error: insertConvError } = await supabase
        .from("conversations")
        .insert({
          company_id: companyId,
          channel_id: channelId,
          external_id: externalId,
          customer_phone: customerPhone,
          customer_name: (data.wa_contactName ?? data.pushName ?? data.name) ?? null,
          queue_id: queueId,
          status: "open",
          last_message_at: sentAt,
        })
        .select("id")
        .single();

      if (insertConvError || !inserted) {
        return new Response(
          JSON.stringify({ error: "Failed to create conversation" }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      conversationId = inserted.id;
    }

    const externalMessageId = data.id ?? data.key?.id ?? null;
    await supabase.from("messages").insert({
      conversation_id: conversationId,
      direction: "in",
      content: content.slice(0, 10000),
      external_id: externalMessageId,
      sent_at: sentAt,
    });

    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch {
    return new Response(JSON.stringify({ error: "Invalid payload" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
