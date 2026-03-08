import { getCompanyIdFromRequest } from "@/lib/auth/get-company";
import { requirePermission } from "@/lib/auth/get-profile";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { createClient } from "@/lib/supabase/server";
import { deleteMessage as uazapiDeleteMessage } from "@/lib/uazapi/client";
import { getChannelToken } from "@/lib/uazapi/channel-token";
import { invalidateConversationDetail } from "@/lib/redis/inbox-state";
import { NextResponse } from "next/server";

/**
 * POST /api/conversations/[id]/messages/[messageId]/delete
 * Body: { forEveryone?: boolean }
 * - forEveryone false ou omitido: apaga só no nosso banco (para mim).
 * - forEveryone true: revoga no WhatsApp (para todos) e apaga no banco.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string; messageId: string }> }
) {
  const companyId = await getCompanyIdFromRequest(request);
  if (!companyId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const err = await requirePermission(companyId, PERMISSIONS.inbox.read);
  if (err) {
    return NextResponse.json({ error: err.error }, { status: err.status });
  }
  const { id: conversationId, messageId } = await params;
  let body: { forEveryone?: boolean } = {};
  try {
    body = await request.json();
  } catch {
    // body opcional
  }
  const forEveryone = body.forEveryone === true;

  const supabase = await createClient();
  const { data: message, error: msgError } = await supabase
    .from("messages")
    .select("id, external_id, conversation_id")
    .eq("id", messageId)
    .eq("conversation_id", conversationId)
    .single();

  if (msgError || !message) {
    return NextResponse.json({ error: "Message not found" }, { status: 404 });
  }

  const { data: conversation, error: convError } = await supabase
    .from("conversations")
    .select("id, company_id, channel_id")
    .eq("id", conversationId)
    .eq("company_id", companyId)
    .single();

  if (convError || !conversation) {
    return NextResponse.json({ error: "Conversation not found" }, { status: 404 });
  }

  if (forEveryone) {
    const resolved = await getChannelToken(conversation.channel_id, companyId);
    if (!resolved) {
      return NextResponse.json(
        { error: "Channel or token not configured" },
        { status: 400 }
      );
    }
    const externalId = (message as { external_id?: string }).external_id?.trim();
    if (externalId) {
      const result = await uazapiDeleteMessage(resolved.token, externalId);
      if (!result.ok) {
        return NextResponse.json(
          { error: "Falha ao apagar no WhatsApp", details: result.error },
          { status: 502 }
        );
      }
    }
  }

  const { error: deleteError } = await supabase
    .from("messages")
    .delete()
    .eq("id", messageId)
    .eq("conversation_id", conversationId);

  if (deleteError) {
    return NextResponse.json(
      { error: "Falha ao apagar mensagem no banco", details: deleteError.message },
      { status: 500 }
    );
  }

  // Atualizar messages_snapshot na conversa para remover a mensagem (GET usa o snapshot).
  const { data: convRow } = await supabase
    .from("conversations")
    .select("messages_snapshot")
    .eq("id", conversationId)
    .eq("company_id", companyId)
    .single();

  const snapshot = (convRow as { messages_snapshot?: unknown[] } | null)?.messages_snapshot;
  if (Array.isArray(snapshot) && snapshot.length > 0) {
    const filtered = snapshot.filter((msg: unknown) => String((msg as { id?: string })?.id) !== String(messageId));
    await supabase
      .from("conversations")
      .update({ messages_snapshot: filtered, updated_at: new Date().toISOString() })
      .eq("id", conversationId)
      .eq("company_id", companyId);
  }

  await invalidateConversationDetail(conversationId);

  return NextResponse.json({ ok: true, forEveryone });
}
