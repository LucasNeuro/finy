import { createServiceRoleClient } from "@/lib/supabase/admin";
import { isQueueOpen, type BusinessHoursItem, type SpecialDateItem } from "@/lib/queue-hours";
import { NextResponse } from "next/server";

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
    [key: string]: unknown;
  };
};

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as WebhookPayload;
    const event = body?.event;
    const instanceId = body?.instance;
    const data = body?.data ?? {};

    if (!instanceId) {
      return NextResponse.json(
        { error: "Missing instance" },
        { status: 400 }
      );
    }

    // Apenas eventos de mensagem (entrada); ignorar fromMe se vier
    if (event !== "messages") {
      return NextResponse.json({ ok: true });
    }

    const fromMe = data.fromMe === true;
    if (fromMe) {
      return NextResponse.json({ ok: true });
    }

    const externalId =
      (data.chatId ?? data.chatid ?? "") as string;
    const customerPhone =
      (data.from ?? data.number ?? data.wa_id ?? "") as string;
    const content =
      (data.text ?? data.body ?? data.content ?? "") as string;
    const rawTs = data.timestamp ?? data.sent_at;
    const sentAt =
      rawTs != null && (typeof rawTs === "number" || typeof rawTs === "string")
        ? new Date(typeof rawTs === "number" ? rawTs * 1000 : rawTs).toISOString()
        : new Date().toISOString();

    if (!externalId || !content) {
      return NextResponse.json({ ok: true });
    }

    const supabase = createServiceRoleClient();
    const { data: channel, error: channelError } = await supabase
      .from("channels")
      .select("id, company_id, queue_id")
      .eq("uazapi_instance_id", instanceId)
      .eq("is_active", true)
      .single();

    if (channelError || !channel) {
      return NextResponse.json({ ok: true });
    }

    const companyId = channel.company_id;
    const channelId = channel.id;

    let queueId: string | null = null;
    const { data: channelQueues } = await supabase
      .from("channel_queues")
      .select("queue_id, is_default")
      .eq("channel_id", channelId)
      .order("is_default", { ascending: false });

    const cqList = (channelQueues ?? []) as { queue_id: string; is_default: boolean }[];
    if (cqList.length > 0) {
      const queueIds = cqList.map((cq) => cq.queue_id);
      let queues: { id: string; business_hours?: BusinessHoursItem[] | null; special_dates?: SpecialDateItem[] | null }[] | null = null;
      const res = await supabase.from("queues").select("id, business_hours, special_dates").in("id", queueIds);
      if (res.error && (res.error.message.includes("special_dates") || res.error.message.includes("column"))) {
        const fallback = await supabase.from("queues").select("id, business_hours").in("id", queueIds);
        queues = (fallback.data ?? []).map((r) => ({ ...r, special_dates: [] as SpecialDateItem[] }));
      } else {
        queues = res.data ?? [];
      }
      const at = new Date(sentAt);
      for (const cq of cqList) {
        const q = (queues ?? []).find((r) => r.id === cq.queue_id);
        if (
          q &&
          isQueueOpen(
            {
              business_hours: (q.business_hours ?? []) as BusinessHoursItem[],
              special_dates: (q.special_dates ?? []) as SpecialDateItem[],
            },
            at
          )
        ) {
          queueId = cq.queue_id;
          break;
        }
      }
    } else {
      queueId = channel.queue_id ?? null;
    }

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
        return NextResponse.json(
          { error: "Failed to create conversation" },
          { status: 500 }
        );
      }
      conversationId = inserted.id;
    }

    await supabase.from("messages").insert({
      conversation_id: conversationId,
      direction: "in",
      content: content.slice(0, 10000),
      external_id: (data as { id?: string; key?: { id?: string } }).id ?? (data as { key?: { id?: string } }).key?.id ?? null,
      sent_at: sentAt,
    });

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json(
      { error: "Invalid payload" },
      { status: 400 }
    );
  }
}
