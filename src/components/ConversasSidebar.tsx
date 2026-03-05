"use client";

import { usePathname } from "next/navigation";
import Link from "next/link";
import { useState, useEffect, useRef } from "react";
import useSWR from "swr";
import { MoreVertical, Search, Plus } from "lucide-react";
import { ConversationListSkeleton } from "@/components/Skeleton";

type Queue = { id: string; name: string; slug: string; kind?: string };
type Conversation = {
  id: string;
  customer_phone: string;
  customer_name: string | null;
  last_message_at: string;
  status: string;
};

function fetcher(url: string, headers?: Record<string, string>) {
  return fetch(url, { credentials: "include", headers }).then((r) => r.json());
}

function formatLastMessageTime(iso: string): string {
  const d = new Date(iso);
  const today = new Date();
  if (d.toDateString() === today.toDateString()) {
    return d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  }
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
}

/** Cache de 30s, revalida ao focar a janela; evita carregamento lento ao trocar de aba */
const swrOpts = { revalidateOnFocus: true, dedupingInterval: 30_000 };

export function ConversasSidebar() {
  const pathname = usePathname();
  const segments = pathname?.split("/").filter(Boolean) ?? [];
  const slug = segments[0];
  const base = slug ? `/${slug}` : "";
  const apiHeaders = slug ? { "X-Company-Slug": slug } : undefined;
  const [queueId, setQueueId] = useState<string>("");
  const [statusFilter, setStatusFilter] = useState<string>(""); // "" | "open" | "closed"
  const [search, setSearch] = useState("");
  const hasSetDefaultQueueRef = useRef(false);

  const { data: queuesData } = useSWR<Queue[]>(
    slug ? ["/api/queues?for_inbox=1", slug] : null,
    ([url]) => fetcher(url, apiHeaders),
    swrOpts
  );
  const queues = Array.isArray(queuesData) ? queuesData : [];

  // Fila "Grupos" (uma por empresa) como padrão ao abrir Conversas
  useEffect(() => {
    if (queues.length === 0 || hasSetDefaultQueueRef.current) return;
    const groupsQueue = queues.find((q) => q.slug === "groups");
    if (groupsQueue) {
      setQueueId(groupsQueue.id);
      hasSetDefaultQueueRef.current = true;
    }
  }, [queues]);

  const conversationsParams = new URLSearchParams();
  if (queueId) conversationsParams.set("queue_id", queueId);
  if (statusFilter) conversationsParams.set("status", statusFilter);
  const conversationsUrl = slug ? `/api/conversations?${conversationsParams}` : null;
  const { data: conversationsRes, error: conversationsError, isLoading: loading } = useSWR<{ data?: Conversation[]; error?: string }>(
    conversationsUrl ? [conversationsUrl, slug, queueId, statusFilter] : null,
    async ([url]) => {
      const res = await fetch(url as string, { credentials: "include", headers: apiHeaders });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error ?? "Falha ao carregar conversas");
      return json;
    },
    swrOpts
  );
  const conversations = Array.isArray(conversationsRes?.data) ? conversationsRes.data : [];

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
      <div className="flex flex-wrap gap-2 px-2 py-2">
        <select
          value={queueId}
          onChange={(e) => setQueueId(e.target.value)}
          className="flex-1 min-w-0 rounded border border-[#E2E8F0] bg-white px-2 py-1.5 text-sm text-[#1E293B] focus:border-clicvend-orange focus:outline-none focus:ring-1 focus:ring-clicvend-orange"
        >
          <option value="">Todas as filas</option>
          {queues.map((q) => (
            <option key={q.id} value={q.id}>{q.name}</option>
          ))}
        </select>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="w-24 rounded border border-[#E2E8F0] bg-white px-2 py-1.5 text-sm text-[#1E293B] focus:border-clicvend-orange focus:outline-none focus:ring-1 focus:ring-clicvend-orange"
        >
          <option value="">Todos</option>
          <option value="open">Abertos</option>
          <option value="closed">Fechados</option>
        </select>
        <button
          type="button"
          className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-clicvend-orange px-3 py-1.5 text-sm font-medium text-white hover:bg-clicvend-orange-dark transition-colors"
          aria-label="Criar novo"
        >
          <Plus className="h-4 w-4 shrink-0" />
          Criar novo
        </button>
      </div>
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <ConversationListSkeleton count={8} />
        ) : conversationsError ? (
          <div className="p-4 text-center text-sm">
            <p className="font-medium text-red-600">Não foi possível carregar as conversas</p>
            <p className="mt-1 text-xs text-[#64748B]">{conversationsError.message}</p>
            <p className="mt-2 text-xs text-[#64748B]">
              Confira as <Link href={`${base}/filas`} className="text-clicvend-orange hover:underline">Atribuições</Link> da fila ou tente <strong>Todas as filas</strong>.
            </p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-4 text-center text-sm text-[#64748B]">
            <p className="font-medium text-[#1E293B]">Nenhuma conversa</p>
            <p className="mt-1 text-xs">
              Ao conectar o número em <Link href={`${base}/conexoes`} className="text-clicvend-orange hover:underline">Conexões</Link>, o histórico é sincronizado automaticamente.
            </p>
            <p className="mt-2 text-xs">
              Confira as <Link href={`${base}/filas`} className="text-clicvend-orange hover:underline">Atribuições</Link> da fila ou selecione <strong>Todas as filas</strong> acima.
            </p>
          </div>
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
                    <div className="flex items-center justify-between gap-1">
                      <p className="truncate text-sm font-medium text-[#1E293B]">
                        {c.customer_name || c.customer_phone}
                      </p>
                      <span className="shrink-0 text-xs text-[#64748B]">
                        {formatLastMessageTime(c.last_message_at)}
                      </span>
                    </div>
                    <p className="truncate text-xs text-[#64748B]">
                      {c.status === "open" ? "Aberto" : c.status === "closed" ? "Encerrado" : c.status}
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
