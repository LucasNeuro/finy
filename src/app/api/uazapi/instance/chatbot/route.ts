import { getCompanyIdFromRequest } from "@/lib/auth/get-company";
import { getChannelToken } from "@/lib/uazapi/channel-token";
import { updateChatbotSettings } from "@/lib/uazapi/client";
import { NextResponse } from "next/server";

/**
 * POST /api/uazapi/instance/chatbot
 * Atualiza configurações do chatbot da instância.
 * Body: {
 *   channel_id,
 *   openai_apikey?,
 *   chatbot_enabled?,
 *   chatbot_ignoreGroups?,
 *   chatbot_stopConversation?,
 *   chatbot_stopMinutes?,
 *   chatbot_stopWhenYouSendMsg?
 * }
 */
export async function POST(request: Request) {
  const companyId = await getCompanyIdFromRequest(request);
  if (!companyId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const channelId = typeof body?.channel_id === "string" ? body.channel_id.trim() : "";
  if (!channelId) {
    return NextResponse.json({ error: "channel_id is required" }, { status: 400 });
  }

  const resolved = await getChannelToken(channelId, companyId);
  if (!resolved) {
    return NextResponse.json({ error: "Channel not found" }, { status: 404 });
  }

  const settings: Parameters<typeof updateChatbotSettings>[1] = {};
  if (typeof body.openai_apikey === "string") settings.openai_apikey = body.openai_apikey;
  if (typeof body.chatbot_enabled === "boolean") settings.chatbot_enabled = body.chatbot_enabled;
  if (typeof body.chatbot_ignoreGroups === "boolean") settings.chatbot_ignoreGroups = body.chatbot_ignoreGroups;
  if (typeof body.chatbot_stopConversation === "string") settings.chatbot_stopConversation = body.chatbot_stopConversation;
  if (typeof body.chatbot_stopMinutes === "number") settings.chatbot_stopMinutes = body.chatbot_stopMinutes;
  if (typeof body.chatbot_stopWhenYouSendMsg === "number") settings.chatbot_stopWhenYouSendMsg = body.chatbot_stopWhenYouSendMsg;

  if (Object.keys(settings).length === 0) {
    return NextResponse.json(
      { error: "At least one chatbot setting is required" },
      { status: 400 }
    );
  }

  const result = await updateChatbotSettings(resolved.token, settings);
  if (!result.ok) {
    return NextResponse.json(
      { error: result.error ?? "Failed to update chatbot settings" },
      { status: 502 }
    );
  }

  return NextResponse.json(result.instance ?? { ok: true });
}
