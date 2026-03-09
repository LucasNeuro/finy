import { createServiceRoleClient } from "@/lib/supabase/admin";
import { migrateOneMessageToStorage } from "@/lib/media-storage-migrate";
import { NextResponse } from "next/server";

const MEDIA_TYPES = ["image", "video", "audio", "ptt", "document", "sticker"];
const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

/**
 * POST /api/admin/backfill-media
 *
 * Migra mídias antigas para o bucket whatsapp-media (preenche media_storage_path).
 * Requer BACKFILL_SECRET no body para autorizar (use em script ou cron).
 *
 * Body: { secret: string, limit?: number, companyId?: string }
 * - secret: deve ser igual a process.env.BACKFILL_SECRET
 * - limit: quantas mensagens processar por request (default 50, max 200)
 * - companyId: opcional; se informado, processa só dessa empresa
 */
export async function POST(request: Request) {
  let body: { secret?: string; limit?: number; companyId?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const secret = process.env.BACKFILL_SECRET;
  if (!secret || body.secret !== secret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const limit = Math.min(
    MAX_LIMIT,
    Math.max(1, Number(body.limit) || DEFAULT_LIMIT)
  );
  const companyIdFilter = typeof body.companyId === "string" ? body.companyId.trim() : null;

  const supabase = createServiceRoleClient();

  let conversationIds: string[] | null = null;
  if (companyIdFilter) {
    const { data: convs, error: convListErr } = await supabase
      .from("conversations")
      .select("id")
      .eq("company_id", companyIdFilter);
    if (convListErr || !convs?.length) {
      return NextResponse.json({
        processed: 0,
        failed: 0,
        errors: [],
        message: `No conversations found for company ${companyIdFilter}`,
      });
    }
    conversationIds = convs.map((c) => c.id);
  }

  let query = supabase
    .from("messages")
    .select("id, conversation_id, external_id, message_type, file_name")
    .is("media_storage_path", null)
    .not("external_id", "is", null)
    .in("message_type", MEDIA_TYPES)
    .limit(limit);

  if (conversationIds?.length) {
    query = query.in("conversation_id", conversationIds);
  }

  const { data: messages, error: msgError } = await query;

  if (msgError) {
    return NextResponse.json(
      { error: "Failed to list messages", details: msgError.message },
      { status: 500 }
    );
  }

  if (!messages?.length) {
    return NextResponse.json({
      processed: 0,
      failed: 0,
      errors: [],
      message: "No messages to migrate",
    });
  }

  const convIds = [...new Set(messages.map((m) => m.conversation_id))];
  const { data: conversations, error: convError } = await supabase
    .from("conversations")
    .select("id, company_id, channel_id")
    .in("id", convIds);

  if (convError || !conversations?.length) {
    return NextResponse.json(
      { error: "Failed to load conversations", details: convError?.message },
      { status: 500 }
    );
  }

  const convById = new Map(
    conversations.map((c) => [c.id, c as { id: string; company_id: string; channel_id: string }])
  );

  const channelIds = [...new Set(messages.map((m) => convById.get(m.conversation_id)?.channel_id).filter(Boolean))] as string[];
  const { data: channels, error: chError } = await supabase
    .from("channels")
    .select("id, company_id, uazapi_token_encrypted")
    .in("id", channelIds);

  if (chError || !channels?.length) {
    return NextResponse.json(
      { error: "Failed to load channels", details: chError?.message },
      { status: 500 }
    );
  }

  const tokenByChannelId = new Map(
    (channels as { id: string; company_id: string; uazapi_token_encrypted: string | null }[])
      .filter((c) => c.uazapi_token_encrypted)
      .map((c) => [c.id, c.uazapi_token_encrypted as string])
  );

  let processed = 0;
  const errors: { messageId: string; error: string }[] = [];

  for (const msg of messages) {
    const conv = convById.get(msg.conversation_id);
    if (!conv) {
      errors.push({ messageId: msg.id, error: "Conversation not found" });
      continue;
    }
    const token = tokenByChannelId.get(conv.channel_id);
    if (!token) {
      errors.push({ messageId: msg.id, error: "Channel token not found" });
      continue;
    }

    const result = await migrateOneMessageToStorage(supabase, {
      messageId: msg.id,
      conversationId: msg.conversation_id,
      companyId: conv.company_id,
      channelToken: token,
      externalId: (msg.external_id ?? "").trim(),
      messageType: msg.message_type ?? "document",
      fileName: msg.file_name,
    });

    if (result.ok) {
      processed++;
    } else {
      errors.push({ messageId: msg.id, error: result.error });
    }
  }

  return NextResponse.json({
    processed,
    failed: errors.length,
    total: messages.length,
    errors: errors.slice(0, 20),
  });
}
