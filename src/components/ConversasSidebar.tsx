"use client";

import { usePathname } from "next/navigation";
import Link from "next/link";
import { useState, useEffect, memo } from "react";
import useSWR from "swr";
import { MoreVertical, Search, Plus } from "lucide-react";
import { ConversationListSkeleton } from "@/components/Skeleton";

type Queue = { id: string; name: string; slug: string; kind?: string };
type Conversation = {
  id: string;
  channel_id?: string;
  customer_phone: string;
  customer_name: string | null;
  wa_chat_jid?: string | null;
  last_message_at: string;
  last_message_preview?: string | null;
  status: string;
  avatar_url?: string | null;
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

/** Cache de 90s, sem revalidar ao focar (evita travamento ao alternar abas); retry em falha */
const swrOpts = { revalidateOnFocus: false, dedupingInterval: 90_000, errorRetryCount: 2 };

type ViewMode = "mine" | "queues";

const ConversationListItem = memo(function ConversationListItem({
  conversation: c,
  base,
  currentId,
}: {
  conversation: Conversation;
  base: string;
  currentId: string | null;
}) {
  const href = `${base}/conversas/${c.id}`;
  const displayName = (c.customer_name ?? c.customer_phone) ?? "?";
  const initial = displayName.slice(0, 1).toUpperCase();

  return (
    <li>
      <Link
        href={href}
        className={`flex items-center gap-3 p-3 hover:bg-[#F8FAFC] ${currentId === c.id ? "bg-clicvend-green/10" : ""}`}
      >
        <span className="relative flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-[#E2E8F0] text-sm font-medium text-[#64748B]">
          {c.avatar_url ? (
            <img src={c.avatar_url} alt="" className="h-full w-full object-cover" />
          ) : (
            initial
          )}
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
            {c.last_message_preview != null && c.last_message_preview !== ""
              ? c.last_message_preview
              : c.status === "open"
                ? "Aberto"
                : c.status === "closed"
                  ? "Encerrado"
                  : c.status}
          </p>
        </div>
      </Link>
    </li>
  );
});

export function ConversasSidebar() {
  const pathname = usePathname();
  const segments = pathname?.split("/").filter(Boolean) ?? [];
  const slug = segments[0];
  const base = slug ? `/${slug}` : "";
  const apiHeaders = slug ? { "X-Company-Slug": slug } : undefined;

  const [viewMode, setViewMode] = useState<ViewMode>("mine");
  const [queueId, setQueueId] = useState<string>("");
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [search, setSearch] = useState("");
  const [moreConversations, setMoreConversations] = useState<Conversation[]>([]);
  const [loadingMore, setLoadingMore] = useState(false);

  const { data: permissionsData } = useSWR<{ permissions?: string[]; inbox_see_all?: boolean }>(
    slug ? ["/api/auth/permissions", slug] : null,
    ([url]) => fetcher(url, apiHeaders),
    swrOpts
  );
  const inboxSeeAll = permissionsData?.inbox_see_all === true;

  const { data: queuesData } = useSWR<Queue[]>(
    slug ? ["/api/queues?for_inbox=1", slug] : null,
    ([url]) => fetcher(url, apiHeaders),
    swrOpts
  );
  const queues = Array.isArray(queuesData) ? queuesData : [];

  const conversationsParams = new URLSearchParams();
  conversationsParams.set("limit", "100");
  if (viewMode === "mine") {
    conversationsParams.set("only_assigned_to_me", "1");
  }
  if (inboxSeeAll && queueId) {
    conversationsParams.set("queue_id", queueId);
  }
  if (statusFilter) conversationsParams.set("status", statusFilter);

  const conversationsUrl = slug ? `/api/conversations?${conversationsParams}` : null;
  useEffect(() => {
    setMoreConversations([]);
  }, [conversationsUrl]);
  const { data: conversationsRes, error: conversationsError, isLoading: loading, mutate: mutateConversations } = useSWR<{ data?: Conversation[]; total?: number; error?: string }>(
    conversationsUrl ? [conversationsUrl, slug, viewMode, queueId, statusFilter] : null,
    async ([url]) => {
      const res = await fetch(url as string, { credentials: "include", headers: apiHeaders });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error ?? "Falha ao carregar conversas");
      return json;
    },
    {
      ...swrOpts,
      onErrorRetry(err, _key, _config, revalidate, { retryCount }) {
        if (err?.name === "AbortError" || (err?.message && String(err.message).includes("Lock broken"))) return;
        if (retryCount >= 2) return;
        setTimeout(() => revalidate({ retryCount }), 3000);
      },
    }
  );
  const baseList = Array.isArray(conversationsRes?.data) ? conversationsRes.data : [];
  const totalFromApi = conversationsRes?.total ?? 0;
  const allConversations = [...baseList, ...moreConversations];
  const hasMore = totalFromApi > allConversations.length;

  const loadMore = async () => {
    if (loadingMore || !hasMore || !slug) return;
    setLoadingMore(true);
    try {
      const params = new URLSearchParams(conversationsParams);
      params.set("offset", String(allConversations.length));
      params.set("limit", "100");
      const res = await fetch(`/api/conversations?${params}`, { credentials: "include", headers: apiHeaders });
      const json = await res.json().catch(() => ({}));
      if (res.ok && Array.isArray(json?.data)) {
        setMoreConversations((prev) => [...prev, ...json.data]);
      }
    } finally {
      setLoadingMore(false);
    }
  };

  const errorMessage =
    conversationsError?.message === "Failed to fetch"
      ? "Erro de conexão. Verifique sua internet ou se o servidor está no ar."
      : conversationsError?.message ?? "Não foi possível carregar as conversas.";

  const filtered = search.trim()
    ? allConversations.filter(
        (c) =>
          (c.customer_name ?? "").toLowerCase().includes(search.toLowerCase()) ||
          (c.customer_phone ?? "").includes(search)
      )
    : allConversations;

  const currentId = pathname?.split("/")[3] ?? null;

  return (
    <aside className="flex min-h-0 w-96 shrink-0 flex-col border-r border-[#E2E8F0] bg-white overflow-hidden self-stretch">
      <div className="flex shrink-0 items-center justify-between border-b border-[#E2E8F0] p-3">
        <h2 className="text-lg font-semibold text-[#1E293B]">Conversas</h2>
        <button type="button" className="text-[#64748B] hover:text-[#1E293B] transition-colors" aria-label="Menu">
          <MoreVertical className="h-5 w-5" />
        </button>
      </div>
      <div className="shrink-0 p-2">
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
      {/* Abas: Meus atendimentos, Filas e Contatos (link para página de contatos) */}
      <div className="flex shrink-0 border-b border-[#E2E8F0] px-2 pb-1">
        <button
          type="button"
          onClick={() => setViewMode("mine")}
          className={`border-b-2 px-3 py-2 text-sm font-medium transition-colors ${
            viewMode === "mine"
              ? "border-clicvend-orange text-clicvend-orange"
              : "border-transparent text-[#64748B] hover:text-[#1E293B]"
          }`}
        >
          Meus atendimentos
        </button>
        <button
          type="button"
          onClick={() => setViewMode("queues")}
          className={`border-b-2 px-3 py-2 text-sm font-medium transition-colors ${
            viewMode === "queues"
              ? "border-clicvend-orange text-clicvend-orange"
              : "border-transparent text-[#64748B] hover:text-[#1E293B]"
          }`}
        >
          Filas
        </button>
        <Link
          href={`${base}/contatos`}
          className="border-b-2 border-transparent px-3 py-2 text-sm font-medium text-[#64748B] hover:text-[#1E293B] transition-colors"
        >
          Contatos
        </Link>
      </div>
      <div className="shrink-0 flex flex-wrap gap-2 px-2 py-2">
        {/* Só ADM/OWNER (inbox_see_all) veem o filtro por fila */}
        {inboxSeeAll && (
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
        )}
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
      {/* Lista com rolagem própria — scrollbar sempre visível na janela da lista */}
      <div className="scroll-area-conversas scroll-area flex-1 min-h-0 overflow-x-hidden overscroll-contain">
        {loading ? (
          <ConversationListSkeleton count={8} />
        ) : conversationsError ? (
          <div className="p-4 text-center text-sm">
            <p className="font-medium text-red-600">Não foi possível carregar as conversas</p>
            <p className="mt-1 text-xs text-[#64748B]">{errorMessage}</p>
            <p className="mt-2 text-xs text-[#64748B]">
              Confira as <Link href={`${base}/filas`} className="text-clicvend-orange hover:underline">Atribuições</Link> da fila.
            </p>
            <button
              type="button"
              onClick={() => mutateConversations()}
              className="mt-3 rounded-lg bg-clicvend-orange px-3 py-2 text-sm font-medium text-white hover:bg-clicvend-orange-dark"
            >
              Tentar novamente
            </button>
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-4 text-center text-sm text-[#64748B]">
            <p className="font-medium text-[#1E293B]">Nenhuma conversa</p>
            <p className="mt-1 text-xs">
              {viewMode === "mine"
                ? "Você não tem conversas atribuídas. Novas conversas entram automaticamente pelas filas (não precisa sincronizar em Conexões)."
                : "Nenhuma conversa nas suas filas no momento."}
            </p>
            <p className="mt-2 text-xs">
              Se você já tem contatos/conversas, confira a aba <strong>Filas</strong> ou as <Link href={`${base}/filas`} className="text-clicvend-orange hover:underline">Atribuições</Link>. Números conectados em <Link href={`${base}/conexoes`} className="text-clicvend-orange hover:underline">Conexões</Link> recebem mensagens e histórico em segundo plano.
            </p>
          </div>
        ) : (
          <>
          <ul className="divide-y divide-[#E2E8F0]">
            {filtered.map((c) => (
              <ConversationListItem
                key={c.id}
                conversation={c}
                base={base}
                currentId={currentId}
              />
            ))}
          </ul>
          {hasMore && (
            <div className="border-t border-[#E2E8F0] p-2">
              <button
                type="button"
                onClick={loadMore}
                disabled={loadingMore}
                className="w-full rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] py-2 text-sm font-medium text-[#64748B] hover:bg-[#F1F5F9] disabled:opacity-60"
              >
                {loadingMore ? "Carregando…" : `Carregar mais (${totalFromApi - allConversations.length} restantes)`}
              </button>
            </div>
          )}
          </>
        )}
      </div>
    </aside>
  );
}
