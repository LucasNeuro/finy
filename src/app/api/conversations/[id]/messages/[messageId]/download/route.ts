import { getCompanyIdFromRequest } from "@/lib/auth/get-company";
import { requirePermission } from "@/lib/auth/get-profile";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { createClient } from "@/lib/supabase/server";
import { messageDownload } from "@/lib/uazapi/client";
import { getChannelToken } from "@/lib/uazapi/channel-token";
import { NextResponse } from "next/server";

/**
 * GET /api/conversations/[id]/messages/[messageId]/download
 * Obtém URL (ou dados) da mídia de uma mensagem via UAZAPI /message/download.
 * Útil para áudio (reproduzir), documento/imagem (botão Baixar) quando media_url não é link direto.
 */
export async function GET(
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
  if (!conversationId || !messageId) {
    return NextResponse.json({ error: "conversation and message required" }, { status: 400 });
  }

  const supabase = await createClient();
  const { data: message, error: msgError } = await supabase
    .from("messages")
    .select("id, external_id, conversation_id, message_type")
    .eq("id", messageId)
    .eq("conversation_id", conversationId)
    .single();

  if (msgError || !message) {
    return NextResponse.json({ error: "Message not found" }, { status: 404 });
  }

  const { data: conversation, error: convError } = await supabase
    .from("conversations")
    .select("id, channel_id")
    .eq("id", conversationId)
    .eq("company_id", companyId)
    .single();

  if (convError || !conversation) {
    return NextResponse.json({ error: "Conversation not found" }, { status: 404 });
  }

  const resolved = await getChannelToken(conversation.channel_id, companyId);
  if (!resolved) {
    return NextResponse.json({ error: "Channel or token not configured" }, { status: 400 });
  }

  const externalId = message.external_id?.trim();
  if (!externalId) {
    return NextResponse.json(
      { error: "Message has no external id (cannot download from UAZAPI)" },
      { status: 400 }
    );
  }

  const isAudio = ["audio", "ptt", "myaudio"].includes((message.message_type || "").toLowerCase());
  const result = await messageDownload(resolved.token, externalId, {
    return_link: true,
    return_base64: false,
    generate_mp3: isAudio,
  });

  if (!result.ok) {
    return NextResponse.json(
      { error: "Download failed", details: result.error },
      { status: 502 }
    );
  }

  const fileURL = result.data?.fileURL;
  if (!fileURL) {
    return NextResponse.json(
      { error: "UAZAPI did not return file URL" },
      { status: 502 }
    );
  }

  return NextResponse.json({
    fileURL,
    mimetype: result.data?.mimetype ?? null,
  });
}
