import { getCompanyIdFromRequest } from "@/lib/auth/get-company";
import { requirePermission } from "@/lib/auth/get-profile";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { invalidateConversationList } from "@/lib/redis/inbox-state";
import { createClient } from "@/lib/supabase/server";
import { deleteChat } from "@/lib/uazapi/client";
import { getChannelToken } from "@/lib/uazapi/channel-token";
import { NextResponse } from "next/server";

/**
 * DELETE /api/conversations/[id]/chat/delete
 * Deleta chat e/ou mensagens no WhatsApp (UAZAPI) e/ou no nosso banco.
 * Body: { deleteChatDB?: boolean, deleteMessagesDB?: boolean, deleteChatWhatsApp?: boolean }
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const companyId = await getCompanyIdFromRequest(request);
  if (!companyId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const err = await requirePermission(companyId, PERMISSIONS.inbox.manage_tickets);
  if (err) {
    return NextResponse.json({ error: err.error }, { status: err.status });
  }
  const { id } = await params;
  let body: { deleteChatDB?: boolean; deleteMessagesDB?: boolean; deleteChatWhatsApp?: boolean } = {};
  try {
    body = await request.json();
  } catch {
    // body opcional
  }

  const supabase = await createClient();
  const { data: conversation, error: convError } = await supabase
    .from("conversations")
    .select("id, channel_id, wa_chat_jid, customer_phone, is_group")
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

  const deleteChatWhatsApp = body.deleteChatWhatsApp === true;
  const deleteMessagesDB = body.deleteMessagesDB === true;
  const deleteChatDB = body.deleteChatDB === true;

  if (!deleteChatWhatsApp && !deleteMessagesDB && !deleteChatDB) {
    return NextResponse.json(
      { error: "Specify at least one: deleteChatDB, deleteMessagesDB, or deleteChatWhatsApp" },
      { status: 400 }
    );
  }

  if (deleteChatWhatsApp) {
    const result = await deleteChat(resolved.token, number, {
      deleteChatDB: deleteChatDB || undefined,
      deleteMessagesDB: deleteMessagesDB || undefined,
      deleteChatWhatsApp: true,
    });
    if (!result.ok) {
      return NextResponse.json(
        { error: "UAZAPI delete failed", details: result.error },
        { status: 502 }
      );
    }
  }

  if (deleteMessagesDB) {
    await supabase.from("messages").delete().eq("conversation_id", id);
  }
  if (deleteChatDB) {
    await supabase.from("conversations").delete().eq("id", id).eq("company_id", companyId);
    await invalidateConversationList(companyId);
  } else if (deleteMessagesDB) {
    await invalidateConversationList(companyId);
  }

  return NextResponse.json({ response: "Chat deletion process completed" });
}
