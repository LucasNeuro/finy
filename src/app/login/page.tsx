"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { ClicVendLogo } from "@/components/ClicVendLogo";
import { Eye, EyeOff, LogIn, Loader2, CheckCircle } from "lucide-react";
import { useLogin } from "@/lib/auth/use-login";

function LoginForm() {
  const { login, error, loading, success } = useLogin();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    login(email, password);
  };

  const isValid = email.trim().length > 0 && password.length > 0;

  const inputClass =
    "w-full rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] px-4 py-3.5 text-[#1E293B] placeholder-[#94A3B8] focus:border-[#34B097] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#34B097]/20 transition-all";

  return (
    <div className="flex min-h-screen flex-row-reverse">
      {/* Fundo degradê verde - lado direito no desktop */}
      <div className="absolute inset-0 bg-gradient-to-br from-[#0D2B26] via-[#134D45] to-[#1A6B5C] md:relative md:flex-1">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_50%_at_80%_50%,rgba(52,176,151,0.2),transparent)] pointer-events-none" />
      </div>

      {/* Faixa branca à esquerda com o form - maior */}
      <div className="relative z-10 flex w-full min-h-screen flex-col justify-center bg-white p-8 md:w-[55%] md:min-w-[520px] md:max-w-[640px] md:flex-none md:shadow-[8px_0_24px_rgba(0,0,0,0.08)]">
        <div className="mx-auto w-full max-w-md">
        <Link
          href="/"
          className="flex justify-center focus:outline-none focus:ring-2 focus:ring-[#34B097] focus:ring-offset-2 rounded"
        >
          <ClicVendLogo size="lg" />
        </Link>

        <form onSubmit={handleSubmit} className="mt-8 space-y-4">
          <div>
            <label htmlFor="email" className="sr-only">
              E-mail
            </label>
            <input
              id="email"
              type="email"
              placeholder="E-mail"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={inputClass}
              autoComplete="email"
            />
          </div>

          <div>
            <label htmlFor="password" className="sr-only">
              Senha
            </label>
            <div className="relative">
              <input
                id="password"
                type={showPassword ? "text" : "password"}
                placeholder="Digite a senha"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className={`${inputClass} pr-12`}
                autoComplete="current-password"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-[#64748B] transition-colors hover:text-[#1E293B]"
                aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>



          {error && <p className="text-sm font-medium text-[#EF4444]">{error}</p>}
          {success && <p className="text-sm font-medium text-emerald-600 text-center animate-pulse">Login realizado com sucesso! Redirecionando...</p>}

          <p className="text-center text-sm">
            <Link href="/recuperar-senha" className="font-medium text-[#34B097] hover:underline">
              Esqueci minha senha
            </Link>
          </p>

          <button
            type="submit"
            disabled={!isValid || loading || success}
            className={`w-full inline-flex items-center justify-center gap-2 rounded-xl py-3.5 font-semibold text-white shadow-lg transition-all disabled:cursor-not-allowed disabled:bg-[#94A3B8] disabled:shadow-none ${
              success ? "bg-emerald-500 hover:bg-emerald-600" : "bg-[#34B097] hover:bg-[#2D9B85]"
            }`}
          >
            {success ? (
              <CheckCircle className="h-4 w-4" />
            ) : loading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <LogIn className="h-4 w-4" />
            )}
            {success ? "Sucesso!" : loading ? "Entrando…" : "Entrar"}
          </button>
        </form>
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <main className="min-h-screen">
      <Suspense
        fallback={
          <div className="flex min-h-screen items-center justify-center bg-[#F8FAFC]">
            <div className="text-[#64748B]">Carregando…</div>
          </div>
        }
      >
        <LoginForm />
      </Suspense>
    </main>
  );
}
