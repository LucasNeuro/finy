import { getCompanyIdFromRequest } from "@/lib/auth/get-company";
import { requirePermission } from "@/lib/auth/get-profile";
import { PERMISSIONS } from "@/lib/auth/permissions";
import {
  invalidateConversationDetail,
  invalidateConversationList,
} from "@/lib/redis/inbox-state";
import { createClient } from "@/lib/supabase/server";
import { archiveChat } from "@/lib/uazapi/client";
import { getChannelToken } from "@/lib/uazapi/channel-token";
import { NextResponse } from "next/server";

/**
 * POST /api/conversations/[id]/chat/archive
 * Arquivar ou desarquivar chat no WhatsApp (UAZAPI) e atualizar status do ticket no banco.
 * Body: { archive: boolean }
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
  let body: { archive?: boolean } = {};
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const archive = body.archive === true;

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

  const result = await archiveChat(resolved.token, number, archive);
  if (!result.ok) {
    return NextResponse.json(
      { error: "UAZAPI archive failed", details: result.error },
      { status: 502 }
    );
  }

  const newStatus = archive ? "archived" : "open";
  await supabase
    .from("conversations")
    .update({
      status: newStatus,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("company_id", companyId);
  await Promise.all([
    invalidateConversationList(companyId),
    invalidateConversationDetail(id),
  ]);

  return NextResponse.json({ response: "Chat updated successfully" });
}
