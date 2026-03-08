import { getCompanyIdFromRequest } from "@/lib/auth/get-company";
import { getInstanceStatus } from "@/lib/uazapi/client";
import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

/**
 * GET /api/uazapi/instance/status?token=xxx
 * GET /api/uazapi/instance/status?channel_id=xxx
 * Retorna status da instância (qrcode atualizado, connected, etc).
 */
export async function GET(request: Request) {
  const companyId = await getCompanyIdFromRequest(request);
  if (!companyId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  let token = searchParams.get("token")?.trim() ?? undefined;
  const channelId = searchParams.get("channel_id")?.trim();

  if (!token && channelId) {
    const supabase = await createClient();
    const { data: ch } = await supabase
      .from("channels")
      .select("id, uazapi_token_encrypted")
      .eq("id", channelId)
      .eq("company_id", companyId)
      .single();
    if (!ch?.uazapi_token_encrypted) {
      return NextResponse.json({ error: "Channel not found or token missing" }, { status: 404 });
    }
    token = ch.uazapi_token_encrypted;
  }

  if (!token) {
    return NextResponse.json({ error: "token or channel_id is required" }, { status: 400 });
  }

  const result = await getInstanceStatus(token);

  if (!result.ok) {
    return NextResponse.json(
      { error: result.error ?? "Failed to get status" },
      { status: 502 }
    );
  }

  // Número WhatsApp conectado (jid ex: 5511999999999@s.whatsapp.net)
  const jid = result.status?.jid;
  const connectedNumber =
    typeof jid === "string" && jid
      ? jid.replace(/@s\.whatsapp\.net$/i, "").trim() || undefined
      : undefined;

  return NextResponse.json({
    instance: result.instance,
    status: result.status,
    qrcode: result.instance?.qrcode,
    paircode: result.instance?.paircode,
    connected: result.status?.connected ?? !!connectedNumber,
    loggedIn: result.status?.loggedIn ?? !!connectedNumber,
    connectedNumber: connectedNumber || undefined,
  });
}
