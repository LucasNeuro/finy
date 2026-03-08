import { getCompanyIdFromRequest } from "@/lib/auth/get-company";
import { requirePermission } from "@/lib/auth/get-profile";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { createClient } from "@/lib/supabase/server";
import { sendMessagePresence } from "@/lib/uazapi/client";
import { normalizePhoneForSend } from "@/lib/phone-canonical";
import { NextResponse } from "next/server";

/**
 * POST /api/conversations/[id]/presence
 * Body: { presence: "composing" | "recording" | "paused" }
 * Envia indicador de "digitando" ou "gravando" para o chat (UAZAPI /message/presence).
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const companyId = await getCompanyIdFromRequest(request);
  if (!companyId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const permErr = await requirePermission(companyId, PERMISSIONS.inbox.read);
  if (permErr) {
    return NextResponse.json({ error: permErr.error }, { status: permErr.status });
  }

  const { id: conversationId } = await params;
  let body: { presence?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const presence = body?.presence === "composing" || body?.presence === "recording" || body?.presence === "paused"
    ? body.presence
    : null;
  if (!presence) {
    return NextResponse.json({ error: "presence must be composing, recording, or paused" }, { status: 400 });
  }

  const supabase = await createClient();
  const { data: conversation, error: convErr } = await supabase
    .from("conversations")
    .select("id, company_id, channel_id, customer_phone, wa_chat_jid, is_group, assigned_to")
    .eq("id", conversationId)
    .eq("company_id", companyId)
    .single();

  if (convErr || !conversation) {
    return NextResponse.json({ error: "Conversation not found" }, { status: 404 });
  }

  const { data: { user } } = await supabase.auth.getUser();
  if (conversation.assigned_to !== (user?.id ?? null)) {
    return NextResponse.json({ error: "Atribua esta conversa a você." }, { status: 403 });
  }

  const { data: channel, error: chErr } = await supabase
    .from("channels")
    .select("id, uazapi_token_encrypted")
    .eq("id", conversation.channel_id)
    .eq("company_id", companyId)
    .single();

  if (chErr || !channel?.uazapi_token_encrypted) {
    return NextResponse.json({ error: "Canal não configurado" }, { status: 400 });
  }

  const isGroup = !!conversation.is_group;
  const number =
    isGroup && conversation.wa_chat_jid
      ? conversation.wa_chat_jid
      : normalizePhoneForSend(conversation.customer_phone, isGroup);

  const result = await sendMessagePresence(
    channel.uazapi_token_encrypted,
    number,
    presence,
    presence === "composing" ? 30_000 : undefined
  );

  if (!result.ok) {
    return NextResponse.json({ error: result.error ?? "Falha ao enviar presença" }, { status: 502 });
  }

  return NextResponse.json({ ok: true });
}
