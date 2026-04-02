import { findChats, findMessages, type UazapiMessage } from "@/lib/uazapi/client";
import type { SupabaseClient } from "@supabase/supabase-js";
import { uazapiMessageBelongsToChat } from "@/lib/conversations/uazapi-message-belongs-to-chat";
import { normalizeWhatsAppJid, phoneDigitsOnly, toCanonicalJid } from "@/lib/phone-canonical";

/**
 * O JID salvo na conversa (@s.whatsapp.net) pode divergir do que a UAZ usa (@lid ou outro).
 * Resolve o wa_chatid que realmente responde em /message/find.
 */
async function resolveChatidForUazMessageFind(token: string, canonicalWa: string): Promise<string> {
  const probe = await findMessages(token, canonicalWa, { limit: 1, offset: 0 });
  if (probe.ok && (probe.data?.messages?.length ?? 0) > 0) return canonicalWa;

  if (canonicalWa.toLowerCase().endsWith("@g.us")) return canonicalWa;
  if (!probe.ok && probe.status === 401) return canonicalWa;

  const digits = phoneDigitsOnly(canonicalWa);
  if (digits.length < 10) return canonicalWa;

  const chatsRes = await findChats(token, {
    limit: 40,
    offset: 0,
    sort: "-wa_lastMsgTimestamp",
    wa_chatid: digits,
  });
  if (!chatsRes.ok || !chatsRes.data?.chats?.length) return canonicalWa;

  const target = canonicalWa.toLowerCase();
  for (const c of chatsRes.data.chats) {
    const wc = String(c.wa_chatid ?? "").trim();
    if (!wc) continue;
    if (wc.toLowerCase() === target) return wc;
    if (phoneDigitsOnly(wc) === digits) return wc;
  }
  const first = String(chatsRes.data.chats[0]?.wa_chatid ?? "").trim();
  return first || canonicalWa;
}

const MESSAGES_PAGE_SIZE = 100;
const MESSAGE_INSERT_BATCH = 40;
/** Limite de páginas /message/find por conversa (evita loop se a API repetir resultados). */
const MAX_MESSAGE_FIND_PAGES = 80;

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
): Promise<{ inserted: number; uazapiError?: string; resolvedChatJid?: string }> {
  const rawWa = waChatid.trim();
  if (!rawWa) return { inserted: 0, uazapiError: "JID do chat inválido" };
  const isGroup = rawWa.toLowerCase().endsWith("@g.us");
  const wa = isGroup
    ? toCanonicalJid(rawWa, true)
    : rawWa.includes("@")
      ? normalizeWhatsAppJid(rawWa)
      : toCanonicalJid(rawWa, false);
  if (!wa) return { inserted: 0, uazapiError: "JID do chat inválido" };

  const chatidForFind = await resolveChatidForUazMessageFind(token, wa);

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

  let pagesFetched = 0;
  while (chatMessagesInserted < cap && pagesFetched < MAX_MESSAGE_FIND_PAGES) {
    pagesFetched += 1;
    const { data: msgData, ok: msgOk, error: pageErr } = await findMessages(token, chatidForFind, {
      limit: MESSAGES_PAGE_SIZE,
      offset: msgOffset,
    });
    if (!msgOk) {
      return { inserted: chatMessagesInserted, uazapiError: pageErr ?? "Falha ao buscar mensagens na UAZAPI" };
    }

    const rawNext =
      msgData && typeof msgData.nextOffset === "number" && Number.isFinite(msgData.nextOffset)
        ? msgData.nextOffset
        : undefined;
    const explicitNoMore = msgData?.hasMore === false;

    const messages = (msgData?.messages ?? []) as UazapiMessage[];
    if (messages.length === 0) {
      if (typeof rawNext === "number" && rawNext > msgOffset) {
        msgOffset = rawNext;
        continue;
      }
      break;
    }

    for (const msg of messages) {
      if (chatMessagesInserted >= cap) break;
      if (!uazapiMessageBelongsToChat(msg, chatidForFind) && !uazapiMessageBelongsToChat(msg, wa)) continue;

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

    if (typeof rawNext === "number" && rawNext > msgOffset) {
      msgOffset = rawNext;
    } else if (explicitNoMore) {
      break;
    } else {
      msgOffset += MESSAGES_PAGE_SIZE;
    }
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

  const resolvedChatJid =
    chatidForFind.trim().toLowerCase() !== wa.trim().toLowerCase() ? chatidForFind : undefined;

  return { inserted: chatMessagesInserted, resolvedChatJid };
}
