"use client";

import { useState, useEffect } from "react";
import { Upload, UserPlus, Filter, RefreshCw, MoreVertical } from "lucide-react";

type Conversation = {
  id: string;
  customer_phone: string;
  customer_name: string | null;
};

export default function ContatosPage() {
  const [contacts, setContacts] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const perPage = 15;
  const total = contacts.length;
  const start = (page - 1) * perPage;
  const end = Math.min(start + perPage, total);
  const pageItems = contacts.slice(start, end);

  useEffect(() => {
    setLoading(true);
    fetch("/api/conversations?limit=500")
      .then((r) => r.json())
      .then((res) => {
        const data = res.data ?? [];
        const byPhone = new Map<string, Conversation>();
        data.forEach((c: Conversation) => {
          const key = c.customer_phone;
          if (!byPhone.has(key) || (c.customer_name && !byPhone.get(key)!.customer_name)) {
            byPhone.set(key, c);
          }
        });
        setContacts(Array.from(byPhone.values()));
      })
      .catch(() => setContacts([]))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="flex flex-col gap-4 p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-[#1E293B]">Contatos</h1>
        <div className="flex items-center gap-2">
          <button
            type="button"
            className="inline-flex items-center gap-1.5 rounded-lg border border-[#E2E8F0] bg-white px-4 py-2 text-sm font-medium text-[#64748B] hover:bg-[#F8FAFC] transition-colors"
          >
            <Upload className="h-4 w-4" />
            Importar contatos
          </button>
          <button
            type="button"
            className="inline-flex items-center gap-1.5 rounded-lg border border-[#E2E8F0] bg-white px-4 py-2 text-sm font-medium text-[#64748B] hover:bg-[#F8FAFC] transition-colors"
          >
            <Filter className="h-4 w-4" />
            Exibir Filtros
          </button>
          <button
            type="button"
            className="inline-flex items-center gap-1.5 rounded-lg bg-[#6366F1] px-4 py-2 text-sm font-medium text-white hover:bg-[#4F46E5] transition-colors"
          >
            <UserPlus className="h-4 w-4" />
            Novo contato
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

      {loading ? (
        <p className="text-[#64748B]">Carregando…</p>
      ) : pageItems.length === 0 ? (
        <p className="text-center text-[#64748B]">Nenhum resultado encontrado</p>
      ) : (
        <>
          <div className="overflow-hidden rounded-lg border border-[#E2E8F0] bg-white">
            <table className="w-full">
              <thead>
                <tr className="border-b border-[#E2E8F0] bg-[#F8FAFC]">
                  <th className="w-10 px-4 py-3 text-left">
                    <input type="checkbox" className="rounded" aria-label="Selecionar todos" />
                  </th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-[#1E293B]">Nome</th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-[#1E293B]">Pessoa</th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-[#1E293B]">Número</th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-[#1E293B]">Conexão</th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-[#1E293B]">Tags</th>
                  <th className="w-10 px-4 py-3 text-left text-sm font-medium text-[#1E293B]">Ações</th>
                </tr>
              </thead>
              <tbody>
                {pageItems.map((c) => (
                  <tr key={c.id} className="border-b border-[#E2E8F0] hover:bg-[#F8FAFC]">
                    <td className="px-4 py-3">
                      <input type="checkbox" className="rounded" />
                    </td>
                    <td className="px-4 py-3 text-sm text-[#1E293B]">
                      {c.customer_name || "—"}
                    </td>
                    <td className="px-4 py-3">
                      <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[#E2E8F0] text-xs font-medium text-[#64748B]">
                        {(c.customer_name ?? c.customer_phone).slice(0, 1).toUpperCase()}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-[#1E293B]">{c.customer_phone}</td>
                    <td className="px-4 py-3 text-sm text-[#64748B]">—</td>
                    <td className="px-4 py-3 text-sm text-[#64748B]">—</td>
                    <td className="px-4 py-3">
                      <button type="button" className="text-[#64748B] hover:text-[#1E293B] transition-colors" aria-label="Menu">
                        <MoreVertical className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex items-center justify-between border-t border-[#E2E8F0] pt-4 text-sm text-[#64748B]">
            <span>
              Mostrando {total === 0 ? 0 : start + 1}-{end} de {total} resultados
            </span>
            <select
              value={perPage}
              className="rounded border border-[#E2E8F0] bg-white px-2 py-1 text-[#1E293B]"
            >
              <option value={15}>15 por página</option>
            </select>
          </div>
        </>
      )}
    </div>
  );
}
