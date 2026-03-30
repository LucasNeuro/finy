import { createServiceRoleClient } from "@/lib/supabase/admin";
import {
  generateOwnerResetNumericCode,
  hashOwnerResetCode,
  isLikelyBrazilCellular,
  normalizeBrazilPhoneDigits,
} from "@/lib/auth/owner-password-reset";
import { sendText } from "@/lib/uazapi/client";
import { NextResponse } from "next/server";

const GENERIC_OK =
  "Se este e-mail for de um administrador cadastrado e houver WhatsApp vinculado, enviaremos um código em instantes.";

function str(v: unknown): string | undefined {
  return typeof v === "string" && v.trim() ? v.trim().toLowerCase() : undefined;
}

/**
 * POST /api/auth/password-reset/whatsapp/request
 * Envia código de 6 dígitos ao WhatsApp do proprietário (profile.is_owner + profile.phone).
 * Requer FINY_PASSWORD_RESET_UAZAPI_TOKEN (instância UAZ da plataforma para disparo).
 */
export async function POST(request: Request) {
  let body: { email?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const email = str(body?.email);
  if (!email || !email.includes("@")) {
    return NextResponse.json({ error: "Informe um e-mail válido." }, { status: 400 });
  }

  const senderToken = process.env.FINY_PASSWORD_RESET_UAZAPI_TOKEN?.trim();
  if (!senderToken) {
    return NextResponse.json(
      { error: "Recuperação por WhatsApp não configurada no servidor." },
      { status: 503 }
    );
  }

  const admin = createServiceRoleClient();

  const { data: profile } = await admin
    .from("profiles")
    .select("user_id, phone")
    .eq("is_owner", true)
    .eq("email", email)
    .maybeSingle();

  if (!profile?.user_id || !profile.phone) {
    return NextResponse.json({ ok: true, message: GENERIC_OK });
  }

  const phoneDigits = normalizeBrazilPhoneDigits(profile.phone);
  if (!isLikelyBrazilCellular(phoneDigits)) {
    return NextResponse.json({ ok: true, message: GENERIC_OK });
  }

  const { data: authUser, error: authErr } = await admin.auth.admin.getUserById(profile.user_id);
  if (authErr || !authUser.user?.email || authUser.user.email.toLowerCase() !== email) {
    return NextResponse.json({ ok: true, message: GENERIC_OK });
  }

  const { data: recent } = await admin
    .from("owner_password_reset_challenges")
    .select("id, created_at")
    .eq("user_id", profile.user_id)
    .is("consumed_at", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (recent?.created_at) {
    const elapsed = Date.now() - new Date(recent.created_at).getTime();
    if (elapsed < 60_000) {
      return NextResponse.json(
        { error: "Aguarde cerca de um minuto antes de solicitar outro código." },
        { status: 429 }
      );
    }
  }

  const { count: hourCount } = await admin
    .from("owner_password_reset_challenges")
    .select("id", { count: "exact", head: true })
    .eq("user_id", profile.user_id)
    .gte("created_at", new Date(Date.now() - 60 * 60 * 1000).toISOString());

  if ((hourCount ?? 0) >= 10) {
    return NextResponse.json(
      { error: "Muitas tentativas. Tente novamente em uma hora ou fale com o suporte." },
      { status: 429 }
    );
  }

  await admin
    .from("owner_password_reset_challenges")
    .update({ consumed_at: new Date().toISOString() })
    .eq("user_id", profile.user_id)
    .is("consumed_at", null);

  const code = generateOwnerResetNumericCode();
  const codeHash = hashOwnerResetCode(code);
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();

  const { data: inserted, error: insErr } = await admin
    .from("owner_password_reset_challenges")
    .insert({
      user_id: profile.user_id,
      code_hash: codeHash,
      expires_at: expiresAt,
      attempts: 0,
    })
    .select("id")
    .single();

  if (insErr || !inserted?.id) {
    return NextResponse.json({ error: "Não foi possível gerar o código. Tente novamente." }, { status: 500 });
  }

  const msg = `ClicVend: seu código para redefinir a senha é ${code}. Válido por 15 minutos. Não compartilhe com ninguém.`;
  const send = await sendText(senderToken, phoneDigits, msg, { linkPreview: false });

  if (!send.ok) {
    await admin
      .from("owner_password_reset_challenges")
      .update({ consumed_at: new Date().toISOString() })
      .eq("id", inserted.id);
    return NextResponse.json(
      { error: "Falha ao enviar o WhatsApp. Verifique o número no cadastro ou tente mais tarde." },
      { status: 502 }
    );
  }

  return NextResponse.json({ ok: true, message: GENERIC_OK });
}
