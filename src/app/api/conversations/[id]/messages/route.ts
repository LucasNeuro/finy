import { getCompanyIdFromRequest } from "@/lib/auth/get-company";
import { createClient } from "@/lib/supabase/server";
import { sendText, sendMedia } from "@/lib/uazapi/client";
import { NextResponse } from "next/server";

const MEDIA_TYPES = ["image", "video", "audio", "ptt", "myaudio", "ptv", "document", "sticker"] as const;

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const companyId = await getCompanyIdFromRequest(request);
  if (!companyId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id: conversationId } = await params;
  let body: {
    content?: string;
    type?: string;
    file?: string;
    caption?: string;
    docName?: string;
    mimetype?: string;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const content = typeof body?.content === "string" ? body.content.trim() : "";
  const type = typeof body?.type === "string" ? body.type.toLowerCase() : "text";
  const file = typeof body?.file === "string" ? body.file.trim() : "";
  const caption = typeof body?.caption === "string" ? body.caption.trim() : "";
  const docName = typeof body?.docName === "string" ? body.docName.trim() : "";
  const mimetype = typeof body?.mimetype === "string" ? body.mimetype.trim() : undefined;

  const isMedia = MEDIA_TYPES.includes(type as (typeof MEDIA_TYPES)[number]) && file;
  if (!isMedia && !content) {
    return NextResponse.json({ error: "content or (type + file) is required" }, { status: 400 });
  }
  if (isMedia && !file) {
    return NextResponse.json({ error: "file is required for media messages" }, { status: 400 });
  }

  const supabase = await createClient();
  const { data: conversation, error: convError } = await supabase
    .from("conversations")
    .select("id, company_id, channel_id, customer_phone, wa_chat_jid, is_group")
    .eq("id", conversationId)
    .eq("company_id", companyId)
    .single();
  if (convError || !conversation) {
    return NextResponse.json({ error: "Conversation not found" }, { status: 404 });
  }

  const { data: channel, error: chError } = await supabase
    .from("channels")
    .select("id, uazapi_instance_id, uazapi_token_encrypted")
    .eq("id", conversation.channel_id)
    .eq("company_id", companyId)
    .single();
  if (chError || !channel?.uazapi_token_encrypted) {
    return NextResponse.json(
      { error: "Channel or token not configured" },
      { status: 400 }
    );
  }

  const token = channel.uazapi_token_encrypted;
  const number =
    conversation.is_group && conversation.wa_chat_jid
      ? conversation.wa_chat_jid
      : conversation.customer_phone;

  let result: { ok: boolean; error?: string };
  if (isMedia) {
    const uazType = type === "myaudio" ? "myaudio" : type === "ptv" ? "ptv" : type as "image" | "video" | "document" | "audio" | "ptt" | "sticker";
    result = await sendMedia(token, number, {
      type: uazType,
      file,
      text: caption || undefined,
      docName: docName || undefined,
      mimetype,
    });
  } else {
    result = await sendText(token, number, content);
  }

  if (!result.ok) {
    return NextResponse.json(
      { error: "Failed to send via UAZAPI", details: result.error },
      { status: 502 }
    );
  }

  const sentAt = new Date().toISOString();
  const messageType = isMedia ? (type === "myaudio" || type === "ptv" ? type : type === "ptt" ? "ptt" : type) : "text";
  const insertPayload: Record<string, unknown> = {
    conversation_id: conversationId,
    direction: "out",
    content: isMedia ? (caption || `[${messageType}]`) : content,
    message_type: messageType,
    sent_at: sentAt,
  };
  if (isMedia && file) {
    insertPayload.media_url = file;
    if (caption) insertPayload.caption = caption;
    if (docName) insertPayload.file_name = docName;
  }

  const { error: insertErr } = await supabase.from("messages").insert(insertPayload);
  if (insertErr) {
    return NextResponse.json({ error: insertErr.message }, { status: 500 });
  }
  await supabase
    .from("conversations")
    .update({ last_message_at: sentAt, updated_at: sentAt })
    .eq("id", conversationId);

  return NextResponse.json({ ok: true });
}
