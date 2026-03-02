import { getCompanyIdFromCookie } from "@/lib/auth/get-company";
import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export type ChannelStats = {
  channel_id: string;
  conversations_count: number;
  messages_count: number;
  open_conversations: number;
};

export async function GET() {
  const companyId = await getCompanyIdFromCookie();
  if (!companyId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = await createClient();

  const { data: channels, error: chError } = await supabase
    .from("channels")
    .select("id")
    .eq("company_id", companyId);

  if (chError || !channels?.length) {
    return NextResponse.json([]);
  }

  const channelIds = channels.map((c) => c.id);
  const stats: ChannelStats[] = [];

  for (const ch of channelIds) {
    const { count: convCount } = await supabase
      .from("conversations")
      .select("id", { count: "exact", head: true })
      .eq("channel_id", ch.id);

    const { count: openCount } = await supabase
      .from("conversations")
      .select("id", { count: "exact", head: true })
      .eq("channel_id", ch.id)
      .eq("status", "open");

    const { data: convs } = await supabase
      .from("conversations")
      .select("id")
      .eq("channel_id", ch.id);

    let msgCount = 0;
    if (convs?.length) {
      const convIds = convs.map((c) => c.id);
      const { count } = await supabase
        .from("messages")
        .select("id", { count: "exact", head: true })
        .in("conversation_id", convIds);
      msgCount = count ?? 0;
    }

    stats.push({
      channel_id: ch.id,
      conversations_count: convCount ?? 0,
      messages_count: msgCount,
      open_conversations: openCount ?? 0,
    });
  }

  return NextResponse.json(stats);
}
