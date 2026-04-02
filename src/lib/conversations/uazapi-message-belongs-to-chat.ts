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
  const raw = (
    (typeof msg.chatid === "string" && msg.chatid.trim()) ||
    (typeof (msg as { chatId?: string }).chatId === "string" && String((msg as { chatId: string }).chatId).trim()) ||
    ""
  ).trim();
  if (!raw) return true;
  const got = toCanonicalJid(raw, isGroup).toLowerCase();
  if (got === expected) return true;
  if (!isGroup) {
    const ed = expected.replace(/@.*$/, "").replace(/\D/g, "");
    const gd = got.replace(/@.*$/, "").replace(/\D/g, "");
    if (ed.length >= 10 && gd.length >= 10 && (ed === gd || ed.endsWith(gd) || gd.endsWith(ed))) return true;
  }
  return false;
}
