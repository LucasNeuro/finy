import { getCompanyIdFromRequest } from "@/lib/auth/get-company";
import { connectInstance } from "@/lib/uazapi/client";
import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

/**
 * POST /api/uazapi/instance/connect
 * Inicia conexão da instância (QR ou pareamento).
 * Body: { token: string } ou { channel_id: string, phone?: string }
 * Se channel_id for enviado, o token é obtido do canal (company_id validado).
 */
export async function POST(request: Request) {
  const companyId = await getCompanyIdFromRequest(request);
  if (!companyId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { token?: string; channel_id?: string; phone?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  let token: string | undefined = typeof body?.token === "string" ? body.token.trim() : undefined;
  const phone = typeof body?.phone === "string" ? body.phone.trim() : undefined;

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

  const result = await connectInstance(token, phone);

  if (!result.ok) {
    return NextResponse.json(
      { error: result.error ?? "Failed to connect instance" },
      { status: 502 }
    );
  }

  return NextResponse.json({
    qrcode: result.qrcode,
    paircode: result.paircode,
    connected: result.connected,
    instance: result.instance,
  });
}
