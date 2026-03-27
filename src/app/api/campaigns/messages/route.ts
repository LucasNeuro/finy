import { getCompanyIdFromRequest } from "@/lib/auth/get-company";
import { requirePermission } from "@/lib/auth/get-profile";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { getChannelToken } from "@/lib/uazapi/channel-token";
import { callUazSender } from "@/lib/uazapi/sender";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  const companyId = await getCompanyIdFromRequest(request);
  if (!companyId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const permErr = await requirePermission(companyId, PERMISSIONS.campaigns.view);
  if (permErr) return NextResponse.json({ error: permErr.error }, { status: permErr.status });

  let body: {
    channel_id?: string;
    folder_id?: string;
    messageStatus?: "Scheduled" | "Sent" | "Failed";
    page?: number;
    pageSize?: number;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const channelId = typeof body?.channel_id === "string" ? body.channel_id.trim() : "";
  const folderId = typeof body?.folder_id === "string" ? body.folder_id.trim() : "";
  if (!channelId || !folderId) {
    return NextResponse.json({ error: "channel_id and folder_id are required" }, { status: 400 });
  }

  const resolved = await getChannelToken(channelId, companyId);
  if (!resolved) return NextResponse.json({ error: "Channel not found" }, { status: 404 });

  const result = await callUazSender(resolved.token, "/sender/listmessages", {
    method: "POST",
    body: {
      folder_id: folderId,
      ...(body.messageStatus ? { messageStatus: body.messageStatus } : {}),
      page: typeof body.page === "number" ? body.page : 1,
      pageSize: typeof body.pageSize === "number" ? body.pageSize : 30,
    },
  });
  if (!result.ok) {
    return NextResponse.json({ error: result.error ?? "Failed to list campaign messages" }, { status: 502 });
  }

  return NextResponse.json(result.data ?? { messages: [], pagination: { total: 0, page: 1, pageSize: 30, lastPage: 1 } });
}
