import type { SupabaseClient } from "@supabase/supabase-js";

import { invalidateConversationDetail, invalidateConversationList } from "@/lib/redis/inbox-state";

/**
 * Remove linhas duplicadas de mensagem com o mesmo external_id (ex.: mesmo WA message id
 * após unir dois tickets que tinham cópias do mesmo histórico).
 */
export async function dedupeMessagesByExternalId(
  supabase: SupabaseClient,
  conversationId: string
): Promise<number> {
  const { data: rows, error } = await supabase
    .from("messages")
    .select("id, external_id")
    .eq("conversation_id", conversationId)
    .not("external_id", "is", null);

  if (error || !rows?.length) return 0;

  const byExt = new Map<string, string[]>();
  for (const row of rows) {
    const ext = String(row.external_id ?? "").trim();
    if (!ext) continue;
    if (!byExt.has(ext)) byExt.set(ext, []);
    byExt.get(ext)!.push(row.id as string);
  }

  const toDelete: string[] = [];
  for (const ids of byExt.values()) {
    if (ids.length <= 1) continue;
    const sorted = [...ids].sort();
    toDelete.push(...sorted.slice(1));
  }

  const chunk = 500;
  for (let i = 0; i < toDelete.length; i += chunk) {
    const slice = toDelete.slice(i, i + chunk);
    const { error: delErr } = await supabase.from("messages").delete().in("id", slice);
    if (delErr) throw new Error(delErr.message);
  }

  return toDelete.length;
}

async function refreshLastMessageAt(
  supabase: SupabaseClient,
  keepId: string,
  companyId: string
): Promise<void> {
  const { data: last } = await supabase
    .from("messages")
    .select("sent_at")
    .eq("conversation_id", keepId)
    .order("sent_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(1)
    .maybeSingle();

  const sentAt = last?.sent_at as string | undefined;
  if (!sentAt) return;

  await supabase
    .from("conversations")
    .update({
      last_message_at: sentAt,
      updated_at: new Date().toISOString(),
    })
    .eq("id", keepId)
    .eq("company_id", companyId);
}

export type MergeConversationsIntoParams = {
  supabase: SupabaseClient;
  keepId: string;
  dropId: string;
  companyId: string;
  /** Se false, o caller invalida cache depois (ex.: vários drops em sequência). Default true. */
  invalidateCaches?: boolean;
};

/**
 * Move mensagens e dados ligados de `dropId` para `keepId` e remove o ticket duplicado.
 * Usado pelo webhook (mesmo número canônico) e por API admin quando dois tickets
 * são o mesmo fio no WhatsApp mas com identificadores diferentes no banco.
 */
export async function mergeConversationsInto(params: MergeConversationsIntoParams): Promise<void> {
  const { supabase, keepId, dropId, companyId } = params;
  const invalidateCaches = params.invalidateCaches !== false;

  if (keepId === dropId) return;

  const { data: convs, error: loadErr } = await supabase
    .from("conversations")
    .select("id, company_id, channel_id")
    .in("id", [keepId, dropId])
    .eq("company_id", companyId);

  if (loadErr) throw new Error(loadErr.message);
  const list = convs ?? [];
  if (list.length !== 2) {
    throw new Error("merge: conversas não encontradas ou empresa incorreta");
  }
  const a = list.find((c) => c.id === keepId);
  const b = list.find((c) => c.id === dropId);
  if (!a || !b) {
    throw new Error("merge: ids inválidos");
  }
  if (a.channel_id !== b.channel_id) {
    throw new Error("merge: canal diferente — recuse por segurança");
  }

  await invalidateConversationDetail(dropId, companyId);

  const { error: msgErr } = await supabase
    .from("messages")
    .update({ conversation_id: keepId })
    .eq("conversation_id", dropId);
  if (msgErr) throw new Error(msgErr.message);

  const { error: notesErr } = await supabase
    .from("internal_notes")
    .update({ conversation_id: keepId })
    .eq("conversation_id", dropId);
  if (notesErr) throw new Error(notesErr.message);

  const { error: notifErr } = await supabase
    .from("notifications")
    .update({ conversation_id: keepId })
    .eq("conversation_id", dropId)
    .eq("company_id", companyId);
  if (notifErr) throw new Error(notifErr.message);

  const { error: histErr } = await supabase
    .from("conversation_status_history")
    .update({ conversation_id: keepId })
    .eq("conversation_id", dropId);
  if (histErr) throw new Error(histErr.message);

  await supabase.from("conversation_form_answers").delete().eq("conversation_id", dropId);
  await supabase.from("conversation_custom_fields").delete().eq("conversation_id", dropId);
  await supabase.from("conversation_tags").delete().eq("conversation_id", dropId);
  await supabase.from("conversation_ratings").delete().eq("conversation_id", dropId);

  const { error: delErr } = await supabase
    .from("conversations")
    .delete()
    .eq("id", dropId)
    .eq("company_id", companyId);
  if (delErr) throw new Error(delErr.message);

  await dedupeMessagesByExternalId(supabase, keepId);
  await refreshLastMessageAt(supabase, keepId, companyId);

  if (invalidateCaches) {
    await invalidateConversationDetail(keepId, companyId);
    await invalidateConversationList(companyId);
  }
}
