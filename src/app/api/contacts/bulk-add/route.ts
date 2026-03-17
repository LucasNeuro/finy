import { getCompanyIdFromRequest } from "@/lib/auth/get-company";
import { getChannelToken } from "@/lib/uazapi/channel-token";
import { addContactToAgenda, getChatDetails, extractContactNameFromDetails } from "@/lib/uazapi/client";
import { toCanonicalDigits } from "@/lib/phone-canonical";
import { upsertChannelContactNoDuplicate } from "@/lib/channel-contacts";
import { invalidateConversationList } from "@/lib/redis/inbox-state";
import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

const MAX_PER_REQUEST = 90;
const ENRICH_DELAY_MS = 120; // delay entre chamadas getChatDetails para evitar rate limit

/**
 * POST /api/contacts/bulk-add
 * Body: { channel_id: string, contacts: [{ number: string, contact_name?: string, first_name?: string }] }
 * Adiciona contatos em massa: agenda do WhatsApp + upsert em channel_contacts.
 * Se o CSV tiver só números, busca nome e avatar na UAZAPI (igual ao cadastro manual).
 */
export async function POST(request: Request) {
  const companyId = await getCompanyIdFromRequest(request);
  if (!companyId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: {
    channel_id?: string;
    contacts?: { number: string; contact_name?: string; first_name?: string }[];
    tag_ids?: string[];
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const channelId = typeof body?.channel_id === "string" ? body.channel_id.trim() : "";
  const contacts = Array.isArray(body?.contacts) ? body.contacts : [];
  const tagIds = Array.isArray(body?.tag_ids)
    ? body.tag_ids.map((t) => String(t).trim()).filter(Boolean)
    : [];
  if (!channelId || contacts.length === 0) {
    return NextResponse.json(
      { error: "channel_id e contacts são obrigatórios" },
      { status: 400 }
    );
  }

  if (contacts.length > MAX_PER_REQUEST) {
    return NextResponse.json(
      { error: `Máximo de ${MAX_PER_REQUEST} contatos por importação` },
      { status: 400 }
    );
  }

  const resolved = await getChannelToken(channelId, companyId);
  if (!resolved) {
    return NextResponse.json({ error: "Canal não encontrado" }, { status: 404 });
  }

  const supabase = await createClient();
  let ok = 0;
  let fail = 0;
  let firstError: string | null = null;
  const addedJids: string[] = [];

  for (const item of contacts) {
    const number = (item?.number ?? "").toString().replace(/\D/g, "").trim();
    const contactName = (item?.contact_name ?? "").toString().trim();
    const firstName = (item?.first_name ?? "").toString().trim();
    const name = contactName || firstName || number;
    if (!number) {
      fail++;
      if (!firstError) firstError = "Telefone inválido em uma das linhas.";
      continue;
    }

    try {
      const result = await addContactToAgenda(resolved.token, number, name);
      if (!result.ok) {
        fail++;
        if (!firstError) firstError = result.error ?? "Falha ao adicionar um dos contatos.";
        continue;
      }

      const canonicalDigits = toCanonicalDigits(number) ?? number;
      const jid = canonicalDigits ? `${canonicalDigits}@s.whatsapp.net` : `${number}@s.whatsapp.net`;
      const now = new Date().toISOString();
      const displayName = contactName || firstName || number;

      const { id: contactId, error: upsertErr } = await upsertChannelContactNoDuplicate(supabase, channelId, companyId, {
        channel_id: channelId,
        company_id: companyId,
        jid,
        phone: canonicalDigits || number || null,
        contact_name: displayName || null,
        first_name: firstName || contactName || displayName || null,
        synced_at: now,
      });
      if (upsertErr) {
        fail++;
        if (!firstError) firstError = upsertErr.message;
        continue;
      }

      if (tagIds.length > 0 && contactId) {
        const tagRows = tagIds.map((tagId) => ({
          company_id: companyId,
          channel_contact_id: contactId,
          tag_id: tagId,
        }));
        await supabase
          .from("contact_tags")
          .upsert(tagRows, { onConflict: "channel_contact_id,tag_id", ignoreDuplicates: true });
      }

      addedJids.push(jid);
      ok++;
    } catch (err) {
      fail++;
      if (!firstError) firstError = err instanceof Error ? err.message : "Erro ao processar contato.";
    }
  }

  // Enriquecer com nome e avatar da UAZAPI (igual ao cadastro manual / chat-details)
  if (addedJids.length > 0) {
    for (let i = 0; i < addedJids.length; i++) {
      const jid = addedJids[i];
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
        // ignora erro ao buscar detalhes — contato já foi salvo
      }
      if (i < addedJids.length - 1) {
        await new Promise((r) => setTimeout(r, ENRICH_DELAY_MS));
      }
    }
    await invalidateConversationList(companyId);
  }

  return NextResponse.json({
    ok,
    fail,
    error: firstError ?? undefined,
  });
}
