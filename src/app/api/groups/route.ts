import { getCompanyIdFromRequest } from "@/lib/auth/get-company";
import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

/**
 * GET /api/groups?channel_id=xxx (opcional)
 * Lista grupos da empresa, opcionalmente filtrados por canal.
 */
export async function GET(request: Request) {
  const companyId = await getCompanyIdFromRequest(request);
  if (!companyId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const channelId = searchParams.get("channel_id")?.trim();

  const supabase = await createClient();
  let q = supabase
    .from("channel_groups")
    .select("id, channel_id, jid, name, topic, invite_link, synced_at")
    .eq("company_id", companyId)
    .order("name");

  if (channelId) {
    q = q.eq("channel_id", channelId);
  }

  const { data, error } = await q;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json(data ?? []);
}
