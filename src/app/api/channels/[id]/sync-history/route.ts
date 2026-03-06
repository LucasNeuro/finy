import { getCompanyIdFromRequest } from "@/lib/auth/get-company";
import { requirePermission } from "@/lib/auth/get-profile";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { isQueueOpen, type BusinessHoursItem, type SpecialDateItem } from "@/lib/queue-hours";
import { invalidateConversationList } from "@/lib/redis/inbox-state";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { getChannelToken } from "@/lib/uazapi/channel-token";
import { findChats, findMessages, type UazapiChat, type UazapiMessage } from "@/lib/uazapi/client";
import { NextResponse } from "next/server";

/**
 * POST /api/channels/[id]/sync-history
 * Sincroniza histórico de chats e mensagens da UAZAPI para conversations e messages.
 * Pode ser chamado:
 * - Pelo usuário (auth + permission channels.manage)
 * - Internamente pelo webhook ao receber "connection" (header X-Internal-Sync-Secret = INTERNAL_SYNC_SECRET).
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: channelId } = await params;
  if (!channelId) {
    return NextResponse.json({ error: "channel id required" }, { status: 400 });
  }

  const internalSecret = request.headers.get("X-Internal-Sync-Secret");
  const expectedSecret = process.env.INTERNAL_SYNC_SECRET;
  const isInternalCall = Boolean(expectedSecret && internalSecret === expectedSecret);

  let companyId: string | null = null;

  if (isInternalCall) {
    const supabaseAdmin = createServiceRoleClient();
    const { data: ch } = await supabaseAdmin
      .from("channels")
      .select("company_id")
      .eq("id", channelId)
      .single();
    companyId = (ch as { company_id?: string } | null)?.company_id ?? null;
    if (!companyId) {
      return NextResponse.json({ error: "Channel not found" }, { status: 404 });
    }
  } else {
    companyId = await getCompanyIdFromRequest(request);
    if (!companyId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const permErr = await requirePermission(companyId, PERMISSIONS.channels.manage);
    if (permErr) {
      return NextResponse.json({ error: permErr.error }, { status: permErr.status });
    }
  }

  const resolved = await getChannelToken(channelId, companyId!);
  if (!resolved) {
    return NextResponse.json({ error: "Channel not found" }, { status: 404 });
  }

  const token = resolved.token;
  const supabase = createServiceRoleClient();

  const { data: chatsData, ok: chatsOk, error: chatsError } = await findChats(token, {
    limit: 40,
    offset: 0,
    sort: "-wa_lastMsgTimestamp",
  });

  if (!chatsOk || !chatsData?.chats?.length) {
    return NextResponse.json({
      ok: true,
      chats_processed: 0,
      messages_processed: 0,
      error: chatsError ?? undefined,
    });
  }

  const chats = chatsData.chats as UazapiChat[];
  let conversationsCreated = 0;
  let messagesInserted = 0;

  for (const chat of chats) {
    const waChatid = (chat.wa_chatid ?? "").toString().trim();
    if (!waChatid) continue;

    const isGroup = chat.wa_isGroup === true || waChatid.endsWith("@g.us");

    const { data: msgData, ok: msgOk } = await findMessages(token, waChatid, { limit: 40, offset: 0 });
    const messages = (msgOk && msgData?.messages ? msgData.messages : []) as UazapiMessage[];

    const { data: channelRow } = await supabase
      .from("channels")
      .select("id, company_id")
      .eq("id", channelId)
      .eq("company_id", companyId)
      .single();

    if (!channelRow) continue;

    const { data: cqData } = await supabase
      .from("channel_queues")
      .select("queue_id, is_default")
      .eq("channel_id", channelId)
      .order("is_default", { ascending: false });
    const cqList = (cqData ?? []) as { queue_id: string; is_default: boolean }[];
    const { data: queuesData } = await supabase
      .from("queues")
      .select("id, kind, business_hours, special_dates")
      .in("id", cqList.map((cq) => cq.queue_id));

    const queues = (queuesData ?? []) as { id: string; kind: string; business_hours?: BusinessHoursItem[] | null; special_dates?: SpecialDateItem[] | null }[];
    let queueId: string | null = null;
    if (isGroup) {
      const gq = cqList.find((cq) => queues.find((q) => q.id === cq.queue_id && q.kind === "group"));
      if (gq) queueId = gq.queue_id;
    } else {
      const ticketCqList = cqList.filter((cq) => {
        const q = queues.find((r) => r.id === cq.queue_id);
        return q && (q.kind === "ticket" || !q.kind);
      });
      const at = new Date();
      for (const cq of ticketCqList) {
        const q = queues.find((r) => r.id === cq.queue_id);
        if (q && isQueueOpen(
          {
            business_hours: (q.business_hours ?? []) as BusinessHoursItem[],
            special_dates: (q.special_dates ?? []) as SpecialDateItem[],
          },
          at
        )) {
          queueId = cq.queue_id;
          break;
        }
      }
      if (!queueId && ticketCqList.length > 0) queueId = ticketCqList[0].queue_id;
      if (!queueId && cqList.length > 0) queueId = cqList[0].queue_id;
    }

    let conversationId: string | null = null;
    const { data: existing } = await supabase
      .from("conversations")
      .select("id")
      .eq("channel_id", channelId)
      .eq("external_id", waChatid)
      .eq("kind", isGroup ? "group" : "ticket")
      .single();

    if (existing) {
      conversationId = existing.id;
    } else {
      if (isGroup) {
        await supabase.from("channel_groups").upsert(
          {
            channel_id: channelId,
            company_id: companyId,
            jid: waChatid,
            name: (chat.wa_name ?? chat.wa_contactName ?? null) ?? null,
            synced_at: new Date().toISOString(),
          },
          { onConflict: "channel_id,jid" }
        );
      }
      let assignedTo: string | null = null;
      if (!isGroup && queueId) {
        const { data: assignments } = await supabase
          .from("queue_assignments")
          .select("user_id")
          .eq("queue_id", queueId)
          .eq("company_id", companyId)
          .order("last_assigned_at", { ascending: true, nullsFirst: true })
          .limit(1);
        const first = (assignments ?? []) as { user_id: string }[];
        if (first.length > 0) {
          assignedTo = first[0].user_id;
          await supabase
            .from("queue_assignments")
            .update({ last_assigned_at: new Date().toISOString() })
            .eq("queue_id", queueId)
            .eq("user_id", assignedTo)
            .eq("company_id", companyId);
        }
      }
      const { data: inserted, error: insErr } = await supabase
        .from("conversations")
        .insert({
          company_id: companyId,
          channel_id: channelId,
          external_id: waChatid,
          wa_chat_jid: waChatid,
          kind: isGroup ? "group" : "ticket",
          is_group: isGroup,
          customer_phone: (chat.wa_chatid ?? "").toString().replace(/@.*$/, "") || waChatid,
          customer_name: (chat.wa_contactName ?? chat.wa_name ?? null) ?? null,
          queue_id: queueId,
          assigned_to: assignedTo,
          status: "open",
          last_message_at: new Date().toISOString(),
        })
        .select("id")
        .single();
      if (!insErr && inserted) {
        conversationId = inserted.id;
        conversationsCreated++;
      }
    }

    if (!conversationId) continue;

    const latestSentAt = messages.length > 0
      ? Math.max(
          ...messages.map((m) => {
            const ts = m.timestamp;
            return typeof ts === "number" ? ts * 1000 : 0;
          })
        )
      : 0;
    if (latestSentAt > 0) {
      await supabase
        .from("conversations")
        .update({
          last_message_at: new Date(latestSentAt).toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", conversationId);
    }

    for (const msg of messages) {
      const fromMe = msg.fromMe === true;
      const body = (msg.body ?? msg.text ?? "").toString().trim();
      const rawTs = msg.timestamp;
      const sentAt =
        rawTs != null && typeof rawTs === "number"
          ? new Date(rawTs * 1000).toISOString()
          : new Date().toISOString();
      const extId = (msg.id ?? "").toString() || null;

      if (extId) {
        const { data: existingByExt } = await supabase
          .from("messages")
          .select("id")
          .eq("conversation_id", conversationId)
          .eq("external_id", extId)
          .limit(1)
          .single();
        if (existingByExt) continue;
      } else {
        const { data: existingBySent } = await supabase
          .from("messages")
          .select("id")
          .eq("conversation_id", conversationId)
          .eq("sent_at", sentAt)
          .limit(1)
          .single();
        if (existingBySent) continue;
      }

      const { error: msgInsErr } = await supabase.from("messages").insert({
        conversation_id: conversationId,
        direction: fromMe ? "out" : "in",
        content: body.slice(0, 10000),
        external_id: extId,
        sent_at: sentAt,
      });
      if (!msgInsErr) messagesInserted++;
    }
  }

  await invalidateConversationList(companyId);
  return NextResponse.json({
    ok: true,
    chats_processed: chats.length,
    conversations_created: conversationsCreated,
    messages_processed: messagesInserted,
    error: chatsError ?? undefined,
  });
}
