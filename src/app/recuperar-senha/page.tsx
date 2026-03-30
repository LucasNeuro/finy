"use client";

import { useState } from "react";
import Link from "next/link";
import { ClicVendLogo } from "@/components/ClicVendLogo";
import { Eye, EyeOff, Loader2, ArrowRight, ArrowLeft, CheckCircle2 } from "lucide-react";

type Phase = "email" | "code";

export default function RecuperarSenhaPage() {
  const [phase, setPhase] = useState<Phase>("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const inputClass =
    "w-full rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] px-4 py-3.5 text-[#1E293B] placeholder-[#94A3B8] focus:border-[#34B097] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#34B097]/20 transition-all";

  const requestCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const r = await fetch("/api/auth/password-reset/whatsapp/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim().toLowerCase() }),
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) {
        setError(typeof data.error === "string" ? data.error : "Não foi possível enviar o código.");
        setLoading(false);
        return;
      }
      setPhase("code");
    } catch {
      setError("Erro de rede. Tente novamente.");
    } finally {
      setLoading(false);
    }
  };

  const confirmReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (password.length < 6) {
      setError("A senha deve ter no mínimo 6 caracteres.");
      return;
    }
    if (password !== passwordConfirm) {
      setError("As senhas não coincidem.");
      return;
    }
    const digits = code.replace(/\D/g, "");
    if (digits.length !== 6) {
      setError("Informe o código de 6 dígitos recebido no WhatsApp.");
      return;
    }
    setLoading(true);
    try {
      const r = await fetch("/api/auth/password-reset/whatsapp/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: email.trim().toLowerCase(),
          code: digits,
          new_password: password,
        }),
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) {
        setError(typeof data.error === "string" ? data.error : "Não foi possível redefinir a senha.");
        setLoading(false);
        return;
      }
      setDone(true);
    } catch {
      setError("Erro de rede. Tente novamente.");
    } finally {
      setLoading(false);
    }
  };

  if (done) {
    return (
      <div className="flex min-h-screen flex-row-reverse">
        <div className="absolute inset-0 bg-gradient-to-br from-[#0D2B26] via-[#134D45] to-[#1A6B5C] md:relative md:flex-1" />
        <div className="relative z-10 flex w-full min-h-screen flex-col justify-center bg-white p-8 md:w-[55%] md:min-w-[520px] md:max-w-[640px] md:flex-none md:shadow-[8px_0_24px_rgba(0,0,0,0.08)]">
          <div className="mx-auto w-full max-w-md text-center">
            <Link href="/" className="flex justify-center rounded focus:outline-none focus:ring-2 focus:ring-[#34B097] focus:ring-offset-2">
              <ClicVendLogo size="lg" />
            </Link>
            <CheckCircle2 className="mx-auto mt-8 h-14 w-14 text-emerald-500" />
            <h1 className="mt-4 text-xl font-bold text-[#0F172A]">Senha atualizada</h1>
            <p className="mt-2 text-sm text-[#64748B]">Você já pode entrar com o novo acesso.</p>
            <Link
              href="/login"
              className="mt-8 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[#34B097] py-3.5 font-semibold text-white shadow-lg transition-colors hover:bg-[#2D9B85]"
            >
              Ir para o login
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-row-reverse">
      <div className="absolute inset-0 bg-gradient-to-br from-[#0D2B26] via-[#134D45] to-[#1A6B5C] md:relative md:flex-1" />
      <div className="relative z-10 flex w-full min-h-screen flex-col justify-center bg-white p-8 md:w-[55%] md:min-w-[520px] md:max-w-[640px] md:flex-none md:shadow-[8px_0_24px_rgba(0,0,0,0.08)]">
        <div className="mx-auto w-full max-w-md">
          <Link href="/" className="flex justify-center rounded focus:outline-none focus:ring-2 focus:ring-[#34B097] focus:ring-offset-2">
            <ClicVendLogo size="lg" />
          </Link>

          {phase === "email" ? (
            <>
              <h1 className="mt-8 text-xl font-bold text-[#0F172A]">Recuperar senha</h1>
              <p className="mt-2 text-sm text-[#64748B]">
                Informe o e-mail do administrador da empresa. Se estiver cadastrado, enviaremos um código de 6 dígitos pelo WhatsApp
                vinculado ao seu perfil.
              </p>
              <form onSubmit={requestCode} className="mt-8 space-y-4">
                <div>
                  <label htmlFor="rec-email" className="sr-only">
                    E-mail
                  </label>
                  <input
                    id="rec-email"
                    type="email"
                    autoComplete="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="E-mail do administrador"
                    className={inputClass}
                    required
                  />
                </div>
                {error && <p className="text-sm font-medium text-[#EF4444]">{error}</p>}
                <button
                  type="submit"
                  disabled={loading || !email.trim()}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[#34B097] py-3.5 font-semibold text-white shadow-lg transition-all disabled:cursor-not-allowed disabled:bg-[#94A3B8] disabled:shadow-none hover:bg-[#2D9B85]"
                >
                  {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
                  {loading ? "Enviando…" : "Enviar código no WhatsApp"}
                </button>
              </form>
            </>
          ) : (
            <>
              <h1 className="mt-8 text-xl font-bold text-[#0F172A]">Definir nova senha</h1>
              <p className="mt-2 text-sm text-[#64748B]">
                Digite o código recebido no WhatsApp e escolha uma nova senha (mínimo 6 caracteres).
              </p>
              <form onSubmit={confirmReset} className="mt-8 space-y-4">
                <div>
                  <label htmlFor="rec-code" className="mb-1 block text-sm font-medium text-[#1E293B]">
                    Código (6 dígitos)
                  </label>
                  <input
                    id="rec-code"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    maxLength={8}
                    value={code}
                    onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                    placeholder="000000"
                    className={inputClass + " font-mono text-lg tracking-widest"}
                  />
                </div>
                <div>
                  <label htmlFor="rec-pass" className="mb-1 block text-sm font-medium text-[#1E293B]">
                    Nova senha
                  </label>
                  <div className="relative">
                    <input
                      id="rec-pass"
                      type={showPassword ? "text" : "password"}
                      autoComplete="new-password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Mínimo 6 caracteres"
                      className={inputClass + " pr-12"}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-[#64748B] hover:text-[#1E293B]"
                      aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}
                    >
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>
                <div>
                  <label htmlFor="rec-pass2" className="mb-1 block text-sm font-medium text-[#1E293B]">
                    Confirmar senha
                  </label>
                  <input
                    id="rec-pass2"
                    type={showPassword ? "text" : "password"}
                    autoComplete="new-password"
                    value={passwordConfirm}
                    onChange={(e) => setPasswordConfirm(e.target.value)}
                    placeholder="Repita a senha"
                    className={inputClass}
                  />
                </div>
                {error && <p className="text-sm font-medium text-[#EF4444]">{error}</p>}
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                  <button
                    type="button"
                    onClick={() => {
                      setPhase("email");
                      setError(null);
                      setCode("");
                    }}
                    className="inline-flex items-center justify-center gap-2 rounded-xl border border-[#E2E8F0] px-4 py-3 font-medium text-[#1E293B] hover:bg-[#F8FAFC]"
                  >
                    <ArrowLeft className="h-4 w-4" />
                    Voltar
                  </button>
                  <button
                    type="submit"
                    disabled={loading}
                    className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-[#34B097] py-3.5 font-semibold text-white shadow-lg transition-all disabled:cursor-not-allowed disabled:bg-[#94A3B8] hover:bg-[#2D9B85] sm:min-w-0"
                  >
                    {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                    {loading ? "Salvando…" : "Confirmar nova senha"}
                  </button>
                </div>
              </form>
            </>
          )}

          <p className="mt-8 text-center text-sm text-[#64748B]">
            <Link href="/login" className="font-semibold text-[#34B097] hover:underline">
              Voltar ao login
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
