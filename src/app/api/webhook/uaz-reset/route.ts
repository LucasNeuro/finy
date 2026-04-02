import { NextResponse } from "next/server";

/**
 * Webhook dedicado à instância UAZ "Resend_senha" (reset de senha do owner).
 * Separado de /api/webhook/uazapi para não criar conversas nem misturar com atendimento.
 *
 * Configuração UAZ (instância reset):
 * - Habilitado: sim
 * - POST
 * - URL: https://SEU_DOMINIO/api/webhook/uaz-reset?secret=SUA_SENHA_LONGA
 *   (a UAZ costuma não enviar headers customizados; o segredo na query é o mais simples)
 * - Escutar eventos: messages (suficiente se for só monitorar/eco; para só enviar OTP pela API, webhook pode ficar desligado)
 * - Excluir: wasSentByApi
 * - addUrlEvents / addUrlTypesMessages: desligados (URL fixa, igual ao webhook principal)
 *
 * Render / .env:
 * - UAZ_RESET_WEBHOOK_SECRET  (obrigatório para aceitar POST)
 * - UAZ_RESET_EXPECTED_INSTANCE_ID  (opcional; se definido, rejeita payload de outra instância)
 *
 * Envio do código WhatsApp (outra rota / job): use UAZAPI_RESET_BASE_URL + UAZAPI_RESET_INSTANCE_TOKEN com sendText.
 */

export const maxDuration = 30;

function getExpectedSecret(): string | undefined {
  return process.env.UAZ_RESET_WEBHOOK_SECRET?.trim();
}

function isAuthorized(request: Request): boolean {
  const expected = getExpectedSecret();
  if (!expected) return false;
  const url = new URL(request.url);
  const fromQuery =
    url.searchParams.get("secret")?.trim() || url.searchParams.get("token")?.trim();
  const fromHeader = request.headers.get("x-uaz-reset-webhook-secret")?.trim();
  return fromQuery === expected || fromHeader === expected;
}

export async function GET() {
  return NextResponse.json({
    ok: true,
    service: "uaz-reset-webhook",
    post_hint:
      "POST com JSON da UAZ; obrigatório UAZ_RESET_WEBHOOK_SECRET no servidor e ?secret=... na URL ou header x-uaz-reset-webhook-secret",
  });
}

export async function POST(request: Request) {
  const secretConfigured = getExpectedSecret();
  if (!secretConfigured) {
    return NextResponse.json(
      { error: "UAZ_RESET_WEBHOOK_SECRET não configurado no servidor (Render → Environment)." },
      { status: 503 }
    );
  }

  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    body = null;
  }

  const expectedInstance = process.env.UAZ_RESET_EXPECTED_INSTANCE_ID?.trim();
  if (expectedInstance && body && typeof body === "object" && "instance" in body) {
    const inst = String((body as { instance?: string }).instance ?? "").trim();
    if (inst && inst !== expectedInstance) {
      return NextResponse.json({ error: "Instance mismatch" }, { status: 403 });
    }
  }

  if (process.env.NODE_ENV === "development" && body != null) {
    const preview = JSON.stringify(body);
    console.info("[webhook/uaz-reset]", preview.length > 800 ? `${preview.slice(0, 800)}…` : preview);
  }

  // Aqui você pode evoluir: correlacionar resposta do usuário no WhatsApp com OTP pendente no Supabase.
  return NextResponse.json({ ok: true, received: true });
}
