import { findChats, findMessages, type UazapiMessage } from "@/lib/uazapi/client";
import { uazFindMessageSentAtIso } from "@/lib/uazapi/message-timestamp";
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
    limit: 120,
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
/** Limite total de páginas /message/find por requisição (vários JIDs somam neste teto). */
const MAX_MESSAGE_FIND_PAGES = 100;

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

/** No sync em massa: não importa mídia; só conta mensagens de texto para o limite N. */
function shouldSkipMediaOnlyHistoryImport(
  messageType: string,
  msgMediaUrl: string
): boolean {
  const t = messageType;
  if (["image", "video", "document", "audio", "ptt", "sticker", "ptv"].includes(t)) return true;
  if (msgMediaUrl.trim() && t === "text") return true;
  return false;
}

function uniqueChatIdsForFind(resolved: string, canonical: string): string[] {
  const out: string[] = [];
  for (const c of [resolved, canonical]) {
    const t = (c ?? "").trim();
    if (!t) continue;
    if (!out.some((x) => x.toLowerCase() === t.toLowerCase())) out.push(t);
  }
  return out;
}

/**
 * Busca mensagens na UAZAPI para um único chat e insere na tabela `messages`
 * (apenas linhas que ainda não existem, por external_id / sent_at).
 */
export async function insertHistoryMessagesFromUazapiForConversation(
  supabase: SupabaseClient,
  token: string,
  conversationId: string,
  waChatid: string,
  maxNewMessages: number,
  options?: { skipMedia?: boolean }
): Promise<{ inserted: number; uazapiError?: string; resolvedChatJid?: string }> {
  const skipMedia = options?.skipMedia === true;
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

  /** Com skipMedia, o teto é de mensagens de texto inseridas; sem skip, inclui mídia. */
  const cap = Math.min(Math.max(maxNewMessages, 1), 8000);

  const { data: existMsgRows } = await supabase
    .from("messages")
    .select("external_id, sent_at, direction, content")
    .eq("conversation_id", conversationId)
    .limit(50_000);

  const seenExt = new Set<string>();
  /** Sem external_id, só sent_at duplicava mensagens diferentes no mesmo segundo. */
  const seenNoExtKey = new Set<string>();
  for (const r of existMsgRows ?? []) {
    const row = r as {
      external_id?: string | null;
      sent_at?: string | null;
      direction?: string | null;
      content?: string | null;
    };
    if (row.external_id) seenExt.add(row.external_id);
    else if (row.sent_at) {
      const dir = row.direction === "out" ? "o" : "i";
      const c = String(row.content ?? "").slice(0, 160);
      seenNoExtKey.add(`${row.sent_at}|${dir}|${c}`);
    }
  }

  let latestSentAt = 0;
  let chatMessagesInserted = 0;
  const pendingInserts: Record<string, unknown>[] = [];
  /** Quando a UAZ não manda timestamp, evita usar todos "agora" (quebra ordem no chat). Presume lista newest-first e afasta 1 ms por mensagem. */
  let syntheticNoTsCounter = 0;

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

  let globalPagesFetched = 0;
  const chatIdsToTry = uniqueChatIdsForFind(chatidForFind, wa);
  let lastPageErr: string | undefined;
  let discardedByChatMismatch = 0;

  for (const activeChatId of chatIdsToTry) {
    if (chatMessagesInserted >= cap || globalPagesFetched >= MAX_MESSAGE_FIND_PAGES) break;

    let msgOffset = 0;
    while (chatMessagesInserted < cap && globalPagesFetched < MAX_MESSAGE_FIND_PAGES) {
      globalPagesFetched += 1;
      const { data: msgData, ok: msgOk, error: pageErr } = await findMessages(token, activeChatId, {
        limit: MESSAGES_PAGE_SIZE,
        offset: msgOffset,
      });
      if (!msgOk) {
        lastPageErr = pageErr ?? "Falha ao buscar mensagens na UAZAPI";
        break;
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
        if (!uazapiMessageBelongsToChat(msg, activeChatId) && !uazapiMessageBelongsToChat(msg, wa)) {
          discardedByChatMismatch += 1;
          continue;
        }

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
        if (skipMedia && shouldSkipMediaOnlyHistoryImport(messageType, String(msgMediaUrl ?? ""))) {
          continue;
        }
        const content = bodyText || (isMedia ? `[${messageType}]` : "");
        const msgRec = msg as Record<string, unknown>;
        const parsedIso = uazFindMessageSentAtIso(msgRec);
        let sentAt: string;
        let fromRealTimestamp = false;
        if (parsedIso) {
          sentAt = parsedIso;
          fromRealTimestamp = true;
        } else {
          syntheticNoTsCounter += 1;
          sentAt = new Date(Date.now() - syntheticNoTsCounter).toISOString();
        }
        if (fromRealTimestamp) {
          const ms = new Date(sentAt).getTime();
          if (ms > latestSentAt) latestSentAt = ms;
        }
        const extId = (msg.id ?? "").toString() || null;

        if (extId) {
          if (seenExt.has(extId)) continue;
        } else {
          const dir = fromMe ? "o" : "i";
          const noExtKey = `${sentAt}|${dir}|${content.slice(0, 160)}`;
          if (seenNoExtKey.has(noExtKey)) continue;
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
        else {
          const dir = fromMe ? "o" : "i";
          seenNoExtKey.add(`${sentAt}|${dir}|${content.slice(0, 160)}`);
        }

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
  }

  await flushMessages();

  if (discardedByChatMismatch > 0) {
    console.warn("[SYNC][message/find] Mensagens descartadas por chat divergente", {
      conversationId,
      waChatid: wa,
      discardedByChatMismatch,
    });
  }

  if (chatMessagesInserted === 0 && lastPageErr) {
    return { inserted: 0, uazapiError: lastPageErr };
  }

  // Histórico antigo não pode retroceder last_message_at da conversa (senão a inbox “volta no tempo”).
  if (latestSentAt > 0 && chatMessagesInserted > 0) {
    const { data: convRow } = await supabase
      .from("conversations")
      .select("last_message_at")
      .eq("id", conversationId)
      .maybeSingle();
    const currentLast = convRow?.last_message_at
      ? new Date(String((convRow as { last_message_at: string }).last_message_at)).getTime()
      : 0;
    if (latestSentAt > currentLast) {
      await supabase
        .from("conversations")
        .update({
          last_message_at: new Date(latestSentAt).toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", conversationId);
    }
  }

  const resolvedChatJid =
    chatidForFind.trim().toLowerCase() !== wa.trim().toLowerCase() ? chatidForFind : undefined;

  return { inserted: chatMessagesInserted, resolvedChatJid };
}
