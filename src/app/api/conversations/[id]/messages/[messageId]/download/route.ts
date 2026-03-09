import { getCompanyIdFromRequest } from "@/lib/auth/get-company";
import { requirePermission } from "@/lib/auth/get-profile";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { migrateOneMessageToStorage } from "@/lib/media-storage-migrate";
import { getChannelToken } from "@/lib/uazapi/channel-token";
import { NextResponse } from "next/server";

/**
 * GET /api/conversations/[id]/messages/[messageId]/download
 *
 * Estratégia:
 * - Se a mensagem já tiver `media_storage_path`, gera uma signed URL do bucket whatsapp-media.
 * - Se não tiver, baixa da UAZAPI, envia para o bucket whatsapp-media (companyId/conversationId/messageId.ext),
 *   atualiza a mensagem com o path e então gera a signed URL.
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
    .select("id, external_id, conversation_id, message_type, media_storage_path, file_name")
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

  const serviceSupabase = createServiceRoleClient();
  const bucket = "whatsapp-media";

  // Se já temos path no bucket, só criar signed URL e retornar
  if (message.media_storage_path) {
    const { data: signed, error: signedError } = await serviceSupabase.storage
      .from(bucket)
      .createSignedUrl(message.media_storage_path, 60 * 60); // 1h

    if (signedError || !signed?.signedUrl) {
      return NextResponse.json(
        { error: "Failed to generate media URL from storage" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      fileURL: signed.signedUrl,
      mimetype: null,
    });
  }

  const resolved = await getChannelToken(conversation.channel_id, companyId);
  if (!resolved) {
    return NextResponse.json({ error: "Channel or token not configured" }, { status: 400 });
  }

  const externalId = (message.external_id ?? "").trim();
  if (!externalId) {
    return NextResponse.json(
      { error: "Message has no external id (cannot download from UAZAPI)" },
      { status: 400 }
    );
  }

  const migrate = await migrateOneMessageToStorage(serviceSupabase, {
    messageId,
    conversationId,
    companyId,
    channelToken: resolved.token,
    externalId,
    messageType: message.message_type ?? "document",
    fileName: message.file_name,
  });

  if (!migrate.ok) {
    return NextResponse.json(
      { error: "Migration failed", details: migrate.error },
      { status: 502 }
    );
  }

  const { data: updated } = await serviceSupabase
    .from("messages")
    .select("media_storage_path")
    .eq("id", messageId)
    .eq("conversation_id", conversationId)
    .single();
  const path = (updated as { media_storage_path?: string } | null)?.media_storage_path;
  if (!path) {
    return NextResponse.json(
      { error: "Storage path not set after migration" },
      { status: 500 }
    );
  }

  const { data: signed, error: signedError } = await serviceSupabase.storage
    .from(bucket)
    .createSignedUrl(path, 60 * 60);

  if (signedError || !signed?.signedUrl) {
    return NextResponse.json(
      { error: "Failed to generate media URL from storage" },
      { status: 500 }
    );
  }

  return NextResponse.json({
    fileURL: signed.signedUrl,
    mimetype: null,
  });
}
