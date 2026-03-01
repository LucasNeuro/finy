import { getCompanyIdFromCookie } from "@/lib/auth/get-company";
import { requireAdmin } from "@/lib/auth/get-profile";
import { getChannelToken } from "@/lib/uazapi/channel-token";
import { updateInstanceName } from "@/lib/uazapi/client";
import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

/**
 * PATCH /api/channels/[id]
 * Atualiza canal: name, queue_id. Se name mudar, sincroniza com UAZAPI.
 * Body: { name?: string, queue_id?: string | null }
 */
export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const companyId = await getCompanyIdFromCookie();
  if (!companyId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const adminErr = await requireAdmin(companyId);
  if (adminErr) {
    return NextResponse.json({ error: adminErr.error }, { status: adminErr.status });
  }

  const { id: channelId } = await context.params;
  if (!channelId) {
    return NextResponse.json({ error: "Channel ID required" }, { status: 400 });
  }

  let body: { name?: string; queue_id?: string | null };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const supabase = await createClient();
  const { data: channel, error: fetchErr } = await supabase
    .from("channels")
    .select("id, name")
    .eq("id", channelId)
    .eq("company_id", companyId)
    .single();

  if (fetchErr || !channel) {
    return NextResponse.json({ error: "Channel not found" }, { status: 404 });
  }

  const updates: { name?: string; queue_id?: string | null; updated_at?: string } = {};

  if (typeof body.name === "string" && body.name.trim()) {
    updates.name = body.name.trim();
    const resolved = await getChannelToken(channelId, companyId);
    if (resolved) {
      const r = await updateInstanceName(resolved.token, updates.name);
      if (!r.ok) {
        return NextResponse.json(
          { error: r.error ?? "Failed to sync name with UAZAPI" },
          { status: 502 }
        );
      }
    }
  }

  if (body.queue_id !== undefined) {
    updates.queue_id = body.queue_id === null || body.queue_id === "" ? null : body.queue_id;
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });
  }

  updates.updated_at = new Date().toISOString();

  const { data: updated, error: updateErr } = await supabase
    .from("channels")
    .update(updates)
    .eq("id", channelId)
    .eq("company_id", companyId)
    .select()
    .single();

  if (updateErr) {
    return NextResponse.json({ error: updateErr.message }, { status: 500 });
  }

  return NextResponse.json(updated);
}
