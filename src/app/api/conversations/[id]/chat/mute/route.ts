import { getCompanyIdFromRequest } from "@/lib/auth/get-company";
import { requirePermission } from "@/lib/auth/get-profile";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { createClient } from "@/lib/supabase/server";
import { muteChat } from "@/lib/uazapi/client";
import { getChannelToken } from "@/lib/uazapi/channel-token";
import { NextResponse } from "next/server";

/**
 * POST /api/conversations/[id]/chat/mute
 * Silenciar chat no WhatsApp (UAZAPI).
 * Body: { muteEndTime: 0 | 8 | 168 | -1 }
 * 0 = desligar, 8 = 8h, 168 = 1 semana, -1 = permanente.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const companyId = await getCompanyIdFromRequest(request);
  if (!companyId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const err = await requirePermission(companyId, PERMISSIONS.inbox.read);
  if (err) {
    return NextResponse.json({ error: err.error }, { status: err.status });
  }
  const { id } = await params;
  let body: { muteEndTime?: number } = {};
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const muteEndTime = body.muteEndTime;
  if (muteEndTime !== 0 && muteEndTime !== 8 && muteEndTime !== 168 && muteEndTime !== -1) {
    return NextResponse.json(
      { error: "muteEndTime must be 0, 8, 168, or -1" },
      { status: 400 }
    );
  }

  const supabase = await createClient();
  const { data: conversation, error: convError } = await supabase
    .from("conversations")
    .select("channel_id, wa_chat_jid, customer_phone, is_group")
    .eq("id", id)
    .eq("company_id", companyId)
    .single();
  if (convError || !conversation) {
    return NextResponse.json({ error: "Conversation not found" }, { status: 404 });
  }

  const resolved = await getChannelToken(conversation.channel_id, companyId);
  if (!resolved) {
    return NextResponse.json({ error: "Channel or token not configured" }, { status: 400 });
  }
  const number =
    conversation.is_group && conversation.wa_chat_jid
      ? conversation.wa_chat_jid
      : (conversation.wa_chat_jid || conversation.customer_phone || "").trim();
  if (!number) {
    return NextResponse.json({ error: "Conversation has no chat identifier" }, { status: 400 });
  }

  const result = await muteChat(resolved.token, number, muteEndTime as 0 | 8 | 168 | -1);
  if (!result.ok) {
    return NextResponse.json(
      { error: "UAZAPI mute failed", details: result.error },
      { status: 502 }
    );
  }
  return NextResponse.json({ response: "Chat mute settings updated successfully" });
}
