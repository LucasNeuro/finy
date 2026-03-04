import { getCompanyIdFromRequest } from "@/lib/auth/get-company";
import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

/**
 * GET /api/groups/assignments?channel_id=xxx&group_jid=xxx
 * Retorna user_ids dos atendentes atribuídos ao grupo.
 */
export async function GET(request: Request) {
  const companyId = await getCompanyIdFromRequest(request);
  if (!companyId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { searchParams } = new URL(request.url);
  const channelId = searchParams.get("channel_id")?.trim();
  const groupJid = searchParams.get("group_jid")?.trim();
  if (!channelId || !groupJid) {
    return NextResponse.json(
      { error: "channel_id e group_jid são obrigatórios" },
      { status: 400 }
    );
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("channel_group_assignments")
    .select("user_id")
    .eq("channel_id", channelId)
    .eq("company_id", companyId)
    .eq("group_jid", groupJid);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  const user_ids = (data ?? []).map((r) => r.user_id);
  return NextResponse.json({ user_ids });
}

/**
 * PUT /api/groups/assignments
 * Body: { channel_id: string, group_jid: string, user_ids: string[] }
 * Substitui a lista de atendentes atribuídos ao grupo (user_ids = auth.users.id).
 */
export async function PUT(request: Request) {
  const companyId = await getCompanyIdFromRequest(request);
  if (!companyId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  let body: { channel_id?: string; group_jid?: string; user_ids?: string[] };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const channelId = typeof body?.channel_id === "string" ? body.channel_id.trim() : "";
  const groupJid = typeof body?.group_jid === "string" ? body.group_jid.trim() : "";
  const userIds = Array.isArray(body?.user_ids)
    ? body.user_ids.filter((id): id is string => typeof id === "string").map((id) => id.trim()).filter(Boolean)
    : [];
  if (!channelId || !groupJid) {
    return NextResponse.json(
      { error: "channel_id e group_jid são obrigatórios" },
      { status: 400 }
    );
  }

  const supabase = await createClient();
  const { error: delError } = await supabase
    .from("channel_group_assignments")
    .delete()
    .eq("channel_id", channelId)
    .eq("company_id", companyId)
    .eq("group_jid", groupJid);
  if (delError) {
    return NextResponse.json({ error: delError.message }, { status: 500 });
  }
  if (userIds.length > 0) {
    const rows = userIds.map((user_id) => ({
      channel_id: channelId,
      company_id: companyId,
      group_jid: groupJid,
      user_id,
    }));
    const { error: insError } = await supabase.from("channel_group_assignments").insert(rows);
    if (insError) {
      return NextResponse.json({ error: insError.message }, { status: 500 });
    }
  }
  return NextResponse.json({ ok: true, user_ids: userIds });
}
