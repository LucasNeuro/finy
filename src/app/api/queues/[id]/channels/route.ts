import { getCompanyIdFromRequest } from "@/lib/auth/get-company";
import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

/**
 * GET /api/queues/[id]/channels
 * Lista os canais (instâncias) que têm esta fila vinculada, com is_default.
 */
export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const companyId = await getCompanyIdFromRequest(request);
  if (!companyId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: queueId } = await context.params;
  if (!queueId) {
    return NextResponse.json({ error: "Queue ID required" }, { status: 400 });
  }

  const supabase = await createClient();

  const { data: queue } = await supabase
    .from("queues")
    .select("id")
    .eq("id", queueId)
    .eq("company_id", companyId)
    .single();

  if (!queue) {
    return NextResponse.json({ error: "Queue not found" }, { status: 404 });
  }

  const { data: rows, error } = await supabase
    .from("channel_queues")
    .select("channel_id, is_default")
    .eq("queue_id", queueId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const channelIds = (rows ?? []).map((r: { channel_id: string }) => r.channel_id);
  if (channelIds.length === 0) {
    return NextResponse.json({ linked: [] });
  }

  const { data: channelList } = await supabase
    .from("channels")
    .select("id, name")
    .eq("company_id", companyId)
    .in("id", channelIds);

  const channelMap = new Map((channelList ?? []).map((c: { id: string; name: string }) => [c.id, c.name]));
  const linked = (rows ?? [])
    .map((r: { channel_id: string; is_default: boolean }) => ({
      channel_id: r.channel_id,
      channel_name: channelMap.get(r.channel_id) ?? r.channel_id,
      is_default: r.is_default,
    }))
    .filter((r) => channelMap.has(r.channel_id));

  return NextResponse.json({ linked });
}
