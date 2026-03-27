import { getCompanyIdFromRequest } from "@/lib/auth/get-company";
import { requirePermission } from "@/lib/auth/get-profile";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const companyId = await getCompanyIdFromRequest(request);
  if (!companyId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const permErr = await requirePermission(companyId, PERMISSIONS.campaigns.view);
  if (permErr) return NextResponse.json({ error: permErr.error }, { status: permErr.status });

  const { searchParams } = new URL(request.url);
  const channelId = searchParams.get("channel_id")?.trim();
  const limit = Math.min(Math.max(Number(searchParams.get("limit") ?? 200), 1), 1000);

  const supabase = await createClient();
  let q = supabase
    .from("channel_contacts")
    .select("id, contact_name, first_name, phone, jid, opt_in_at, opt_out_at, opt_in_source")
    .eq("company_id", companyId)
    .order("synced_at", { ascending: false })
    .limit(limit);

  if (channelId) q = q.eq("channel_id", channelId);

  const { data, error } = await q;
  if (error) {
    if (String(error.message || "").toLowerCase().includes("opt_in_at")) {
      return NextResponse.json({ error: "Campos de consentimento não encontrados. Rode a migration de opt-in." }, { status: 400 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(Array.isArray(data) ? data : []);
}

export async function PATCH(request: Request) {
  const companyId = await getCompanyIdFromRequest(request);
  if (!companyId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const permErr = await requirePermission(companyId, PERMISSIONS.campaigns.manage);
  if (permErr) return NextResponse.json({ error: permErr.error }, { status: permErr.status });

  let body: {
    contact_id?: string;
    set_opt_in?: boolean;
    set_opt_out?: boolean;
    opt_in_source?: string;
    opt_out_reason?: string;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const contactId = typeof body?.contact_id === "string" ? body.contact_id.trim() : "";
  if (!contactId) return NextResponse.json({ error: "contact_id is required" }, { status: 400 });

  const now = new Date().toISOString();
  const updatePayload: Record<string, unknown> = {};

  if (body.set_opt_in === true) {
    updatePayload.opt_in_at = now;
    updatePayload.opt_out_at = null;
    updatePayload.opt_out_reason = null;
    updatePayload.opt_in_source = (body.opt_in_source || "manual_panel").toString().trim().slice(0, 100);
  }
  if (body.set_opt_out === true) {
    updatePayload.opt_out_at = now;
    updatePayload.opt_out_reason = (body.opt_out_reason || "manual_opt_out").toString().trim().slice(0, 200);
  }
  if (Object.keys(updatePayload).length === 0) {
    return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("channel_contacts")
    .update(updatePayload)
    .eq("id", contactId)
    .eq("company_id", companyId)
    .select("id, contact_name, first_name, phone, jid, opt_in_at, opt_out_at, opt_in_source")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
