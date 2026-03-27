import { getCompanyIdFromRequest } from "@/lib/auth/get-company";
import { toCanonicalDigits, toCanonicalJid } from "@/lib/phone-canonical";
import { getChannelToken } from "@/lib/uazapi/channel-token";
import { getChatDetails, extractContactNameFromDetails, type ChatDetails } from "@/lib/uazapi/client";
import { toCanonicalDigits } from "@/lib/phone-canonical";
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
<<<<<<< HEAD
  const contactName = ((data as { wa_contactName?: string }).wa_contactName
    ?? (data as { wa_name?: string }).wa_name
    ?? (data as { name?: string }).name)?.trim() || null;
  const canonicalDigits = toCanonicalDigits(number);
  const canonicalJid = toCanonicalJid(number, false).toLowerCase();
=======
  const contactName = extractContactNameFromDetails(data as ChatDetails);
  const digits = number.replace(/\D/g, "").replace(/@.*$/, "");
  const canonicalDigits = toCanonicalDigits(digits) ?? digits;
>>>>>>> 90177313e89862f0eb89d72726a0395ad050d21b

  const hasUpdates = (avatarUrl && typeof avatarUrl === "string" && avatarUrl.trim()) || contactName;
  if (hasUpdates) {
    const supabase = await createClient();
<<<<<<< HEAD
    const isGroup = number.toLowerCase().includes("@g.us");
    if (!isGroup) {
=======
    const canonicalJid = canonicalDigits ? `${canonicalDigits}@s.whatsapp.net` : (number.includes("@") ? number : `${digits}@s.whatsapp.net`);
    const jids = number.includes("@") && number !== canonicalJid ? [canonicalJid, number] : [canonicalJid];
>>>>>>> 90177313e89862f0eb89d72726a0395ad050d21b
    const contactUpdates: Record<string, unknown> = { synced_at: new Date().toISOString() };
    if (avatarUrl && typeof avatarUrl === "string" && avatarUrl.trim()) {
      contactUpdates.avatar_url = avatarUrl.trim();
    }
    if (contactName) {
      contactUpdates.contact_name = contactName;
      contactUpdates.first_name = contactName;
    }
<<<<<<< HEAD
    await supabase
      .from("channel_contacts")
      .upsert(
        {
          channel_id: channelId,
          company_id: companyId,
          jid: canonicalJid,
          ...(canonicalDigits ? { phone: canonicalDigits } : {}),
          ...contactUpdates,
        },
        { onConflict: "channel_id,jid", ignoreDuplicates: false }
      );

    // Limpa variante antiga sem sufixo (@s.whatsapp.net), se existir.
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
=======
    await Promise.all(
      jids.map((jid) =>
        supabase
          .from("channel_contacts")
          .upsert(
            {
              channel_id: channelId,
              company_id: companyId,
              jid,
              ...(canonicalDigits ? { phone: canonicalDigits } : {}),
              ...contactUpdates,
            },
            { onConflict: "channel_id,jid" }
          )
      )
    );
>>>>>>> 90177313e89862f0eb89d72726a0395ad050d21b
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
