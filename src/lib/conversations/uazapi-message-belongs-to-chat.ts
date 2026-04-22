import type { UazapiMessage } from "@/lib/uazapi/client";
import { toCanonicalJid } from "@/lib/phone-canonical";

/**
 * Garante que uma mensagem devolvida por /message/find pertence ao chat pedido.
 * Se a API misturar páginas ou chatid, evitamos gravar em conversation_id errado.
 */
export function uazapiMessageBelongsToChat(msg: UazapiMessage, waChatid: string): boolean {
  const wa = (waChatid ?? "").trim();
  if (!wa) return false;
  const isGroup = wa.toLowerCase().endsWith("@g.us");
  const expected = toCanonicalJid(wa, isGroup).toLowerCase();
  const msgRec = msg as Record<string, unknown>;
  const keyObj = msgRec.key && typeof msgRec.key === "object" ? (msgRec.key as Record<string, unknown>) : null;
  const chatObj = msgRec.chat && typeof msgRec.chat === "object" ? (msgRec.chat as Record<string, unknown>) : null;
  const raw = (
    (typeof msg.chatid === "string" && msg.chatid.trim()) ||
    (typeof (msg as { chatId?: string }).chatId === "string" && String((msg as { chatId: string }).chatId).trim()) ||
    (typeof msgRec.wa_chatid === "string" && String(msgRec.wa_chatid).trim()) ||
    (typeof msgRec.remoteJid === "string" && String(msgRec.remoteJid).trim()) ||
    (typeof keyObj?.remoteJid === "string" && String(keyObj.remoteJid).trim()) ||
    (typeof chatObj?.id === "string" && String(chatObj.id).trim()) ||
    ""
  ).trim();
  // Sem identificador de chat confiável, melhor descartar do que contaminar outra conversa.
  if (!raw) return false;
  const got = toCanonicalJid(raw, isGroup).toLowerCase();
  if (got === expected) return true;
  if (!isGroup) {
    const ed = expected.replace(/@.*$/, "").replace(/\D/g, "");
    const gd = got.replace(/@.*$/, "").replace(/\D/g, "");
    // Comparação estrita por dígitos para evitar match cruzado entre contatos.
    if (ed.length >= 10 && gd.length >= 10 && ed === gd) return true;
  }
  return false;
}
