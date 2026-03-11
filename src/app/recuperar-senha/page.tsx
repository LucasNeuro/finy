"use client";

import Link from "next/link";
import { ClicVendLogo } from "@/components/ClicVendLogo";
import { ArrowLeft } from "lucide-react";

export default function RecuperarSenhaPage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-[#F8FAFC] px-4 py-12">
      <div className="w-full max-w-[400px]">
        <Link href="/" className="flex justify-center focus:outline-none focus:ring-2 focus:ring-[#34B097] focus:ring-offset-2 rounded">
          <ClicVendLogo size="lg" />
        </Link>

        <h1 className="mt-8 text-center text-xl font-semibold text-[#1E293B]">
          Recuperar senha
        </h1>
        <p className="mt-2 text-center text-sm text-[#64748B]">
          Em breve você poderá redefinir sua senha por e-mail. Entre em contato com o suporte se precisar de ajuda.
        </p>

        <Link
          href="/login"
          className="mt-6 inline-flex items-center gap-2 text-sm font-medium text-[#34B097] hover:underline"
        >
          <ArrowLeft className="h-4 w-4" />
          Voltar ao login
        </Link>
      </div>
    </main>
  );
}
