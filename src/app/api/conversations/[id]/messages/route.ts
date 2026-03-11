import { getCompanyIdFromRequest } from "@/lib/auth/get-company";
import { requirePermission } from "@/lib/auth/get-profile";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { invalidateConversationDetail, invalidateConversationList } from "@/lib/redis/inbox-state";
import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { sendText, sendMedia } from "@/lib/uazapi/client";
import { normalizePhoneForSend } from "@/lib/phone-canonical";
import { NextResponse } from "next/server";

const MEDIA_TYPES = ["image", "video", "audio", "ptt", "myaudio", "ptv", "document", "sticker"] as const;
const MESSAGES_SELECT = "id, direction, content, external_id, sent_at, created_at, message_type, media_url, caption, file_name, reaction";
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

  // Buscar internal_notes e mesclar
  const notesClient = process.env.SUPABASE_SERVICE_ROLE_KEY 
    ? createServiceRoleClient() 
    : supabase;

  const { data: notes } = await notesClient
    .from("internal_notes")
    .select("id, content, created_at, author_id")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: true })
    .limit(limit);

  if (notes && notes.length > 0) {
    const formattedNotes = notes.map((n: { id: string; content: string; created_at: string; author_id: string }) => ({
      id: n.id,
      direction: "out",
      content: n.content,
      sent_at: n.created_at,
      message_type: "internal_note",
      created_at: n.created_at,
      // Se necessário, você pode adicionar o author_id para identificar quem escreveu a nota
    }));
    
    // Mesclar e ordenar por data
    messages = [...messages, ...formattedNotes].sort((a: any, b: any) => 
      new Date(a.sent_at).getTime() - new Date(b.sent_at).getTime()
    );
    
    // Se tiver limite e paginação, aplicar novamente após mesclar (simplificado)
    if (messages.length > limit) {
      messages = messages.slice(-limit);
    }
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
    replyid?: string;
    linkPreview?: boolean;
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
  const replyid = typeof body?.replyid === "string" ? body.replyid.trim() : undefined;
  const linkPreview = body?.linkPreview === true;

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

  // Se for nota interna, salva em internal_notes e retorna
  if (type === "internal_note") {
    const { data: note, error: noteErr } = await supabase
      .from("internal_notes")
      .insert({
        conversation_id: conversationId,
        content: content,
        author_id: user?.id,
      })
      .select("id, content, created_at, author_id")
      .single();

    if (noteErr) {
      return NextResponse.json({ error: noteErr.message }, { status: 500 });
    }

    // Retorna estrutura compatível com Message para o frontend mesclar
    const fakeMessage = {
      id: note.id,
      direction: "out",
      content: note.content,
      sent_at: note.created_at,
      message_type: "internal_note",
      created_at: note.created_at,
    };

    return NextResponse.json({ ok: true, message: fakeMessage });
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
    result = await sendText(token, number, content, {
      replyid,
      linkPreview,
    });
  }

  if (!result.ok) {
    console.error("[messages POST] UAZAPI send failed", {
      conversationId,
      isMedia,
      number: number.slice(0, 20) + (number.length > 20 ? "…" : ""),
      error: result.error,
    });
    const isVideoFormatError = type === "video" && typeof result.error === "string" && /mp4|video format|invalid.*format/i.test(result.error);
    const message = isVideoFormatError
      ? "O WhatsApp aceita apenas vídeos em MP4. Use a opção Vídeo no anexo para enviar um arquivo MP4."
      : "Falha ao enviar. Tente novamente.";
    return NextResponse.json(
      { error: message },
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

  const MESSAGES_SELECT = "id, direction, content, external_id, sent_at, created_at, message_type, media_url, caption, file_name, reaction";
  const { data: newMsg, error: insertErr } = await supabase
    .from("messages")
    .insert(insertPayload)
    .select(MESSAGES_SELECT)
    .single();
  if (insertErr) {
    return NextResponse.json({ error: insertErr.message }, { status: 500 });
  }
  if (newMsg) {
    const SNAPSHOT_MAX = 1000;
    const { data: convRow } = await supabase.from("conversations").select("messages_snapshot").eq("id", conversationId).eq("company_id", companyId).single();
    const prev = Array.isArray((convRow as { messages_snapshot?: unknown } | null)?.messages_snapshot) ? (convRow as { messages_snapshot: unknown[] }).messages_snapshot : [];
  const newMsgId = (newMsg as { id?: string }).id;
  const hasDup = newMsgId && prev.some((m: unknown) => (m as { id?: string }).id === newMsgId);
  const newSnapshot = hasDup ? prev : [...prev, newMsg].slice(-SNAPSHOT_MAX);
    await supabase
      .from("conversations")
      .update({ messages_snapshot: newSnapshot, last_message_at: sentAt, updated_at: sentAt })
      .eq("id", conversationId)
      .eq("company_id", companyId);
  } else {
    await supabase
      .from("conversations")
      .update({ last_message_at: sentAt, updated_at: sentAt })
      .eq("id", conversationId)
      .eq("company_id", companyId);
  }

  await Promise.all([
    invalidateConversationDetail(conversationId),
    invalidateConversationList(companyId),
  ]);
  return NextResponse.json({ ok: true, message: newMsg });
}
