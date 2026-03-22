import { getCompanyIdFromRequest } from "@/lib/auth/get-company";
import { getChannelToken } from "@/lib/uazapi/channel-token";
import {
  addContactToAgendaWithRetries,
  getChatDetails,
  extractContactNameFromDetails,
  isTransientContactAddError,
} from "@/lib/uazapi/client";
import { toCanonicalDigits } from "@/lib/phone-canonical";
import { upsertChannelContactNoDuplicate } from "@/lib/channel-contacts";
import { invalidateConversationList } from "@/lib/redis/inbox-state";
import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

const PLATFORM_ONLY_FALLBACK =
  process.env.BULK_ADD_PLATFORM_ONLY_FALLBACK === "true" ||
  process.env.BULK_ADD_PLATFORM_ONLY_FALLBACK === "1";

function humanizeContactAddError(raw: string): string {
  if (raw.includes("critical_unblock") || raw.includes("internal-server-error")) {
    return (
      "WhatsApp retornou erro interno ao sincronizar o contato na agenda do aparelho. " +
      "Tente de novo em alguns minutos. " +
      "(Detalhe técnico: " +
      raw.slice(0, 200) +
      (raw.length > 200 ? "…" : "") +
      ")"
    );
  }
  return raw;
}

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

  const result = await addContactToAgendaWithRetries(resolved.token, number, name || number);
  let waOk = result.ok;
  let platformOnly = false;
  if (!waOk && PLATFORM_ONLY_FALLBACK && isTransientContactAddError(result.error)) {
    waOk = true;
    platformOnly = true;
  }
  if (!waOk) {
    return NextResponse.json(
      {
        error: humanizeContactAddError(result.error ?? "Falha ao adicionar à agenda"),
      },
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

  const waPayload =
    typeof result.data === "object" && result.data !== null && !Array.isArray(result.data)
      ? (result.data as Record<string, unknown>)
      : {};
  return NextResponse.json({
    ...waPayload,
    ok: true,
    platform_only: platformOnly ? true : undefined,
    hint: platformOnly
      ? "Contato salvo só na plataforma; sincronize na agenda do WhatsApp depois se precisar."
      : undefined,
  });
}
