"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Megaphone, ArrowRight } from "lucide-react";

export default function CampanhasPage() {
  const pathname = usePathname();
  const slug = pathname?.split("/").filter(Boolean)[0] ?? "";
  const contatosHref = slug ? `/${slug}/contatos` : "/contatos";

  return (
    <div className="flex flex-col gap-4 p-6">
      <div className="rounded-xl border border-[#E2E8F0] bg-white p-6 shadow-sm">
        <div className="flex items-start gap-3">
          <div className="mt-0.5 rounded-lg bg-clicvend-orange/10 p-2 text-clicvend-orange">
            <Megaphone className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="text-2xl font-bold text-[#1E293B]">Campanhas</h1>
            <p className="mt-2 text-sm text-[#64748B]">
              Este modulo foi pausado temporariamente para evoluir o novo fluxo de pipeline com base em contatos segmentados.
            </p>
            <p className="mt-1.5 text-sm text-[#64748B]">
              Por enquanto, utilize o modulo de <strong>Contatos</strong> para preparar publico e consentimentos.
            </p>
            <div className="mt-4">
              <Link
                href={contatosHref}
                className="inline-flex items-center gap-2 rounded-lg bg-clicvend-orange px-4 py-2 text-sm font-medium text-white hover:bg-clicvend-orange-dark"
              >
                Ir para Contatos
                <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
