"use client";

import Link from "next/link";
import { ClicVendLogo } from "@/components/ClicVendLogo";

/** Header fixo para páginas públicas (cadastro, onboarding, login). Mesmo estilo visual do AppHeader. */
export function PublicHeader() {
  return (
    <header className="fixed left-0 right-0 top-0 z-50 flex h-14 shrink-0 items-center justify-between gap-4 border-b border-[#E2E8F0] bg-white px-6 shadow-sm">
      <Link href="/" className="flex shrink-0 items-center gap-2 transition-opacity hover:opacity-90">
        <ClicVendLogo size="sm" className="h-7 w-auto" />
      </Link>
    </header>
  );
}
