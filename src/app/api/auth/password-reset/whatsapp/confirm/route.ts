import { createServiceRoleClient } from "@/lib/supabase/admin";
import {
  hashOwnerResetCode,
  MAX_ATTEMPTS,
} from "@/lib/auth/owner-password-reset";
import { NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";

function str(v: unknown): string | undefined {
  return typeof v === "string" && v.trim() ? v.trim().toLowerCase() : undefined;
}

function codesEqual(storedHex: string, attemptHex: string): boolean {
  try {
    const a = Buffer.from(storedHex, "hex");
    const b = Buffer.from(attemptHex, "hex");
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

/**
 * POST /api/auth/password-reset/whatsapp/confirm
 * Body: { email, code (6 dígitos), new_password }
 */
export async function POST(request: Request) {
  if (process.env.ENABLE_OWNER_WHATSAPP_PASSWORD_RESET !== "true") {
    return NextResponse.json(
      { error: "Recuperação de senha por WhatsApp está temporariamente desativada." },
      { status: 503 }
    );
  }

  let body: { email?: string; code?: string; new_password?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const email = str(body?.email);
  const codeRaw = typeof body?.code === "string" ? body.code.replace(/\D/g, "").trim() : "";
  const newPassword = typeof body?.new_password === "string" ? body.new_password : "";

  if (!email || !email.includes("@")) {
    return NextResponse.json({ error: "E-mail inválido." }, { status: 400 });
  }
  if (codeRaw.length !== 6) {
    return NextResponse.json({ error: "Informe o código de 6 dígitos." }, { status: 400 });
  }
  if (newPassword.length < 6) {
    return NextResponse.json({ error: "A nova senha deve ter no mínimo 6 caracteres." }, { status: 400 });
  }

  const admin = createServiceRoleClient();

  const { data: profile } = await admin
    .from("profiles")
    .select("user_id")
    .eq("is_owner", true)
    .eq("email", email)
    .maybeSingle();

  if (!profile?.user_id) {
    return NextResponse.json({ error: "Código inválido ou expirado." }, { status: 400 });
  }

  const { data: authUser, error: authErr } = await admin.auth.admin.getUserById(profile.user_id);
  if (authErr || !authUser.user?.email || authUser.user.email.toLowerCase() !== email) {
    return NextResponse.json({ error: "Código inválido ou expirado." }, { status: 400 });
  }

  const { data: row, error: rowErr } = await admin
    .from("owner_password_reset_challenges")
    .select("id, code_hash, expires_at, attempts")
    .eq("user_id", profile.user_id)
    .is("consumed_at", null)
    .gt("expires_at", new Date().toISOString())
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (rowErr || !row?.id || !row.code_hash) {
    return NextResponse.json({ error: "Código inválido ou expirado." }, { status: 400 });
  }

  const attemptHash = hashOwnerResetCode(codeRaw);
  const match = codesEqual(row.code_hash, attemptHash);

  if (!match) {
    const nextAttempts = (row.attempts ?? 0) + 1;
    await admin
      .from("owner_password_reset_challenges")
      .update({ attempts: nextAttempts })
      .eq("id", row.id);
    if (nextAttempts >= MAX_ATTEMPTS) {
      await admin
        .from("owner_password_reset_challenges")
        .update({ consumed_at: new Date().toISOString() })
        .eq("id", row.id);
    }
    return NextResponse.json({ error: "Código incorreto." }, { status: 400 });
  }

  const { error: pwdErr } = await admin.auth.admin.updateUserById(profile.user_id, {
    password: newPassword,
  });

  if (pwdErr) {
    return NextResponse.json({ error: pwdErr.message ?? "Não foi possível atualizar a senha." }, { status: 500 });
  }

  await admin
    .from("owner_password_reset_challenges")
    .update({ consumed_at: new Date().toISOString() })
    .eq("id", row.id);

  return NextResponse.json({ ok: true });
}
