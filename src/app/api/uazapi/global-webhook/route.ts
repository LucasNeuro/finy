import { getCompanyIdFromCookie } from "@/lib/auth/get-company";
import { setGlobalWebhook, getGlobalWebhook, UAZ_WEBHOOK_DEFAULT_EVENTS } from "@/lib/uazapi/client";
import { NextResponse } from "next/server";

/**
 * GET /api/uazapi/global-webhook
 * Retorna a configuração atual do webhook global no servidor UAZAPI.
 */
export async function GET() {
  const companyId = await getCompanyIdFromCookie();
  if (!companyId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await getGlobalWebhook();
  if (!result.ok) {
    return NextResponse.json(
      { error: result.error ?? "Failed to get global webhook" },
      { status: 502 }
    );
  }

  return NextResponse.json({
    ok: true,
    config: result.data,
  });
}

/**
 * POST /api/uazapi/global-webhook
 * Configura o webhook global no servidor UAZAPI (uma URL para todas as instâncias).
 *
 * URL do webhook:
 * - Se UAZAPI_WEBHOOK_URL estiver definida (ex.: Edge Function), usa ela.
 * - Senão usa {NEXT_PUBLIC_APP_URL ou origin}/api/webhook/uazapi (Next.js).
 *
 * Configure uma vez; novas conexões não precisam chamar setWebhook por instância.
 *
 * Eventos incluem `history` para a UAZ enviar histórico ao webhook (necessário para mensagens antigas
 * aparecerem no servidor UAZ e no botão de importar do chat).
 */
export async function POST(request: Request) {
  const companyId = await getCompanyIdFromCookie();
  if (!companyId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let webhookUrl = process.env.UAZAPI_WEBHOOK_URL?.trim();
  if (!webhookUrl) {
    const baseUrl =
      process.env.NEXT_PUBLIC_APP_URL ||
      process.env.VERCEL_URL ||
      request.headers.get("x-forwarded-host") ||
      request.headers.get("host") ||
      "";
    const protocol = baseUrl.includes("localhost") ? "http" : "https";
    const host = baseUrl.replace(/^https?:\/\//, "").split("/")[0] || "localhost:3000";
    webhookUrl = `${protocol}://${host}/api/webhook/uazapi`;
  } else {
    webhookUrl = webhookUrl.replace(/\/$/, "");
  }

  const result = await setGlobalWebhook(webhookUrl, {
    events: [...UAZ_WEBHOOK_DEFAULT_EVENTS],
    excludeMessages: ["wasSentByApi"],
  });

  if (!result.ok) {
    return NextResponse.json(
      { error: result.error ?? "Failed to set global webhook" },
      { status: 502 }
    );
  }

  return NextResponse.json({
    ok: true,
    webhookUrl,
    message: "Global webhook configured. New instances will use it automatically.",
  });
}
