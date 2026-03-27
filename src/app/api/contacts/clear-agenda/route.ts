import { getCompanyIdFromRequest } from "@/lib/auth/get-company";
import { requirePermission } from "@/lib/auth/get-profile";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { toCanonicalDigits } from "@/lib/phone-canonical";
import { createClient } from "@/lib/supabase/server";
import { getChannelToken } from "@/lib/uazapi/channel-token";
import { listContacts, removeContactFromAgenda } from "@/lib/uazapi/client";
import { NextResponse } from "next/server";

/**
 * POST /api/contacts/clear-agenda
 * Body: {
 *   channel_id: string,
 *   clear_local_cache?: boolean,
 *   remove_phone_contacts?: boolean,
 *   confirm_text?: string
 * }
 *
 * Modo seguro (padrão): limpa apenas os contatos locais do canal no banco.
 * Modo destrutivo (opcional): remove agenda do telefone/instância.
 * Para modo destrutivo exige:
 * - ENABLE_PHONE_AGENDA_WIPE=true no servidor
 * - confirm_text === "LIMPAR TELEFONE"
 */
export async function POST(request: Request) {
  const companyId = await getCompanyIdFromRequest(request);
  if (!companyId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const permErr = await requirePermission(companyId, PERMISSIONS.channels.manage);
  if (permErr) {
    return NextResponse.json({ error: permErr.error }, { status: permErr.status });
  }

  let body: {
    channel_id?: string;
    clear_local_cache?: boolean;
    remove_phone_contacts?: boolean;
    confirm_text?: string;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const channelId = typeof body?.channel_id === "string" ? body.channel_id.trim() : "";
  const removePhoneContacts = body?.remove_phone_contacts === true;
  const clearLocalCache = body?.clear_local_cache !== false;
  if (!channelId) {
    return NextResponse.json({ error: "channel_id é obrigatório" }, { status: 400 });
  }
  if (!removePhoneContacts && !clearLocalCache) {
    return NextResponse.json({ error: "Nada para executar." }, { status: 400 });
  }

  let removed = 0;
  let failed = 0;
  const errors: string[] = [];
  let totalFound = 0;

  if (removePhoneContacts) {
    if (process.env.ENABLE_PHONE_AGENDA_WIPE !== "true") {
      return NextResponse.json(
        { error: "Limpeza da agenda do telefone está desabilitada neste ambiente." },
        { status: 403 }
      );
    }
    if ((body?.confirm_text ?? "").trim().toUpperCase() !== "LIMPAR TELEFONE") {
      return NextResponse.json({ error: "Confirmação inválida para limpeza do telefone." }, { status: 400 });
    }

    const resolved = await getChannelToken(channelId, companyId);
    if (!resolved) {
      return NextResponse.json({ error: "Canal não encontrado" }, { status: 404 });
    }

    const contactsRes = await listContacts(resolved.token);
    if (!contactsRes.ok || !Array.isArray(contactsRes.data)) {
      return NextResponse.json(
        { error: contactsRes.error ?? "Falha ao listar contatos da instância" },
        { status: 502 }
      );
    }

    const numbers = new Set<string>();
    for (const rawContact of contactsRes.data as Array<Record<string, unknown>>) {
      const jidValue = typeof rawContact.jid === "string"
        ? rawContact.jid
        : typeof rawContact.JID === "string"
          ? rawContact.JID
          : typeof rawContact.phone === "string"
            ? rawContact.phone
            : "";
      const digits = toCanonicalDigits(String(jidValue || "").replace(/@.*$/, "").replace(/\D/g, ""));
      if (digits) numbers.add(digits);
    }

    totalFound = numbers.size;
    for (const number of numbers) {
      const r = await removeContactFromAgenda(resolved.token, number);
      if (r.ok) {
        removed += 1;
      } else {
        failed += 1;
        if (errors.length < 20) {
          errors.push(`${number}: ${r.error ?? "erro desconhecido"}`);
        }
      }
    }
  }

  let localDeleted = 0;
  if (clearLocalCache) {
    const supabase = await createClient();
    const { data: rows } = await supabase
      .from("channel_contacts")
      .select("id")
      .eq("company_id", companyId)
      .eq("channel_id", channelId);
    localDeleted = Array.isArray(rows) ? rows.length : 0;
    await supabase
      .from("channel_contacts")
      .delete()
      .eq("company_id", companyId)
      .eq("channel_id", channelId);
  }

  return NextResponse.json({
    ok: true,
    total_found: totalFound,
    removed,
    failed,
    remove_phone_contacts: removePhoneContacts,
    clear_local_cache: clearLocalCache,
    local_deleted: localDeleted,
    errors,
  });
}
