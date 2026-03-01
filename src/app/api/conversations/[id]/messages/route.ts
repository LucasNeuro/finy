import { getCompanyIdFromCookie } from "@/lib/auth/get-company";
import { createClient } from "@/lib/supabase/server";
import { sendText } from "@/lib/uazapi/client";
import { NextResponse } from "next/server";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const companyId = await getCompanyIdFromCookie();
  if (!companyId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id: conversationId } = await params;
  let body: { content?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const content = typeof body?.content === "string" ? body.content.trim() : "";
  if (!content) {
    return NextResponse.json({ error: "content is required" }, { status: 400 });
  }

  const supabase = await createClient();
  const { data: conversation, error: convError } = await supabase
    .from("conversations")
    .select("id, company_id, channel_id, customer_phone")
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
  const number = conversation.customer_phone;
  const result = await sendText(token, number, content);
  if (!result.ok) {
    return NextResponse.json(
      { error: "Failed to send via UAZAPI", details: result.error },
      { status: 502 }
    );
  }

  const sentAt = new Date().toISOString();
  const { error: insertErr } = await supabase.from("messages").insert({
    conversation_id: conversationId,
    direction: "out",
    content,
    sent_at: sentAt,
  });
  if (insertErr) {
    return NextResponse.json({ error: insertErr.message }, { status: 500 });
  }
  await supabase
    .from("conversations")
    .update({ last_message_at: sentAt, updated_at: sentAt })
    .eq("id", conversationId);

  return NextResponse.json({ ok: true });
}
