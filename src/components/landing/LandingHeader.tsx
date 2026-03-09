"use client";

import Link from "next/link";
import { ClicVendLogo } from "@/components/ClicVendLogo";

type LandingHeaderProps = {
  onPedirAcesso?: () => void;
  /** Na página de login: Meu acesso vai para / e Cadastrar para /onboarding */
  variant?: "landing" | "login";
};

export function LandingHeader({ onPedirAcesso, variant = "landing" }: LandingHeaderProps) {
  return (
    <header className="sticky top-0 z-50 border-b border-[#E2E8F0]/40 bg-white">
      <div className="mx-auto flex w-[92%] max-w-6xl items-center justify-between py-4">
        <Link href="/" className="rounded focus:outline-none focus:ring-2 focus:ring-[#34B097] focus:ring-offset-2">
          <ClicVendLogo size="lg" />
        </Link>
        <nav className="flex items-center gap-3">
          {variant === "landing" && onPedirAcesso ? (
            <button
              type="button"
              onClick={onPedirAcesso}
              className="rounded-full border-2 border-[#1E293B] bg-white px-5 py-2.5 text-sm font-semibold text-[#1E293B] transition-colors hover:bg-[#F8FAFC]"
            >
              Meu acesso
            </button>
          ) : (
            <Link
              href="/"
              className="rounded-full border-2 border-[#1E293B] bg-white px-5 py-2.5 text-sm font-semibold text-[#1E293B] transition-colors hover:bg-[#F8FAFC]"
            >
              Meu acesso
            </Link>
          )}
          <Link
            href="/onboarding"
            className="rounded-full bg-[#34B097] px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#2D9B85]"
          >
            Cadastrar
          </Link>
        </nav>
      </div>
    </header>
  );
}
