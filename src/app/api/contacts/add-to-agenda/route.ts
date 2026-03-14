import { getCompanyIdFromRequest } from "@/lib/auth/get-company";
import { getChannelToken } from "@/lib/uazapi/channel-token";
import { addContactToAgenda, getChatDetails, extractContactNameFromDetails } from "@/lib/uazapi/client";
import { toCanonicalDigits } from "@/lib/phone-canonical";
import { upsertChannelContactNoDuplicate } from "@/lib/channel-contacts";
import { invalidateConversationList } from "@/lib/redis/inbox-state";
import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

/**
 * POST /api/contacts/add-to-agenda
 * Body: { channel_id: string, number: string, name?: string }
 * Adiciona contato à agenda do WhatsApp (UAZAPI /contact/add).
 * Faz upsert em channel_contacts. Busca nome e avatar na UAZAPI (igual ao bulk-add).
 * Só o número é obrigatório — nome e avatar vêm do WhatsApp.
 */
export async function POST(request: Request) {
  const companyId = await getCompanyIdFromRequest(request);
  if (!companyId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { channel_id?: string; number?: string; name?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const channelId = typeof body?.channel_id === "string" ? body.channel_id.trim() : "";
  const number = typeof body?.number === "string" ? body.number.trim() : "";
  const name = typeof body?.name === "string" ? body.name.trim() : "";
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

  const result = await addContactToAgenda(resolved.token, number, name || number);
  if (!result.ok) {
    return NextResponse.json(
      { error: result.error ?? "Falha ao adicionar à agenda" },
      { status: 502 }
    );
  }

  const digits = number.replace(/\D/g, "");
  const canonicalDigits = toCanonicalDigits(number) ?? digits;
  const jid = digits ? `${canonicalDigits || digits}@s.whatsapp.net` : "";
  if (jid) {
    const supabase = await createClient();
    const now = new Date().toISOString();
    const { error: upsertErr } = await upsertChannelContactNoDuplicate(supabase, channelId, companyId, {
      channel_id: channelId,
      company_id: companyId,
      jid,
      phone: canonicalDigits || digits || null,
      contact_name: name || null,
      first_name: name || null,
      synced_at: now,
    });
    if (upsertErr) {
      return NextResponse.json({ error: upsertErr.message }, { status: 500 });
    }

    // Busca nome e avatar na UAZAPI (igual ao bulk-add e chat-details)
    try {
      const detail = await getChatDetails(resolved.token, jid, { preview: true });
      const imageUrl = detail.data?.imagePreview ?? detail.data?.image;
      const nameFromDetail = extractContactNameFromDetails(detail.data);
      const updates: Record<string, unknown> = { synced_at: new Date().toISOString() };
      if (imageUrl && typeof imageUrl === "string" && imageUrl.trim()) {
        updates.avatar_url = imageUrl.trim();
      }
      if (nameFromDetail) {
        updates.contact_name = nameFromDetail;
        updates.first_name = nameFromDetail;
      }
      if (Object.keys(updates).length > 1) {
        await supabase
          .from("channel_contacts")
          .update(updates)
          .eq("channel_id", channelId)
          .eq("company_id", companyId)
          .eq("jid", jid);
      }
    } catch {
      // ignora — contato já foi salvo
    }
    await invalidateConversationList(companyId);
  }

  return NextResponse.json(result.data ?? { ok: true });
}
