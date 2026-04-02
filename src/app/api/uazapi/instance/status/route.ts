import { getCompanyIdFromRequest } from "@/lib/auth/get-company";
import { getInstanceStatus } from "@/lib/uazapi/client";
import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

function asRecord(v: unknown): Record<string, unknown> | undefined {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : undefined;
}

function flagTrue(v: unknown): boolean {
  return v === true || v === "true" || v === 1 || v === "1";
}

/** UAZAPI pode devolver connected/loggedIn, state open, ou só jid quando a sessão está ativa. */
function inferUazConnected(
  statusObj: Record<string, unknown> | undefined,
  instanceObj: Record<string, unknown> | undefined,
  jid: unknown
): { connected: boolean; loggedIn: boolean } {
  if (flagTrue(statusObj?.connected) || flagTrue(statusObj?.loggedIn) || flagTrue(instanceObj?.connected)) {
    return { connected: true, loggedIn: true };
  }
  const state = String(statusObj?.state ?? instanceObj?.state ?? statusObj?.status ?? instanceObj?.status ?? "")
    .toLowerCase()
    .trim();
  if (["open", "connected", "loggedin", "authenticated", "online"].includes(state)) {
    return { connected: true, loggedIn: true };
  }
  const phone = asRecord(statusObj?.phone) ?? asRecord(instanceObj?.phone);
  if (phone && (flagTrue(phone.wa_connected) || flagTrue(phone.connected))) {
    return { connected: true, loggedIn: true };
  }
  if (typeof jid === "string" && jid.includes("@s.whatsapp.net")) {
    return { connected: true, loggedIn: true };
  }
  if (typeof jid === "string" && jid.includes("@lid")) {
    return { connected: true, loggedIn: true };
  }
  return { connected: false, loggedIn: false };
}

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

  // Número WhatsApp conectado (jid ex: 5511999999999@s.whatsapp.net ou @lid)
  const statusRec = asRecord(result.status) ?? {};
  const instanceRec = asRecord(result.instance) ?? {};
  const jidRaw = statusRec.jid ?? instanceRec.jid;
  const jidStr = typeof jidRaw === "string" ? jidRaw.trim() : "";
  const connectedNumber =
    jidStr && jidStr.toLowerCase().endsWith("@s.whatsapp.net")
      ? jidStr.replace(/@s\.whatsapp\.net$/i, "").trim() || undefined
      : undefined;

  const { connected, loggedIn } = inferUazConnected(statusRec, instanceRec, jidRaw);

  return NextResponse.json({
    instance: result.instance,
    status: result.status,
    qrcode: result.instance?.qrcode,
    paircode: result.instance?.paircode,
    connected: connected || Boolean(connectedNumber),
    loggedIn: loggedIn || Boolean(connectedNumber),
    connectedNumber: connectedNumber || undefined,
  });
}
