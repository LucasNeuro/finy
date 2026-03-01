"use client";

import { useLogin } from "@/lib/auth/use-login";
import { useState } from "react";
import Link from "next/link";
import { ClicVendLogo } from "@/components/ClicVendLogo";
import { Globe, Eye, EyeOff, LogIn } from "lucide-react";

export default function LoginPage() {
  const { login, error, loading } = useLogin();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    login(email, password);
  };

  const isValid = email.trim().length > 0 && password.length > 0;

  const inputClass =
    "w-full rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] px-4 py-3 text-[#1E293B] placeholder-[#94A3B8] focus:border-clicvend-blue focus:bg-white focus:outline-none focus:ring-2 focus:ring-clicvend-blue/20 transition-all";

  return (
    <main className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden px-4 py-12">
      {/* Background */}
      <div className="absolute inset-0 bg-[#F8FAFC]" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_60%_at_50%_0%,rgba(37,99,235,0.12),transparent_60%)]" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_60%_40%_at_80%_80%,rgba(99,102,241,0.08),transparent)]" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_40%_30%_at_20%_90%,rgba(59,130,246,0.06),transparent)]" />

      <div className="relative w-full max-w-[420px]">
        <div className="rounded-2xl border border-[#E2E8F0] bg-white p-8 shadow-xl shadow-clicvend-blue/5 sm:p-10">
          <Link href="/" className="flex justify-center focus:outline-none focus:ring-2 focus:ring-clicvend-blue focus:ring-offset-2 rounded">
            <ClicVendLogo size="lg" />
          </Link>

          <form onSubmit={handleSubmit} className="mt-8 space-y-4">
          <div>
            <label htmlFor="email" className="sr-only">E-mail</label>
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
            <label htmlFor="password" className="sr-only">Senha</label>
            <div className="relative">
              <input
                id="password"
                type={showPassword ? "text" : "password"}
                placeholder="Digite a senha"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className={inputClass + " pr-12"}
                autoComplete="current-password"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-[#64748B] hover:text-[#1E293B] transition-colors"
                aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>

          <div className="flex justify-end">
            <Link href="/recuperar-senha" className="text-sm font-medium text-[#64748B] hover:text-clicvend-blue transition-colors">
              Esqueci minha senha
            </Link>
          </div>

          {error && <p className="text-sm font-medium text-[#EF4444]">{error}</p>}

          <button
            type="submit"
            disabled={!isValid || loading}
            className="w-full inline-flex items-center justify-center gap-2 rounded-xl py-3.5 font-semibold text-white shadow-lg shadow-clicvend-blue/25 transition-all disabled:cursor-not-allowed disabled:bg-[#94A3B8] disabled:shadow-none enabled:bg-clicvend-orange enabled:hover:bg-clicvend-orange-dark"
          >
            <LogIn className="h-4 w-4" />
            {loading ? "Entrando…" : "Entrar"}
          </button>
        </form>

          <div className="mt-6 flex items-center justify-center gap-2 text-[#64748B]">
            <Globe className="h-4 w-4" />
            <span className="text-sm">Português</span>
            <span className="text-xs">&#9660;</span>
          </div>

          <p className="mt-4 text-center text-sm text-[#64748B]">
            Não tem conta?{" "}
            <Link href="/onboarding" className="font-semibold text-clicvend-blue hover:underline">
              Cadastre-se
            </Link>
          </p>
        </div>

        <footer className="mt-8 flex flex-wrap items-center justify-center gap-2 text-center text-sm text-[#64748B]">
          <span>ClicVend © 2026</span>
          <span className="text-[#CBD5E1]">|</span>
          <Link href="#" className="hover:text-clicvend-blue transition-colors">Termos de uso</Link>
          <span className="text-[#CBD5E1]">|</span>
          <Link href="#" className="hover:text-clicvend-blue transition-colors">Política de Privacidade</Link>
        </footer>
      </div>
    </main>
  );
}
