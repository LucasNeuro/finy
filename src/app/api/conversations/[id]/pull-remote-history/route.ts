import { getCompanyIdFromRequest } from "@/lib/auth/get-company";
import { requirePermission } from "@/lib/auth/get-profile";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { insertHistoryMessagesFromUazapiForConversation } from "@/lib/conversations/insert-remote-chat-messages";
import { invalidateConversationDetail, invalidateConversationList } from "@/lib/redis/inbox-state";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { getChannelToken } from "@/lib/uazapi/channel-token";
import { NextResponse } from "next/server";

export const maxDuration = 300;

/** Quantas passadas completas em /message/find por clique em "Carregar mais" (cada uma até `max_messages`). */
const MAX_SYNC_ROUNDS = 24;

/**
 * POST /api/conversations/[id]/pull-remote-history
 * Body opcional: { "max_messages": number, "skip_media": true } — skip_media importa só texto (como o sync em massa).
 * Busca mensagens antigas desta conversa na UAZAPI, grava no Postgres e invalida
 * cache Redis do detalhe + snapshot local (para o GET não servir lista antiga).
 * Repete em rodadas até não inserir mais nada (histórico completo disponível na instância),
 * com teto de segurança MAX_SYNC_ROUNDS.
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

  let body: { max_messages?: number; skip_media?: boolean } = {};
  try {
    body = (await request.json()) as { max_messages?: number; skip_media?: boolean };
  } catch {
    body = {};
  }
  const rawMax = Number(body.max_messages);
  const maxMessages =
    Number.isFinite(rawMax) && rawMax > 0 ? Math.min(Math.floor(rawMax), 8000) : 4000;
  const skipMedia = body.skip_media === true;

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
  let chatKey = waChatid;
  let totalInserted = 0;
  let jidWasCorrected = false;
  let lastWarning: string | undefined;

  for (let round = 0; round < MAX_SYNC_ROUNDS; round++) {
    const { inserted, uazapiError, resolvedChatJid } = await insertHistoryMessagesFromUazapiForConversation(
      supabase,
      resolved.token,
      conversationId,
      chatKey,
      maxMessages,
      skipMedia ? { skipMedia: true } : undefined
    );

    if (resolvedChatJid?.trim()) {
      const prev = chatKey.trim().toLowerCase();
      const next = resolvedChatJid.trim();
      if (next.toLowerCase() !== prev) {
        await supabase
          .from("conversations")
          .update({
            wa_chat_jid: next,
            external_id: next,
            updated_at: new Date().toISOString(),
          })
          .eq("id", conversationId)
          .eq("company_id", companyId);
        chatKey = next;
        jidWasCorrected = true;
      }
    }

    if (uazapiError) {
      lastWarning = uazapiError;
      if (inserted === 0) {
        if (totalInserted === 0) {
          return NextResponse.json({ ok: false, inserted: 0, error: uazapiError }, { status: 502 });
        }
        break;
      }
    }

    totalInserted += inserted;
    if (inserted === 0) {
      break;
    }
  }

  if (totalInserted > 0) {
    await supabase
      .from("conversations")
      .update({ messages_snapshot: null, updated_at: new Date().toISOString() })
      .eq("id", conversationId)
      .eq("company_id", companyId);
  }

  if (totalInserted > 0 || jidWasCorrected) {
    await invalidateConversationDetail(conversationId, companyId);
    await invalidateConversationList(companyId);
  }

  return NextResponse.json({
    ok: true,
    inserted: totalInserted,
    jid_corrected: jidWasCorrected || undefined,
    warning: lastWarning && totalInserted > 0 ? lastWarning : undefined,
  });
}
