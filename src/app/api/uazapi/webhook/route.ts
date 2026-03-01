import { getCompanyIdFromCookie } from "@/lib/auth/get-company";
import { setWebhook } from "@/lib/uazapi/client";
import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

/**
 * POST /api/uazapi/webhook
 * Configura webhook da instância para a URL do nosso backend.
 * Body: { channel_id: string } ou { token: string }
 * URL do webhook: {NEXT_PUBLIC_APP_URL ou request origin}/api/webhook/uazapi
 */
export async function POST(request: Request) {
  const companyId = await getCompanyIdFromCookie();
  if (!companyId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { channel_id?: string; token?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  let token: string | undefined = typeof body?.token === "string" ? body.token.trim() : undefined;
  if (!token && body?.channel_id) {
    const supabase = await createClient();
    const { data: ch } = await supabase
      .from("channels")
      .select("id, uazapi_token_encrypted")
      .eq("id", body.channel_id)
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

  const baseUrl =
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.VERCEL_URL ||
    request.headers.get("x-forwarded-host") ||
    request.headers.get("host") ||
    "";
  const protocol = baseUrl.includes("localhost") ? "http" : "https";
  const host = baseUrl.replace(/^https?:\/\//, "").split("/")[0] || "localhost:3000";
  const webhookUrl = `${protocol}://${host}/api/webhook/uazapi`;

  const result = await setWebhook(token, webhookUrl, {
    events: ["messages", "connection"],
    excludeMessages: ["wasSentByApi"],
  });

  if (!result.ok) {
    return NextResponse.json(
      { error: result.error ?? "Failed to set webhook" },
      { status: 502 }
    );
  }

  return NextResponse.json({
    ok: true,
    webhookUrl,
    message: "Webhook configured",
  });
}
