import type { SupabaseClient } from "@supabase/supabase-js";

const KIND = "inbox_new_message" as const;

/**
 * Quem recebe aviso de mensagem nova:
 * - Se a conversa tem atendente: só ele.
 * - Senão: todos os usuários atribuídos à fila (queue_assignments).
 * - Se a fila não tiver ninguém: todos os perfis ativos da empresa (fallback).
 */
export async function upsertInboxNotificationsForIncomingMessage(
  supabase: SupabaseClient,
  params: {
    companyId: string;
    conversationId: string;
    messagePreview: string;
    isGroup: boolean;
  }
): Promise<void> {
  const { companyId, conversationId, messagePreview, isGroup } = params;

  const { data: companyRow, error: companyErr } = await supabase
    .from("companies")
    .select("slug")
    .eq("id", companyId)
    .maybeSingle();
  if (companyErr || !companyRow?.slug) {
    console.warn("[inbox-notifications] sem slug da empresa", { companyId, companyErr });
    return;
  }
  const companySlug = (companyRow as { slug: string }).slug;

  const { data: convRow, error: convErr } = await supabase
    .from("conversations")
    .select("queue_id, assigned_to, customer_name, customer_phone")
    .eq("id", conversationId)
    .maybeSingle();
  if (convErr || !convRow) {
    console.warn("[inbox-notifications] conversa não encontrada", { conversationId, convErr });
    return;
  }
  const conv = convRow as {
    queue_id: string | null;
    assigned_to: string | null;
    customer_name: string | null;
    customer_phone: string | null;
  };

  let userIds: string[] = [];
  if (conv.assigned_to) {
    userIds = [conv.assigned_to];
  } else if (conv.queue_id) {
    const { data: qa } = await supabase
      .from("queue_assignments")
      .select("user_id")
      .eq("company_id", companyId)
      .eq("queue_id", conv.queue_id);
    userIds = [...new Set((qa ?? []).map((r: { user_id: string }) => r.user_id).filter(Boolean))];
  }
  if (userIds.length === 0) {
    const { data: profs } = await supabase
      .from("profiles")
      .select("user_id")
      .eq("company_id", companyId)
      .eq("is_active", true);
    userIds = [...new Set((profs ?? []).map((r: { user_id: string }) => r.user_id).filter(Boolean))];
  }
  if (userIds.length === 0) return;

  const title =
    (conv.customer_name && String(conv.customer_name).trim()) ||
    (conv.customer_phone && String(conv.customer_phone).trim()) ||
    (isGroup ? "Grupo" : "Nova mensagem");
  const body = (messagePreview || "Mensagem recebida").slice(0, 500);
  const link = `/${companySlug}/conversas/${conversationId}`;
  const data = {
    conversation_id: conversationId,
    is_group: isGroup,
  };
  const now = new Date().toISOString();

  for (const userId of userIds) {
    const { data: updated } = await supabase
      .from("notifications")
      .update({
        title,
        body,
        link,
        data,
        is_read: false,
        read_at: null,
        created_at: now,
      })
      .eq("company_id", companyId)
      .eq("user_id", userId)
      .eq("conversation_id", conversationId)
      .eq("kind", KIND)
      .select("id");

    if (updated && updated.length > 0) continue;

    const { error: insErr } = await supabase.from("notifications").insert({
      company_id: companyId,
      user_id: userId,
      kind: KIND,
      title,
      body,
      link,
      data,
      conversation_id: conversationId,
      is_read: false,
    });

    if (insErr?.code === "23505") {
      await supabase
        .from("notifications")
        .update({
          title,
          body,
          link,
          data,
          is_read: false,
          read_at: null,
          created_at: now,
        })
        .eq("company_id", companyId)
        .eq("user_id", userId)
        .eq("conversation_id", conversationId)
        .eq("kind", KIND);
    } else if (insErr) {
      console.error("[inbox-notifications] insert falhou", { userId, conversationId, insErr });
    }
  }
}
