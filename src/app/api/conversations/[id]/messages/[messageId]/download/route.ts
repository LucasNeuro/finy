import { getCompanyIdFromRequest } from "@/lib/auth/get-company";
import { requirePermission } from "@/lib/auth/get-profile";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { messageDownload } from "@/lib/uazapi/client";
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

  // Caso não tenha no bucket ainda, baixa da UAZAPI e sobe para o storage.
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

  const type = (message.message_type || "").toLowerCase();
  const isAudio = ["audio", "ptt", "myaudio"].includes(type);
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
  const mimetype = result.data?.mimetype ?? null;
  if (!fileURL) {
    return NextResponse.json(
      { error: "UAZAPI did not return file URL" },
      { status: 502 }
    );
  }

  // Baixar o arquivo da URL retornada pela UAZAPI
  const fileRes = await fetch(fileURL);
  if (!fileRes.ok) {
    return NextResponse.json(
      { error: "Failed to fetch media from UAZAPI", status: fileRes.status },
      { status: 502 }
    );
  }
  const buffer = await fileRes.arrayBuffer();

  // Determinar extensão do arquivo
  const lowerUrl = fileURL.toLowerCase();
  const name = (message.file_name ?? "").toLowerCase();
  const guessExtFromName = () => {
    const m = name.match(/\.([a-z0-9]+)(\?|$)/i);
    return m ? `.${m[1]}` : "";
  };
  const guessExtFromUrl = () => {
    const m = lowerUrl.match(/\.([a-z0-9]+)(\?|$)/i);
    return m ? `.${m[1]}` : "";
  };
  const guessExtFromMime = () => {
    if (!mimetype) return "";
    const map: Record<string, string> = {
      "audio/ogg": ".ogg",
      "audio/opus": ".ogg",
      "audio/mpeg": ".mp3",
      "audio/mp3": ".mp3",
      "audio/x-m4a": ".m4a",
      "audio/aac": ".aac",
      "video/mp4": ".mp4",
      "video/webm": ".webm",
      "image/jpeg": ".jpg",
      "image/png": ".png",
      "application/pdf": ".pdf",
    };
    return map[mimetype] ?? "";
  };

  let ext = guessExtFromName() || guessExtFromUrl() || guessExtFromMime();
  if (!ext) {
    if (isAudio) ext = ".mp3";
    else if (type === "video" || type === "ptv") ext = ".mp4";
    else ext = ".bin";
  }

  const objectPath = `${companyId}/${conversationId}/${messageId}${ext}`;

  const { error: uploadError } = await serviceSupabase.storage
    .from(bucket)
    .upload(objectPath, buffer, {
      contentType: mimetype ?? undefined,
      upsert: true,
    });

  if (uploadError) {
    return NextResponse.json(
      { error: "Failed to upload media to storage", details: uploadError.message },
      { status: 500 }
    );
  }

  // Atualizar mensagem com o path no storage
  await serviceSupabase
    .from("messages")
    .update({ media_storage_path: objectPath })
    .eq("id", messageId)
    .eq("conversation_id", conversationId);

  const { data: signed, error: signedError } = await serviceSupabase.storage
    .from(bucket)
    .createSignedUrl(objectPath, 60 * 60);

  if (signedError || !signed?.signedUrl) {
    return NextResponse.json(
      { error: "Failed to generate media URL from storage" },
      { status: 500 }
    );
  }

  return NextResponse.json({
    fileURL: signed.signedUrl,
    mimetype,
  });
}
