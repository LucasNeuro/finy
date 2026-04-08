import { createServiceRoleClient } from "@/lib/supabase/admin";
import { toCanonicalDigits } from "@/lib/phone-canonical";
import { callUazSender } from "@/lib/uazapi/sender";

type ConsentTriggerReason =
  | "contact_created"
  | "conversation_created"
  | "conversation_closed"
  | "manual_bulk";

type ContactRow = {
  id: string;
  jid: string | null;
  phone: string | null;
  contact_name: string | null;
  first_name: string | null;
  opt_in_at: string | null;
  opt_out_at: string | null;
  opt_in_evidence: Record<string, unknown> | null;
};

function buildProtocol(): string {
  const rand = Math.floor(Math.random() * 900000) + 100000;
  return `CV-${Date.now().toString().slice(-6)}-${rand}`;
}

function normalizeDigits(phoneOrJid: string | null | undefined): string {
  return toCanonicalDigits(phoneOrJid ?? "") ?? "";
}

function buildJidFromDigits(digits: string): string {
  return digits ? `${digits}@s.whatsapp.net` : "";
}

function buildPhoneVariants(digits: string): string[] {
  const base = digits.replace(/\D/g, "");
  if (!base) return [];
  const variants = new Set<string>([base]);
  if (base.startsWith("55") && base.length > 10) {
    variants.add(base.slice(2));
  } else {
    variants.add(`55${base}`);
  }
  return Array.from(variants);
}

async function getChannelToken(channelId: string, companyId: string): Promise<string | null> {
  const supabase = createServiceRoleClient();
  const { data } = await supabase
    .from("channels")
    .select("uazapi_token_encrypted")
    .eq("id", channelId)
    .eq("company_id", companyId)
    .maybeSingle();
  return (data as { uazapi_token_encrypted?: string } | null)?.uazapi_token_encrypted?.trim() || null;
}

async function findOrCreateContact(params: {
  companyId: string;
  channelId: string;
  digits: string;
  jid: string;
  name: string | null;
}): Promise<ContactRow | null> {
  const supabase = createServiceRoleClient();
  const phoneVariants = buildPhoneVariants(params.digits);

  const byJid = await supabase
    .from("channel_contacts")
    .select("id, jid, phone, contact_name, first_name, opt_in_at, opt_out_at, opt_in_evidence")
    .eq("company_id", params.companyId)
    .eq("channel_id", params.channelId)
    .eq("jid", params.jid)
    .maybeSingle();
  if (byJid.data) return byJid.data as ContactRow;

  if (phoneVariants.length > 0) {
    const byPhone = await supabase
      .from("channel_contacts")
      .select("id, jid, phone, contact_name, first_name, opt_in_at, opt_out_at, opt_in_evidence")
      .eq("company_id", params.companyId)
      .eq("channel_id", params.channelId)
      .in("phone", phoneVariants)
      .limit(1)
      .maybeSingle();
    if (byPhone.data) return byPhone.data as ContactRow;
  }

  const now = new Date().toISOString();
  const { data: inserted } = await supabase
    .from("channel_contacts")
    .upsert(
      {
        company_id: params.companyId,
        channel_id: params.channelId,
        jid: params.jid,
        phone: params.digits || null,
        contact_name: params.name,
        first_name: params.name,
        synced_at: now,
      },
      { onConflict: "channel_id,jid", ignoreDuplicates: false }
    )
    .select("id, jid, phone, contact_name, first_name, opt_in_at, opt_out_at, opt_in_evidence")
    .single();

  return (inserted as ContactRow | null) ?? null;
}

export async function sendAutoConsentIfNeeded(params: {
  companyId: string;
  channelId: string;
  phoneOrJid: string;
  name?: string | null;
  reason: ConsentTriggerReason;
}): Promise<{ sent: boolean; skipped?: string; protocol?: string; error?: string }> {
  /**
   * Mensagem com botões SIM/NAO: fluxo LGPD/opt-in automático ao criar conversa / contato.
   * Só envia se o contato ainda não tem opt_in/opt_out e ainda não recebeu pedido (opt_in_evidence).
   * Desligar totalmente: CONSENT_AUTO_DISABLE=1 no .env do servidor.
   */
  const consentDisabled =
    process.env.CONSENT_AUTO_DISABLE === "1" || process.env.CONSENT_AUTO_DISABLE === "true";
  if (consentDisabled) {
    return { sent: false, skipped: "consent_auto_disabled" };
  }

  const digits = normalizeDigits(params.phoneOrJid);
  if (!digits) return { sent: false, skipped: "invalid_phone" };

  const jid = buildJidFromDigits(digits);
  const contact = await findOrCreateContact({
    companyId: params.companyId,
    channelId: params.channelId,
    digits,
    jid,
    name: params.name ?? null,
  });
  if (!contact) return { sent: false, skipped: "contact_not_found" };

  if (contact.opt_in_at || contact.opt_out_at) {
    return { sent: false, skipped: "already_decided" };
  }

  const evidence = (contact.opt_in_evidence ?? {}) as Record<string, unknown>;
  if (typeof evidence.consent_request_sent_at === "string") {
    return { sent: false, skipped: "already_requested" };
  }

  const token = await getChannelToken(params.channelId, params.companyId);
  if (!token) return { sent: false, skipped: "channel_token_not_found" };

  const protocol = buildProtocol();
  const now = new Date().toISOString();
  const text =
    "Bem-vindo ao nosso atendimento. " +
    "Você autoriza receber comunicações e atualizações?";
  const trackId = `consent_auto_${params.reason}_${Date.now()}`;

  const sendResult = await callUazSender(token, "/send/menu", {
    method: "POST",
    body: {
      number: digits,
      type: "button",
      text,
      choices: ["SIM|optin_yes", "NAO|optout_yes"],
      readchat: true,
      async: true,
      track_source: "consent_auto",
      track_id: trackId,
    },
  });

  if (!sendResult.ok) {
    return { sent: false, error: sendResult.error ?? "send_failed" };
  }

  const supabase = createServiceRoleClient();
  await supabase
    .from("channel_contacts")
    .update({
      opt_in_evidence: {
        ...evidence,
        consent_request_sent_at: now,
        consent_request_protocol: protocol,
        consent_request_source: params.reason,
        consent_request_track_id: trackId,
      },
      synced_at: now,
    })
    .eq("id", contact.id);

  return { sent: true, protocol };
}
