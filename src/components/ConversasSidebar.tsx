"use client";

import { usePathname } from "next/navigation";
import Link from "next/link";
import { useState, useEffect } from "react";
import { MoreVertical, Search, Plus } from "lucide-react";

type Queue = { id: string; name: string; slug: string };
type Conversation = {
  id: string;
  customer_phone: string;
  customer_name: string | null;
  last_message_at: string;
  status: string;
};

export function ConversasSidebar() {
  const pathname = usePathname();
  const slug = pathname?.split("/")[1];
  const base = slug ? `/${slug}` : "";
  const [queues, setQueues] = useState<Queue[]>([]);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [queueId, setQueueId] = useState<string>("");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/queues")
      .then((r) => r.json())
      .then((data) => setQueues(Array.isArray(data) ? data : []))
      .catch(() => setQueues([]));
  }, []);

  useEffect(() => {
    setLoading(true);
    const params = new URLSearchParams();
    if (queueId) params.set("queue_id", queueId);
    fetch(`/api/conversations?${params}`)
      .then((r) => r.json())
      .then((res) => {
        setConversations(res.data ?? []);
      })
      .catch(() => setConversations([]))
      .finally(() => setLoading(false));
  }, [queueId]);

  const filtered = search.trim()
    ? conversations.filter(
        (c) =>
          (c.customer_name ?? "").toLowerCase().includes(search.toLowerCase()) ||
          (c.customer_phone ?? "").includes(search)
      )
    : conversations;

  const currentId = pathname?.split("/")[3] ?? null;

  return (
    <aside className="flex w-80 shrink-0 flex-col border-r border-[#E2E8F0] bg-white">
      <div className="flex items-center justify-between border-b border-[#E2E8F0] p-3">
        <h2 className="text-lg font-semibold text-[#1E293B]">Conversas</h2>
        <button type="button" className="text-[#64748B] hover:text-[#1E293B] transition-colors" aria-label="Menu">
          <MoreVertical className="h-5 w-5" />
        </button>
      </div>
      <div className="p-2">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#94A3B8]" />
          <input
            type="search"
            placeholder="Pesquisar por nome ou número…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] pl-9 pr-3 py-2 text-sm text-[#1E293B] placeholder-[#94A3B8] focus:border-clicvend-orange focus:outline-none focus:ring-1 focus:ring-clicvend-orange"
          />
        </div>
      </div>
      <div className="flex border-b border-[#E2E8F0] px-2 pb-1">
        <Link
          href={`${base}/conversas`}
          className="border-b-2 border-clicvend-orange px-3 py-2 text-sm font-medium text-clicvend-orange"
        >
          Chats
        </Link>
        <span className="px-3 py-2 text-sm text-[#64748B]">Fila</span>
        <span className="px-3 py-2 text-sm text-[#64748B]">Contatos</span>
      </div>
      <div className="flex gap-2 px-2 py-2">
        <select
          value={queueId}
          onChange={(e) => setQueueId(e.target.value)}
          className="flex-1 rounded border border-[#E2E8F0] bg-white px-2 py-1.5 text-sm text-[#1E293B]"
        >
          <option value="">Todas as filas</option>
          {queues.map((q) => (
            <option key={q.id} value={q.id}>{q.name}</option>
          ))}
        </select>
        <button
          type="button"
          className="rounded-lg bg-clicvend-orange px-3 py-1.5 text-sm font-medium text-white hover:bg-clicvend-orange-dark transition-colors"
          aria-label="Criar novo"
        >
          <Plus className="h-4 w-4" />
        </button>
      </div>
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="p-4 text-center text-sm text-[#64748B]">Carregando…</div>
        ) : filtered.length === 0 ? (
          <div className="p-4 text-center text-sm text-[#64748B]">Nenhuma conversa</div>
        ) : (
          <ul className="divide-y divide-[#E2E8F0]">
            {filtered.map((c) => (
              <li key={c.id}>
                <Link
                  href={`${base}/conversas/${c.id}`}
                  className={`flex items-center gap-3 p-3 hover:bg-[#F8FAFC] ${currentId === c.id ? "bg-clicvend-green/10" : ""}`}
                >
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#E2E8F0] text-sm font-medium text-[#64748B]">
                    {(c.customer_name ?? c.customer_phone).slice(0, 1).toUpperCase()}
                  </span>
                  <span className="inline-block h-4 w-4 shrink-0 rounded-full bg-clicvend-orange" title="WhatsApp" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-[#1E293B]">
                      {c.customer_name || c.customer_phone}
                    </p>
                    <p className="truncate text-xs text-[#64748B]">
                      {new Date(c.last_message_at).toLocaleDateString("pt-BR")}
                    </p>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </aside>
  );
}
