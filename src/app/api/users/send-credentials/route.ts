import { getCompanyIdFromRequest } from "@/lib/auth/get-company";
import { requirePermission } from "@/lib/auth/get-profile";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { sendText } from "@/lib/uazapi/client";
import { NextResponse } from "next/server";

function getAppOrigin(request: Request): string {
  const env = process.env.NEXT_PUBLIC_APP_URL ?? process.env.VERCEL_URL;
  if (env) return env.startsWith("http") ? env : `https://${env}`;
  const host = request.headers.get("host") ?? request.headers.get("x-forwarded-host");
  const proto = request.headers.get("x-forwarded-proto") ?? "https";
  return host ? `${proto}://${host}` : "https://app.clicvend.com.br";
}

/**
 * POST: envia credenciais de acesso (e-mail + senha) por WhatsApp para o usuário.
 * Apenas ADM/Owner (users.manage). Usa o primeiro canal da empresa com token Uazapi.
 * Body: { user_id: string, password: string, phone?: string }
 * Se phone não for enviado, usa o phone do perfil (obrigatório ter um).
 */
export async function POST(request: Request) {
  const companyId = await getCompanyIdFromRequest(request);
  if (!companyId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const err = await requirePermission(companyId, PERMISSIONS.users.manage);
  if (err) return NextResponse.json({ error: err.error }, { status: err.status });

  let body: { user_id?: string; password?: string; phone?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const userId = typeof body?.user_id === "string" ? body.user_id.trim() : "";
  const password = typeof body?.password === "string" ? body.password : "";
  const phoneOverride = typeof body?.phone === "string" ? body.phone.replace(/\D/g, "").trim() : null;

  if (!userId) return NextResponse.json({ error: "user_id é obrigatório" }, { status: 400 });
  if (!password) return NextResponse.json({ error: "password é obrigatório para enviar credenciais" }, { status: 400 });

  const supabase = await createClient();
  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("id, user_id, email, phone")
    .eq("user_id", userId)
    .eq("company_id", companyId)
    .single();

  if (profileError || !profile) {
    return NextResponse.json({ error: "Usuário não encontrado" }, { status: 404 });
  }

  const phone = phoneOverride || (profile.phone ?? "").replace(/\D/g, "").trim();
  if (!phone || phone.length < 10) {
    return NextResponse.json(
      { error: "Informe o telefone WhatsApp do usuário no cadastro ou no envio para receber as credenciais." },
      { status: 400 }
    );
  }

  const admin = createServiceRoleClient();
  const { data: channel, error: chError } = await admin
    .from("channels")
    .select("id, uazapi_token_encrypted")
    .eq("company_id", companyId)
    .eq("is_active", true)
    .not("uazapi_token_encrypted", "is", null)
    .limit(1)
    .single();

  if (chError || !channel?.uazapi_token_encrypted) {
    return NextResponse.json(
      { error: "Nenhuma conexão WhatsApp ativa com token configurado. Configure em Conexões." },
      { status: 400 }
    );
  }

  const origin = getAppOrigin(request);
  const loginUrl = `${origin}/login`;
  const email = (profile.email ?? "").trim() || "—";
  const text =
    `*ClicVend – Suas credenciais de acesso*\n\n` +
    `E-mail: ${email}\n` +
    `Senha: ${password}\n\n` +
    `Acesse: ${loginUrl}\n\n` +
    `_Guarde esta mensagem em local seguro. Recomendamos alterar a senha no primeiro acesso._`;

  const result = await sendText(channel.uazapi_token_encrypted, phone, text);
  if (!result.ok) {
    return NextResponse.json(
      { error: "Falha ao enviar pelo WhatsApp. Verifique a conexão.", details: result.error },
      { status: 502 }
    );
  }

  return NextResponse.json({ ok: true, sent_to: phone });
}
