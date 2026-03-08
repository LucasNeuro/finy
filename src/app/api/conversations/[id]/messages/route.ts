import { getCompanyIdFromRequest } from "@/lib/auth/get-company";
import { requirePermission } from "@/lib/auth/get-profile";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { invalidateConversationDetail, invalidateConversationList } from "@/lib/redis/inbox-state";
import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { sendText, sendMedia } from "@/lib/uazapi/client";
import { NextResponse } from "next/server";

/** Normaliza número Brasil para envio UAZAPI: 55 + DDD + 9 dígitos. Corrige números malformados (ex.: 211840940413040 → 5521184094041). */
function normalizePhoneForSend(raw: string | null | undefined, isGroup: boolean): string {
  if (isGroup || !raw) return (raw ?? "").trim();
  const d = (raw ?? "").replace(/\D/g, "");
  if (!d) return raw.trim();
  if (d.length === 10 || d.length === 11) return "55" + d;
  if ((d.length === 12 || d.length === 13) && d.startsWith("55")) return d;
  if ((d.length === 14 || d.length === 15) && !d.startsWith("55")) {
    const ddd = d.slice(0, 2);
    const mobile = d.slice(2, 11);
    if (/^\d{2}$/.test(ddd) && /^\d{9}$/.test(mobile)) return "55" + ddd + mobile;
  }
  return d;
}

const MEDIA_TYPES = ["image", "video", "audio", "ptt", "myaudio", "ptv", "document", "sticker"] as const;
const MESSAGES_SELECT = "id, direction, content, external_id, sent_at, created_at, message_type, media_url, caption, file_name";
const MESSAGES_PAGE_LIMIT = 1000;

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const companyId = await getCompanyIdFromRequest(request);
  if (!companyId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const readErr = await requirePermission(companyId, PERMISSIONS.inbox.read);
  if (readErr) {
    return NextResponse.json({ error: readErr.error }, { status: readErr.status });
  }
  const { id: conversationId } = await params;
  const { searchParams } = new URL(request.url);
  const before = searchParams.get("before");
  const limit = Math.min(Number(searchParams.get("limit")) || MESSAGES_PAGE_LIMIT, 2000);

  const supabase = await createClient();
  const { data: conversation, error: convError } = await supabase
    .from("conversations")
    .select("id")
    .eq("id", conversationId)
    .eq("company_id", companyId)
    .single();
  if (convError || !conversation) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  let messages: unknown[] = [];
  if (process.env.SUPABASE_SERVICE_ROLE_KEY) {
    try {
      const adminSupabase = createServiceRoleClient();
      let q = adminSupabase
        .from("messages")
        .select(MESSAGES_SELECT)
        .eq("conversation_id", conversationId)
        .order("sent_at", { ascending: true })
        .limit(limit);
      if (before) q = q.lt("sent_at", before);
      const res = await q;
      if (!res.error && res.data) messages = Array.isArray(res.data) ? res.data : [];
    } catch {
      // fallback below
    }
  }
  if (messages.length === 0) {
    let q = supabase
      .from("messages")
      .select(MESSAGES_SELECT)
      .eq("conversation_id", conversationId)
      .order("sent_at", { ascending: true })
      .limit(limit);
    if (before) q = q.lt("sent_at", before);
    const res = await q;
    if (res.error) {
      return NextResponse.json({ error: res.error.message }, { status: 500 });
    }
    messages = Array.isArray(res.data) ? res.data : [];
  }

  return NextResponse.json({ messages });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const companyId = await getCompanyIdFromRequest(request);
  if (!companyId) {
    console.error("[messages POST] Unauthorized: companyId not found (header X-Company-Slug ou cookie)");
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id: conversationId } = await params;
  let body: {
    content?: string;
    type?: string;
    file?: string;
    caption?: string;
    docName?: string;
    mimetype?: string;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const content = typeof body?.content === "string" ? body.content.trim() : "";
  const type = typeof body?.type === "string" ? body.type.toLowerCase() : "text";
  const file = typeof body?.file === "string" ? body.file.trim() : "";
  const caption = typeof body?.caption === "string" ? body.caption.trim() : "";
  const docName = typeof body?.docName === "string" ? body.docName.trim() : "";
  const mimetype = typeof body?.mimetype === "string" ? body.mimetype.trim() : undefined;

  const isMedia = MEDIA_TYPES.includes(type as (typeof MEDIA_TYPES)[number]) && file;
  if (!isMedia && !content) {
    return NextResponse.json({ error: "content or (type + file) is required" }, { status: 400 });
  }
  if (isMedia && !file) {
    return NextResponse.json({ error: "file is required for media messages" }, { status: 400 });
  }

  const supabase = await createClient();
  const { data: conversation, error: convError } = await supabase
    .from("conversations")
    .select("id, company_id, channel_id, customer_phone, wa_chat_jid, is_group, assigned_to")
    .eq("id", conversationId)
    .eq("company_id", companyId)
    .single();
  if (convError || !conversation) {
    console.error("[messages POST] Conversation not found", { conversationId, companyId, convError: convError?.message });
    return NextResponse.json({ error: "Conversation not found" }, { status: 404 });
  }

  const { data: { user } } = await supabase.auth.getUser();
  const assignedTo = conversation.assigned_to ?? null;
  if (assignedTo !== (user?.id ?? null)) {
    return NextResponse.json(
      { error: "Atribua esta conversa a você para enviar mensagens." },
      { status: 403 }
    );
  }

  if (!conversation.channel_id) {
    console.error("[messages POST] Conversation without channel", { conversationId });
    return NextResponse.json(
      { error: "Canal não vinculado a esta conversa" },
      { status: 400 }
    );
  }

  const { data: channel, error: chError } = await supabase
    .from("channels")
    .select("id, uazapi_instance_id, uazapi_token_encrypted")
    .eq("id", conversation.channel_id)
    .eq("company_id", companyId)
    .single();
  if (chError || !channel?.uazapi_token_encrypted) {
    console.error("[messages POST] Channel or token missing", { conversationId, channelId: conversation.channel_id, chError: chError?.message });
    return NextResponse.json(
      { error: "Canal ou token não configurado" },
      { status: 400 }
    );
  }

  const token = channel.uazapi_token_encrypted;
  const isGroup = !!conversation.is_group;
  const number =
    isGroup && conversation.wa_chat_jid
      ? conversation.wa_chat_jid
      : normalizePhoneForSend(conversation.customer_phone, isGroup);

  // Envio não usa Redis (conversa veio do Supabase). Erro "number is not on WhatsApp" = resposta da UAZAPI/WhatsApp (número inexistente ou inacessível).
  let result: { ok: boolean; error?: string };
  if (isMedia) {
    const uazType = type === "myaudio" ? "myaudio" : type === "ptv" ? "ptv" : type as "image" | "video" | "document" | "audio" | "ptt" | "sticker";
    result = await sendMedia(token, number, {
      type: uazType,
      file,
      text: caption || undefined,
      docName: docName || undefined,
      mimetype,
    });
  } else {
    result = await sendText(token, number, content);
  }

  if (!result.ok) {
    console.error("[messages POST] UAZAPI send failed", {
      conversationId,
      isMedia,
      number: number.slice(0, 20) + (number.length > 20 ? "…" : ""),
      error: result.error,
    });
    return NextResponse.json(
      { error: "Falha ao enviar. Tente novamente." },
      { status: 502 }
    );
  }

  const sentAt = new Date().toISOString();
  const messageType = isMedia ? (type === "myaudio" || type === "ptv" ? type : type === "ptt" ? "ptt" : type) : "text";
  const insertPayload: Record<string, unknown> = {
    conversation_id: conversationId,
    direction: "out",
    content: isMedia ? (caption || `[${messageType}]`) : content,
    message_type: messageType,
    sent_at: sentAt,
  };
  if (isMedia && file) {
    insertPayload.media_url = file;
    if (caption) insertPayload.caption = caption;
    if (docName) insertPayload.file_name = docName;
  }

  const { error: insertErr } = await supabase.from("messages").insert(insertPayload);
  if (insertErr) {
    return NextResponse.json({ error: insertErr.message }, { status: 500 });
  }
  await supabase
    .from("conversations")
    .update({ last_message_at: sentAt, updated_at: sentAt })
    .eq("id", conversationId);

  await Promise.all([
    invalidateConversationDetail(conversationId),
    invalidateConversationList(companyId),
  ]);
  return NextResponse.json({ ok: true });
}
