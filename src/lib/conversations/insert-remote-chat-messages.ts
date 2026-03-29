import { findMessages, type UazapiMessage } from "@/lib/uazapi/client";
import type { SupabaseClient } from "@supabase/supabase-js";

const MESSAGES_PAGE_SIZE = 100;
const MESSAGE_INSERT_BATCH = 40;

const mediaTypeMap: Record<string, string> = {
  image: "image",
  video: "video",
  audio: "audio",
  myaudio: "audio",
  ptt: "ptt",
  ptv: "video",
  document: "document",
  sticker: "sticker",
};

/**
 * Busca mensagens na UAZAPI para um único chat e insere na tabela `messages`
 * (apenas linhas que ainda não existem, por external_id / sent_at).
 */
export async function insertHistoryMessagesFromUazapiForConversation(
  supabase: SupabaseClient,
  token: string,
  conversationId: string,
  waChatid: string,
  maxNewMessages: number
): Promise<{ inserted: number; uazapiError?: string }> {
  const wa = waChatid.trim();
  if (!wa) return { inserted: 0, uazapiError: "JID do chat inválido" };

  const cap = Math.min(Math.max(maxNewMessages, 1), 1000);

  const { data: existMsgRows } = await supabase
    .from("messages")
    .select("external_id, sent_at")
    .eq("conversation_id", conversationId)
    .limit(8000);

  const seenExt = new Set<string>();
  const seenSent = new Set<string>();
  for (const r of existMsgRows ?? []) {
    const row = r as { external_id?: string | null; sent_at?: string };
    if (row.external_id) seenExt.add(row.external_id);
    else if (row.sent_at) seenSent.add(row.sent_at);
  }

  let msgOffset = 0;
  let latestSentAt = 0;
  let chatMessagesInserted = 0;
  const pendingInserts: Record<string, unknown>[] = [];

  const flushMessages = async () => {
    if (pendingInserts.length === 0) return;
    const batch = pendingInserts.splice(0, pendingInserts.length);
    const { error: batchErr } = await supabase.from("messages").insert(batch);
    if (!batchErr) {
      chatMessagesInserted += batch.length;
      return;
    }
    for (const row of batch) {
      const { error: oneErr } = await supabase.from("messages").insert(row);
      if (!oneErr) chatMessagesInserted++;
    }
  };

  while (chatMessagesInserted < cap) {
    const { data: msgData, ok: msgOk, error: pageErr } = await findMessages(token, wa, {
      limit: MESSAGES_PAGE_SIZE,
      offset: msgOffset,
    });
    if (!msgOk) {
      return { inserted: chatMessagesInserted, uazapiError: pageErr ?? "Falha ao buscar mensagens na UAZAPI" };
    }

    const messages = (msgData?.messages ?? []) as UazapiMessage[];
    if (messages.length === 0) break;

    for (const msg of messages) {
      if (chatMessagesInserted >= cap) break;

      const fromMe = msg.fromMe === true;
      const bodyText = (msg.body ?? msg.text ?? "").toString().trim();
      const rawType = (msg.type ?? msg.mediaType ?? "") as string;
      const msgMediaUrl = (msg.mediaUrl ??
        msg.file ??
        msg.url ??
        msg.image ??
        msg.base64 ??
        (msg as { media?: { url?: string } }).media?.url ??
        "") as string;
      const msgCaption = (msg.caption ?? msg.body ?? msg.text ?? "").toString().trim();
      const msgFileName = (msg.fileName ?? msg.filename ?? msg.docName ?? "") as string;
      const messageType = rawType ? (mediaTypeMap[String(rawType).toLowerCase()] ?? "text") : "text";
      const isMedia = messageType !== "text" && msgMediaUrl;
      const content = bodyText || (isMedia ? `[${messageType}]` : "");
      const rawTs = msg.timestamp;
      const sentAt =
        rawTs != null && typeof rawTs === "number"
          ? new Date(rawTs * 1000).toISOString()
          : new Date().toISOString();
      if (typeof rawTs === "number" && rawTs * 1000 > latestSentAt) latestSentAt = rawTs * 1000;
      const extId = (msg.id ?? "").toString() || null;

      if (extId) {
        if (seenExt.has(extId)) continue;
      } else if (seenSent.has(sentAt)) {
        continue;
      }

      const insertPayload: Record<string, unknown> = {
        conversation_id: conversationId,
        direction: fromMe ? "out" : "in",
        content: content.slice(0, 10000),
        message_type: isMedia ? messageType : "text",
        external_id: extId,
        sent_at: sentAt,
      };
      if (isMedia && msgMediaUrl.trim()) insertPayload.media_url = msgMediaUrl.trim().slice(0, 10000);
      if (isMedia && msgCaption) insertPayload.caption = msgCaption.slice(0, 2000);
      if (msgFileName && typeof msgFileName === "string") insertPayload.file_name = msgFileName.slice(0, 255);

      pendingInserts.push(insertPayload);
      if (extId) seenExt.add(extId);
      else seenSent.add(sentAt);

      if (pendingInserts.length >= MESSAGE_INSERT_BATCH) await flushMessages();
    }

    await flushMessages();

    if (chatMessagesInserted >= cap) break;
    if (messages.length < MESSAGES_PAGE_SIZE) break;
    msgOffset += MESSAGES_PAGE_SIZE;
  }

  await flushMessages();

  if (latestSentAt > 0 && chatMessagesInserted > 0) {
    await supabase
      .from("conversations")
      .update({
        last_message_at: new Date(latestSentAt).toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", conversationId);
  }

  return { inserted: chatMessagesInserted };
}
