import { getCompanyIdFromRequest } from "@/lib/auth/get-company";
import { requirePermission } from "@/lib/auth/get-profile";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { runSyncChannelHistory } from "@/lib/channels/run-sync-channel-history";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { getChannelToken } from "@/lib/uazapi/channel-token";
import { NextResponse } from "next/server";

/** Vercel / plataformas com limite — sync pode levar vários minutos. */
export const maxDuration = 300;

/**
 * POST /api/channels/[id]/sync-history
 * Sincroniza histórico de mensagens via UAZAPI (lista de chats e mensagens por chat).
 * Por padrão só preenche conversas que já existem. Com body { create_missing: true } ou
 * ?create_missing=1, cria conversa/contato faltante e importa até messages_per_chat (default alto, max 8000).
 * Auth: usuário com channels.manage, ou chamada interna com X-Internal-Sync-Secret (cron / integrações externas).
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: channelId } = await params;
  if (!channelId) {
    return NextResponse.json({ error: "channel id required" }, { status: 400 });
  }

  const internalSecret = request.headers.get("X-Internal-Sync-Secret");
  const expectedSecret = process.env.INTERNAL_SYNC_SECRET;
  const isInternalCall = Boolean(expectedSecret && internalSecret === expectedSecret);

  let companyId: string | null = null;

  if (isInternalCall) {
    const supabaseAdmin = createServiceRoleClient();
    const { data: ch } = await supabaseAdmin
      .from("channels")
      .select("company_id")
      .eq("id", channelId)
      .single();
    companyId = (ch as { company_id?: string } | null)?.company_id ?? null;
    if (!companyId) {
      return NextResponse.json({ error: "Channel not found" }, { status: 404 });
    }
  } else {
    companyId = await getCompanyIdFromRequest(request);
    if (!companyId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const permErr = await requirePermission(companyId, PERMISSIONS.channels.manage);
    if (permErr) {
      return NextResponse.json({ error: permErr.error }, { status: permErr.status });
    }
  }

  const resolved = await getChannelToken(channelId, companyId!);
  if (!resolved) {
    return NextResponse.json({ error: "Channel not found" }, { status: 404 });
  }

  let body: Record<string, unknown> = {};
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    body = {};
  }
  const url = new URL(request.url);
  const createMissingConversations =
    String(body.create_missing ?? url.searchParams.get("create_missing") ?? "").toLowerCase() === "true" ||
    String(body.create_missing ?? url.searchParams.get("create_missing") ?? "") === "1";
  const envDefault = Number(process.env.SYNC_HISTORY_MAX_MESSAGES_PER_CHAT);
  const defaultPerChat =
    Number.isFinite(envDefault) && envDefault > 0 ? Math.min(8000, Math.floor(envDefault)) : 4000;
  const targetMessagesPerChatRaw = Number(
    body.messages_per_chat ?? url.searchParams.get("messages_per_chat") ?? defaultPerChat
  );
  const targetMessagesPerChat =
    Number.isFinite(targetMessagesPerChatRaw) && targetMessagesPerChatRaw > 0
      ? Math.min(Math.max(Math.floor(targetMessagesPerChatRaw), 1), 8000)
      : 4000;

  const result = await runSyncChannelHistory({
    channelId,
    companyId: companyId!,
    token: resolved.token,
    createMissingConversations,
    targetMessagesPerChat,
  });

  if (!result.ok && result.error === "Channel not found") {
    return NextResponse.json({ error: "Channel not found" }, { status: 404 });
  }

  return NextResponse.json({
    ok: result.ok,
    chats_processed: result.chats_processed,
    conversations_created: result.conversations_created,
    messages_processed: result.messages_processed,
    error: result.error,
  });
}
