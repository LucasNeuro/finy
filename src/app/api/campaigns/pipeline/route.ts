import { getCompanyIdFromRequest } from "@/lib/auth/get-company";
import { requirePermission } from "@/lib/auth/get-profile";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { toCanonicalDigits } from "@/lib/phone-canonical";
import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

type CreatePipelineBody = {
  name?: string;
  contact_ids?: string[];
  channel_id?: string;
  batch_plan?: string;
  interval_minutes?: number;
  window_start?: string;
  window_end?: string;
};

type ContactRow = {
  id: string;
  channel_id: string;
  phone: string | null;
  jid: string | null;
  contact_name: string | null;
  first_name: string | null;
  opt_in_at: string | null;
  opt_out_at: string | null;
};

function parseBatchPlan(raw: string | undefined): number[] {
  if (!raw) return [];
  return raw
    .split(/[,\s;]+/)
    .map((v) => Number(v))
    .filter((v) => Number.isFinite(v) && v > 0)
    .map((v) => Math.floor(v))
    .slice(0, 20);
}

function classifyContact(row: ContactRow): { eligible: boolean; reason?: string; digits: string | null } {
  const digits = toCanonicalDigits(row.phone ?? row.jid?.replace(/@.*$/, "") ?? "");
  if (!digits) return { eligible: false, reason: "invalid_number", digits: null };
  if (row.opt_out_at) return { eligible: false, reason: "opted_out", digits };
  if (!row.opt_in_at) return { eligible: false, reason: "missing_opt_in", digits };
  return { eligible: true, digits };
}

export async function GET(request: Request) {
  const companyId = await getCompanyIdFromRequest(request);
  if (!companyId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const permErr = await requirePermission(companyId, PERMISSIONS.campaigns.view);
  if (permErr) return NextResponse.json({ error: permErr.error }, { status: permErr.status });

  const { searchParams } = new URL(request.url);
  const channelId = searchParams.get("channel_id")?.trim();
  const limit = Math.min(100, Math.max(1, Number(searchParams.get("limit") || 20)));
  const supabase = await createClient();

  let query = supabase
    .from("campaign_pipeline_drafts")
    .select("id, name, stage, total_contacts, eligible_contacts, blocked_contacts, created_at, updated_at, channel_id")
    .eq("company_id", companyId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (channelId) query = query.eq("channel_id", channelId);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(Array.isArray(data) ? data : []);
}

export async function POST(request: Request) {
  const companyId = await getCompanyIdFromRequest(request);
  if (!companyId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const permErr = await requirePermission(companyId, PERMISSIONS.campaigns.manage);
  if (permErr) return NextResponse.json({ error: permErr.error }, { status: permErr.status });

  let body: CreatePipelineBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const name = String(body.name ?? "").trim();
  const contactIds = Array.from(new Set(Array.isArray(body.contact_ids) ? body.contact_ids.map(String).filter(Boolean) : []));
  const channelId = String(body.channel_id ?? "").trim();
  if (!name) return NextResponse.json({ error: "name is required" }, { status: 400 });
  if (!channelId) return NextResponse.json({ error: "channel_id is required" }, { status: 400 });
  if (contactIds.length === 0) return NextResponse.json({ error: "contact_ids is required" }, { status: 400 });
  if (contactIds.length > 10_000) return NextResponse.json({ error: "Too many contacts selected" }, { status: 400 });

  const supabase = await createClient();
  const { data: authData } = await supabase.auth.getUser();
  const createdBy = authData.user?.id ?? null;

  const { data: channelRow, error: channelErr } = await supabase
    .from("channels")
    .select("id")
    .eq("company_id", companyId)
    .eq("id", channelId)
    .maybeSingle();
  if (channelErr) return NextResponse.json({ error: channelErr.message }, { status: 500 });
  if (!channelRow) return NextResponse.json({ error: "Canal inválido para esta empresa." }, { status: 400 });

  const { data: contactsData, error: contactsErr } = await supabase
    .from("channel_contacts")
    .select("id, channel_id, phone, jid, contact_name, first_name, opt_in_at, opt_out_at")
    .eq("company_id", companyId)
    .eq("channel_id", channelId)
    .in("id", contactIds);

  if (contactsErr) {
    if (String(contactsErr.message || "").toLowerCase().includes("opt_in_at")) {
      return NextResponse.json({ error: "Campos de consentimento não encontrados. Execute a migration de opt-in." }, { status: 400 });
    }
    return NextResponse.json({ error: contactsErr.message }, { status: 500 });
  }

  const selectedContacts = (contactsData ?? []) as ContactRow[];
  if (selectedContacts.length === 0) {
    return NextResponse.json({ error: "Nenhum contato válido encontrado para a seleção." }, { status: 400 });
  }

  const eligibleContactIds: string[] = [];
  const blockedContacts: Array<{
    id: string;
    name: string;
    phone: string | null;
    reason: string;
  }> = [];

  for (const row of selectedContacts) {
    const classified = classifyContact(row);
    const displayName = (row.contact_name || row.first_name || row.phone || row.jid || row.id).trim();
    if (classified.eligible) {
      eligibleContactIds.push(row.id);
    } else {
      blockedContacts.push({
        id: row.id,
        name: displayName,
        phone: classified.digits,
        reason: classified.reason ?? "blocked",
      });
    }
  }

  const batchPlan = parseBatchPlan(body.batch_plan);
  const intervalMinutes = Math.max(1, Number(body.interval_minutes) || 10);
  const windowStart = String(body.window_start ?? "").trim();
  const windowEnd = String(body.window_end ?? "").trim();

  const snapshot = {
    selected_contact_ids: contactIds,
    eligible_contact_ids: eligibleContactIds,
    blocked_contacts: blockedContacts,
  };

  const { data: inserted, error: insertErr } = await supabase
    .from("campaign_pipeline_drafts")
    .insert({
      company_id: companyId,
      channel_id: channelId,
      name,
      stage: "segmented",
      segment: {
        source: "contacts_selection",
        selected_contact_ids: contactIds,
      },
      batching: {
        plan: batchPlan,
        interval_minutes: intervalMinutes,
      },
      send_window: {
        start: windowStart || null,
        end: windowEnd || null,
      },
      snapshot,
      total_contacts: contactIds.length,
      eligible_contacts: eligibleContactIds.length,
      blocked_contacts: blockedContacts.length,
      created_by: createdBy,
    })
    .select("id, name, stage, total_contacts, eligible_contacts, blocked_contacts, created_at")
    .single();

  if (insertErr) return NextResponse.json({ error: insertErr.message }, { status: 500 });

  return NextResponse.json({
    draft: inserted,
    totals: {
      selected: contactIds.length,
      eligible: eligibleContactIds.length,
      blocked: blockedContacts.length,
    },
    blocked_preview: blockedContacts.slice(0, 50),
    note: "Rascunho salvo. Nenhum envio foi iniciado.",
  });
}
