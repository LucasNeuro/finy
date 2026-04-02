import { getCompanyIdFromRequest } from "@/lib/auth/get-company";
import { requirePermission } from "@/lib/auth/get-profile";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { insertHistoryMessagesFromUazapiForConversation } from "@/lib/conversations/insert-remote-chat-messages";
import { invalidateConversationDetail, invalidateConversationList } from "@/lib/redis/inbox-state";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { getChannelToken } from "@/lib/uazapi/channel-token";
import { NextResponse } from "next/server";

export const maxDuration = 120;

/**
 * POST /api/conversations/[id]/pull-remote-history
 * Busca mensagens antigas desta conversa na UAZAPI, grava no Postgres e invalida
 * cache Redis do detalhe + snapshot local (para o GET não servir lista antiga).
 * Uso: botão "Carregar mensagens antigas" no chat quando não há mais páginas só no banco.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: conversationId } = await params;
  if (!conversationId) {
    return NextResponse.json({ error: "conversation id required" }, { status: 400 });
  }

  const companyId = await getCompanyIdFromRequest(request);
  if (!companyId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const readErr = await requirePermission(companyId, PERMISSIONS.inbox.read);
  if (readErr) {
    return NextResponse.json({ error: readErr.error }, { status: readErr.status });
  }

  let body: { max_messages?: number } = {};
  try {
    body = (await request.json()) as { max_messages?: number };
  } catch {
    body = {};
  }
  const rawMax = Number(body.max_messages);
  const maxMessages =
    Number.isFinite(rawMax) && rawMax > 0 ? Math.min(Math.floor(rawMax), 1000) : 500;

  const supabaseUser = await createClient();
  const { data: conversation, error: convError } = await supabaseUser
    .from("conversations")
    .select("id, channel_id, external_id, wa_chat_jid, company_id")
    .eq("id", conversationId)
    .eq("company_id", companyId)
    .single();

  if (convError || !conversation) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const channelId = conversation.channel_id as string;
  if (!channelId) {
    return NextResponse.json({ error: "Conversa sem canal" }, { status: 400 });
  }

  const waChatid = (
    (conversation.wa_chat_jid as string | null)?.trim() ||
    (conversation.external_id as string | null)?.trim() ||
    ""
  ).toString();
  if (!waChatid) {
    return NextResponse.json({ error: "Sem JID do chat para sincronizar" }, { status: 400 });
  }

  const resolved = await getChannelToken(channelId, companyId);
  if (!resolved) {
    return NextResponse.json({ error: "Canal não encontrado" }, { status: 404 });
  }

  const supabase = createServiceRoleClient();
  const { inserted, uazapiError, resolvedChatJid } = await insertHistoryMessagesFromUazapiForConversation(
    supabase,
    resolved.token,
    conversationId,
    waChatid,
    maxMessages
  );

  if (uazapiError && inserted === 0) {
    return NextResponse.json({ ok: false, inserted: 0, error: uazapiError }, { status: 502 });
  }

  if (resolvedChatJid?.trim()) {
    const prev = waChatid.trim().toLowerCase();
    if (resolvedChatJid.trim().toLowerCase() !== prev) {
      await supabase
        .from("conversations")
        .update({
          wa_chat_jid: resolvedChatJid.trim(),
          external_id: resolvedChatJid.trim(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", conversationId)
        .eq("company_id", companyId);
    }
  }

  const jidWasCorrected =
    !!resolvedChatJid?.trim() &&
    resolvedChatJid.trim().toLowerCase() !== waChatid.trim().toLowerCase();

  if (inserted > 0) {
    await supabase
      .from("conversations")
      .update({ messages_snapshot: null, updated_at: new Date().toISOString() })
      .eq("id", conversationId)
      .eq("company_id", companyId);
  }

  if (inserted > 0 || jidWasCorrected) {
    await invalidateConversationDetail(conversationId, companyId);
    await invalidateConversationList(companyId);
  }

  return NextResponse.json({
    ok: true,
    inserted,
    jid_corrected: jidWasCorrected || undefined,
    warning: uazapiError && inserted > 0 ? uazapiError : undefined,
  });
}
