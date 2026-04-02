import Link from "next/link";
import { ClicVendLogo } from "@/components/ClicVendLogo";

/**
 * Recuperação de senha desativada por enquanto; fluxo será refeito depois.
 * A rota permanece para não quebrar links antigos.
 */
export default function RecuperarSenhaPage() {
  return (
    <div className="flex min-h-screen flex-row-reverse">
      <div className="absolute inset-0 bg-gradient-to-br from-[#0D2B26] via-[#134D45] to-[#1A6B5C] md:relative md:flex-1" />
      <div className="relative z-10 flex w-full min-h-screen flex-col justify-center bg-white p-8 md:w-[55%] md:min-w-[520px] md:max-w-[640px] md:flex-none md:shadow-[8px_0_24px_rgba(0,0,0,0.08)]">
        <div className="mx-auto w-full max-w-md text-center">
          <Link href="/" className="flex justify-center rounded focus:outline-none focus:ring-2 focus:ring-[#34B097] focus:ring-offset-2">
            <ClicVendLogo size="lg" />
          </Link>
          <h1 className="mt-8 text-xl font-bold text-[#0F172A]">Recuperação de senha</h1>
          <p className="mt-3 text-sm text-[#64748B]">
            Este fluxo está temporariamente indisponível. Use o suporte da sua operação ou um administrador da
            plataforma para redefinir o acesso, se necessário.
          </p>
          <Link
            href="/login"
            className="mt-8 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[#34B097] py-3.5 font-semibold text-white shadow-lg transition-colors hover:bg-[#2D9B85]"
          >
            Voltar ao login
          </Link>
        </div>
      </div>
    </div>
  );
}
