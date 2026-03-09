import { getCompanyIdFromRequest } from "@/lib/auth/get-company";
import { requirePermission } from "@/lib/auth/get-profile";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { invalidateConversationDetail, invalidateConversationList } from "@/lib/redis/inbox-state";
import { createClient } from "@/lib/supabase/server";
import { sendReaction } from "@/lib/uazapi/client";
import { normalizePhoneForSend } from "@/lib/phone-canonical";
import { NextResponse } from "next/server";

/**
 * POST /api/conversations/[id]/messages/reaction
 * Body: { message_id: string (UUID), emoji: string } — emoji vazio remove a reação.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const companyId = await getCompanyIdFromRequest(request);
  if (!companyId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const permErr = await requirePermission(companyId, PERMISSIONS.inbox.read);
  if (permErr) {
    return NextResponse.json({ error: permErr.error }, { status: permErr.status });
  }

  const { id: conversationId } = await params;
  let body: { message_id?: string; emoji?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const messageId = typeof body?.message_id === "string" ? body.message_id.trim() : "";
  const emoji = typeof body?.emoji === "string" ? body.emoji.trim() : "";
  if (!messageId) {
    return NextResponse.json({ error: "message_id is required" }, { status: 400 });
  }

  const supabase = await createClient();
  const { data: message, error: msgErr } = await supabase
    .from("messages")
    .select("id, external_id, conversation_id")
    .eq("id", messageId)
    .eq("conversation_id", conversationId)
    .single();

  if (msgErr || !message) {
    return NextResponse.json({ error: "Message not found" }, { status: 404 });
  }

  const externalId = (message as { external_id?: string | null }).external_id;
  if (!externalId) {
    return NextResponse.json(
      { error: "Esta mensagem não possui ID externo; não é possível reagir." },
      { status: 400 }
    );
  }

  const { data: conversation, error: convErr } = await supabase
    .from("conversations")
    .select("id, company_id, channel_id, customer_phone, wa_chat_jid, is_group, assigned_to")
    .eq("id", conversationId)
    .eq("company_id", companyId)
    .single();

  if (convErr || !conversation) {
    return NextResponse.json({ error: "Conversation not found" }, { status: 404 });
  }

  const { data: { user } } = await supabase.auth.getUser();
  const assignedTo = conversation.assigned_to ?? null;
  if (assignedTo !== (user?.id ?? null)) {
    return NextResponse.json(
      { error: "Atribua esta conversa a você para enviar reações." },
      { status: 403 }
    );
  }

  const { data: channel, error: chErr } = await supabase
    .from("channels")
    .select("id, uazapi_token_encrypted")
    .eq("id", conversation.channel_id)
    .eq("company_id", companyId)
    .single();

  if (chErr || !channel?.uazapi_token_encrypted) {
    return NextResponse.json({ error: "Canal não configurado" }, { status: 400 });
  }

  const isGroup = !!conversation.is_group;
  const number =
    isGroup && conversation.wa_chat_jid
      ? conversation.wa_chat_jid
      : normalizePhoneForSend(conversation.customer_phone, isGroup);

  const result = await sendReaction(
    channel.uazapi_token_encrypted,
    number,
    externalId,
    emoji
  );

  if (!result.ok) {
    return NextResponse.json(
      { error: result.error ?? "Falha ao enviar reação." },
      { status: 502 }
    );
  }

  const { error: updateErr } = await supabase
    .from("messages")
    .update({ reaction: emoji || null })
    .eq("id", messageId)
    .eq("conversation_id", conversationId);

  if (updateErr) {
    return NextResponse.json(
      { error: "Reação enviada, mas falha ao atualizar localmente." },
      { status: 500 }
    );
  }

  await Promise.all([
    invalidateConversationDetail(conversationId),
    invalidateConversationList(companyId),
  ]);

  return NextResponse.json({ ok: true, reaction: emoji || null });
}
