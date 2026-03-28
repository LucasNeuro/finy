import { getCompanyIdFromRequest } from "@/lib/auth/get-company";
import { toCanonicalDigits, toCanonicalJid } from "@/lib/phone-canonical";
import { getChannelToken } from "@/lib/uazapi/channel-token";
import { getChatDetails, extractContactNameFromDetails, type ChatDetails } from "@/lib/uazapi/client";
import { invalidateConversationDetail, invalidateConversationList } from "@/lib/redis/inbox-state";
import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

/**
 * POST /api/contacts/chat-details
 * Body: { channel_id: string, number: string, preview?: boolean, conversation_id?: string }
 * number: telefone (ex: 5511999999999) ou jid do grupo (ex: 120363123456789012@g.us).
 * Retorna detalhes completos do chat/contato via UAZAPI /chat/details.
 * Se a UAZAPI retornar foto (imagePreview/image), grava em channel_contacts.avatar_url para exibir na lista e no header.
 * Invalida cache da lista e do detalhe da conversa para a foto aparecer na aplicação sem precisar atualizar manualmente.
 */
export async function POST(request: Request) {
  const companyId = await getCompanyIdFromRequest(request);
  if (!companyId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { channel_id?: string; number?: string; preview?: boolean; conversation_id?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const channelId = typeof body?.channel_id === "string" ? body.channel_id.trim() : "";
  const number = typeof body?.number === "string" ? body.number.trim() : "";
  const conversationId = typeof body?.conversation_id === "string" ? body.conversation_id.trim() : "";
  if (!channelId || !number) {
    return NextResponse.json(
      { error: "channel_id e number são obrigatórios" },
      { status: 400 }
    );
  }

  const resolved = await getChannelToken(channelId, companyId);
  if (!resolved) {
    return NextResponse.json({ error: "Canal não encontrado" }, { status: 404 });
  }

  const result = await getChatDetails(resolved.token, number, {
    preview: body.preview ?? true,
  });

  if (!result.ok) {
    return NextResponse.json(
      { error: result.error ?? "Falha ao obter detalhes do chat" },
      { status: 502 }
    );
  }

  const data = result.data ?? {};
  const avatarUrl = (data as { imagePreview?: string; image?: string }).imagePreview
    || (data as { image?: string }).image
    || null;
  const contactName = extractContactNameFromDetails(data as ChatDetails);
  const digits = number.replace(/\D/g, "").replace(/@.*$/, "");
  const canonicalDigits = toCanonicalDigits(number) ?? toCanonicalDigits(digits) ?? digits;
  const canonicalJid = toCanonicalJid(number, false).toLowerCase();

  const hasUpdates = (avatarUrl && typeof avatarUrl === "string" && avatarUrl.trim()) || contactName;
  if (hasUpdates) {
    const supabase = await createClient();
    const isGroup = number.toLowerCase().includes("@g.us");
    if (!isGroup) {
      const jids =
        number.includes("@") && number.toLowerCase() !== canonicalJid
          ? [canonicalJid, number]
          : [canonicalJid];
      const contactUpdates: Record<string, unknown> = { synced_at: new Date().toISOString() };
      if (avatarUrl && typeof avatarUrl === "string" && avatarUrl.trim()) {
        contactUpdates.avatar_url = avatarUrl.trim();
      }
      if (contactName) {
        contactUpdates.contact_name = contactName;
        contactUpdates.first_name = contactName;
      }
      await Promise.all(
        jids.map((jid) =>
          supabase.from("channel_contacts").upsert(
            {
              channel_id: channelId,
              company_id: companyId,
              jid,
              ...(canonicalDigits ? { phone: canonicalDigits } : {}),
              ...contactUpdates,
            },
            { onConflict: "channel_id,jid", ignoreDuplicates: false }
          )
        )
      );

      const rawDigits = number.replace(/\D/g, "");
      if (rawDigits && rawDigits !== canonicalJid) {
        await supabase
          .from("channel_contacts")
          .delete()
          .eq("company_id", companyId)
          .eq("channel_id", channelId)
          .eq("jid", rawDigits);
      }
    }
    if (conversationId && contactName) {
      await supabase
        .from("conversations")
        .update({ customer_name: contactName, updated_at: new Date().toISOString() })
        .eq("id", conversationId);
    }
    await invalidateConversationList(companyId);
    if (conversationId) {
      await invalidateConversationDetail(conversationId, companyId);
    }
  }

  return NextResponse.json(data);
}
