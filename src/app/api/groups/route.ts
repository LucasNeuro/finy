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
  const pageSize = 1000;
  const allRows: Record<string, unknown>[] = [];
  let offset = 0;
  let hasMore = true;

  while (hasMore) {
    let q = supabase
      .from("channel_groups")
      .select("id, channel_id, jid, name, topic, invite_link, synced_at, left_at, avatar_url")
      .eq("company_id", companyId)
      .order("name")
      .range(offset, offset + pageSize - 1);

    if (channelId) {
      q = q.eq("channel_id", channelId);
    }

    const { data, error } = await q;
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    const chunk = data ?? [];
    allRows.push(...chunk);
    hasMore = chunk.length === pageSize;
    offset += pageSize;
  }

  return NextResponse.json(allRows);
}
