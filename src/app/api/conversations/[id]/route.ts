import { getCompanyIdFromCookie } from "@/lib/auth/get-company";
import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const companyId = await getCompanyIdFromCookie();
  if (!companyId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await params;
  const supabase = await createClient();
  const { data: conversation, error: convError } = await supabase
    .from("conversations")
    .select("id, channel_id, external_id, customer_phone, customer_name, queue_id, assigned_to, status, last_message_at, created_at")
    .eq("id", id)
    .eq("company_id", companyId)
    .single();
  if (convError || !conversation) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const { data: messages, error: msgError } = await supabase
    .from("messages")
    .select("id, direction, content, external_id, sent_at, created_at")
    .eq("conversation_id", id)
    .order("sent_at", { ascending: true });
  if (msgError) {
    return NextResponse.json({ error: msgError.message }, { status: 500 });
  }
  return NextResponse.json({ ...conversation, messages: messages ?? [] });
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const companyId = await getCompanyIdFromCookie();
  if (!companyId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await params;
  let body: { assigned_to?: string | null; status?: string; queue_id?: string | null };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const supabase = await createClient();
  const { data: existing, error: fetchError } = await supabase
    .from("conversations")
    .select("id")
    .eq("id", id)
    .eq("company_id", companyId)
    .single();
  if (fetchError || !existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (body.assigned_to !== undefined) {
    updates.assigned_to = body.assigned_to === null || body.assigned_to === "" ? null : body.assigned_to;
  }
  if (typeof body.status === "string" && body.status.trim()) {
    updates.status = body.status.trim();
  }
  if (body.queue_id !== undefined) {
    updates.queue_id = body.queue_id === null || body.queue_id === "" ? null : body.queue_id;
  }

  const { data: updated, error: updateError } = await supabase
    .from("conversations")
    .update(updates)
    .eq("id", id)
    .eq("company_id", companyId)
    .select("id, channel_id, external_id, customer_phone, customer_name, queue_id, assigned_to, status, last_message_at, created_at, updated_at")
    .single();
  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }
  return NextResponse.json(updated);
}
