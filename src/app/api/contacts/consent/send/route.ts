import { getCompanyIdFromRequest } from "@/lib/auth/get-company";
import { sendAutoConsentIfNeeded } from "@/lib/consent/auto-consent";
import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

/**
 * POST /api/contacts/consent/send
 * Body: { contact_ids: string[] }
 * Envia consentimento para contatos selecionados, sem reenviar para quem já decidiu
 * ou já recebeu solicitação anteriormente.
 */
export async function POST(request: Request) {
  const companyId = await getCompanyIdFromRequest(request);
  if (!companyId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { contact_ids?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const contactIds = Array.isArray(body?.contact_ids)
    ? body.contact_ids.map((v) => String(v || "").trim()).filter(Boolean)
    : [];
  if (contactIds.length === 0) {
    return NextResponse.json({ error: "contact_ids é obrigatório" }, { status: 400 });
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("channel_contacts")
    .select("id, channel_id, phone, jid, contact_name, first_name")
    .eq("company_id", companyId)
    .in("id", contactIds);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const rows = (data ?? []) as Array<{
    id: string;
    channel_id: string;
    phone: string | null;
    jid: string | null;
    contact_name: string | null;
    first_name: string | null;
  }>;

  let sent = 0;
  let skipped = 0;
  let failed = 0;
  const skipReasons: Record<string, number> = {};
  const errors: string[] = [];

  for (const row of rows) {
    const phoneOrJid = String(row.phone || row.jid || "").trim();
    if (!phoneOrJid) {
      skipped += 1;
      skipReasons.invalid_phone = (skipReasons.invalid_phone ?? 0) + 1;
      continue;
    }
    const result = await sendAutoConsentIfNeeded({
      companyId,
      channelId: row.channel_id,
      phoneOrJid,
      name: row.contact_name || row.first_name || null,
      reason: "manual_bulk",
    });
    if (result.sent) {
      sent += 1;
      continue;
    }
    if (result.error) {
      failed += 1;
      if (errors.length < 5) errors.push(result.error);
      continue;
    }
    skipped += 1;
    const reason = String(result.skipped || "skipped");
    skipReasons[reason] = (skipReasons[reason] ?? 0) + 1;
  }

  return NextResponse.json({
    ok: true,
    total: rows.length,
    sent,
    skipped,
    failed,
    skip_reasons: skipReasons,
    errors,
  });
}
