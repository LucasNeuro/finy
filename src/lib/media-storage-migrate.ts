import type { SupabaseClient } from "@supabase/supabase-js";
import { messageDownload } from "@/lib/uazapi/client";

const BUCKET = "whatsapp-media";

const MIME_TO_EXT: Record<string, string> = {
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

export type MigrateOneMessageParams = {
  messageId: string;
  conversationId: string;
  companyId: string;
  channelToken: string;
  externalId: string;
  messageType: string;
  fileName?: string | null;
};

/**
 * Baixa a mídia da UAZAPI, envia para o bucket whatsapp-media e atualiza
 * messages.media_storage_path. Usado pelo endpoint /download e pelo backfill.
 */
export async function migrateOneMessageToStorage(
  serviceSupabase: SupabaseClient,
  params: MigrateOneMessageParams
): Promise<{ ok: true } | { ok: false; error: string }> {
  const {
    messageId,
    conversationId,
    companyId,
    channelToken,
    externalId,
    messageType,
    fileName,
  } = params;

  const type = (messageType ?? "").toLowerCase();
  const isAudio = ["audio", "ptt", "myaudio"].includes(type);

  const result = await messageDownload(channelToken, externalId, {
    return_link: true,
    return_base64: false,
    generate_mp3: isAudio,
  });

  if (!result.ok) {
    return { ok: false, error: result.error ?? "UAZAPI download failed" };
  }

  const fileURL = result.data?.fileURL;
  const mimetype = result.data?.mimetype ?? null;
  if (!fileURL) {
    return { ok: false, error: "UAZAPI did not return file URL" };
  }

  const fileRes = await fetch(fileURL);
  if (!fileRes.ok) {
    return {
      ok: false,
      error: `Failed to fetch media: ${fileRes.status}`,
    };
  }
  const buffer = await fileRes.arrayBuffer();

  const lowerUrl = fileURL.toLowerCase();
  const name = (fileName ?? "").toLowerCase();
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
    return MIME_TO_EXT[mimetype] ?? "";
  };

  let ext = guessExtFromName() || guessExtFromUrl() || guessExtFromMime();
  if (!ext) {
    if (isAudio) ext = ".mp3";
    else if (type === "video" || type === "ptv") ext = ".mp4";
    else ext = ".bin";
  }

  const objectPath = `${companyId}/${conversationId}/${messageId}${ext}`;

  const { error: uploadError } = await serviceSupabase.storage
    .from(BUCKET)
    .upload(objectPath, buffer, {
      contentType: mimetype ?? undefined,
      upsert: true,
    });

  if (uploadError) {
    return {
      ok: false,
      error: `Upload failed: ${uploadError.message}`,
    };
  }

  const { error: updateError } = await serviceSupabase
    .from("messages")
    .update({ media_storage_path: objectPath })
    .eq("id", messageId)
    .eq("conversation_id", conversationId);

  if (updateError) {
    return {
      ok: false,
      error: `Update message failed: ${updateError.message}`,
    };
  }

  return { ok: true };
}
