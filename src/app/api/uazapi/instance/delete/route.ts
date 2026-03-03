import { getCompanyIdFromRequest } from "@/lib/auth/get-company";
import { requireAdmin } from "@/lib/auth/get-profile";
import { getChannelToken } from "@/lib/uazapi/channel-token";
import { deleteInstance } from "@/lib/uazapi/client";
import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

/**
 * DELETE /api/uazapi/instance/delete?channel_id=xxx
 * Remove a instância da UAZAPI e o canal do banco.
 */
export async function DELETE(request: Request) {
  const companyId = await getCompanyIdFromRequest(request);
  if (!companyId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const adminErr = await requireAdmin(companyId);
  if (adminErr) {
    return NextResponse.json({ error: adminErr.error }, { status: adminErr.status });
  }

  const { searchParams } = new URL(request.url);
  const channelId = searchParams.get("channel_id")?.trim();
  if (!channelId) {
    return NextResponse.json({ error: "channel_id is required" }, { status: 400 });
  }

  const resolved = await getChannelToken(channelId, companyId);
  if (!resolved) {
    return NextResponse.json({ error: "Channel not found" }, { status: 404 });
  }

  const result = await deleteInstance(resolved.token);
  if (!result.ok) {
    return NextResponse.json(
      { error: result.error ?? "Failed to delete instance" },
      { status: 502 }
    );
  }

  const supabase = await createClient();
  await supabase.from("channels").delete().eq("id", channelId).eq("company_id", companyId);

  return NextResponse.json({
    response: "Instance deleted",
    channel_id: channelId,
  });
}
