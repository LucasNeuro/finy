import { Filter, RefreshCw } from "lucide-react";

export default function RespostasRapidasPage() {
  return (
    <div className="flex flex-col gap-4 p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-[#1E293B]">Respostas rápidas</h1>
        <div className="flex gap-2">
          <button
            type="button"
            className="inline-flex items-center gap-1.5 rounded-lg border border-[#E2E8F0] bg-white px-4 py-2 text-sm text-[#64748B] hover:bg-[#F8FAFC] transition-colors"
          >
            <Filter className="h-4 w-4" />
            Exibir Filtros
          </button>
          <button
            type="button"
            className="flex h-10 w-10 items-center justify-center rounded-full bg-[#F1F5F9] text-[#64748B] hover:bg-[#E2E8F0] transition-colors"
            aria-label="Atualizar"
          >
            <RefreshCw className="h-4 w-4" />
          </button>
        </div>
      </div>
      <p className="text-[#64748B]">Nenhum resultado encontrado</p>
    </div>
  );
}
