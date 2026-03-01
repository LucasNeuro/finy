import { Search } from "lucide-react";

export default function TagsPage() {
  return (
    <div className="flex flex-col gap-4 p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-[#1E293B]">Tags</h1>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#94A3B8]" />
          <input
            type="search"
            placeholder="Pesquisar por nome"
            className="rounded-lg border border-[#E2E8F0] pl-9 pr-4 py-2 text-sm text-[#1E293B] placeholder-[#94A3B8]"
          />
        </div>
      </div>
      <p className="text-[#64748B]">Nenhum resultado encontrado</p>
    </div>
  );
}
