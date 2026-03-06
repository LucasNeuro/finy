"use client";

import { usePathname } from "next/navigation";
import Link from "next/link";
import { useState, useEffect, memo, useRef } from "react";
import useSWR from "swr";
import { MoreVertical, Search, RefreshCw, Users, Inbox, UserCheck, User } from "lucide-react";
import { ConversationListSkeleton } from "@/components/Skeleton";

type Conversation = {
  id: string;
  channel_id?: string;
  customer_phone: string;
  customer_name: string | null;
  wa_chat_jid?: string | null;
  external_id?: string | null;
  last_message_at: string;
  last_message_preview?: string | null;
  status: string;
  avatar_url?: string | null;
  is_group?: boolean;
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
type ConversationTypeFilter = "all" | "individual" | "group";
/** Tab ativa: só ícones — Filas, Meus atendimentos, Contatos (individuais), Grupos */
type TabId = "queues" | "mine" | "contacts" | "groups";

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
  const isGroup = c.is_group === true;

  return (
    <li>
      <Link
        href={href}
        className={`flex items-center gap-3 p-3 hover:bg-[#F8FAFC] ${currentId === c.id ? "bg-clicvend-green/10" : ""}`}
      >
        <span className="relative flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-[#E2E8F0] text-sm font-medium text-[#64748B]">
          {c.avatar_url ? (
            <img src={c.avatar_url} alt="" className="h-full w-full object-cover" />
          ) : isGroup ? (
            <Users className="h-5 w-5" />
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
          <p className="truncate text-xs text-[#64748B] flex items-center gap-1.5">
            {isGroup && (
              <span className="shrink-0 rounded bg-[#E2E8F0] px-1.5 py-0.5 text-[10px] font-medium text-[#64748B]">
                Grupo
              </span>
            )}
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

  const [activeTab, setActiveTab] = useState<TabId>("mine");
  const [search, setSearch] = useState("");
  const viewMode: ViewMode = activeTab === "queues" ? "queues" : "mine";
  const typeFilter: ConversationTypeFilter =
    activeTab === "groups" ? "group" : activeTab === "contacts" ? "individual" : "all";
  const [moreConversations, setMoreConversations] = useState<Conversation[]>([]);
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const avatarRequestedRef = useRef<Set<string>>(new Set());
  const MAX_AVATAR_PREFETCH = 8;
  const AVATAR_PREFETCH_DELAY_MS = 600;

  const { data: permissionsData } = useSWR<{ permissions?: string[]; inbox_see_all?: boolean }>(
    slug ? ["/api/auth/permissions", slug] : null,
    ([url]) => fetcher(url, apiHeaders),
    swrOpts
  );
  const inboxSeeAll = permissionsData?.inbox_see_all === true;

  const conversationsParams = new URLSearchParams();
  conversationsParams.set("limit", "100");
  if (viewMode === "mine") {
    conversationsParams.set("only_assigned_to_me", "1");
  }
  // Não enviamos queue_id: quem está em várias filas vê tudo na lista; não precisa escolher fila.

  const conversationsUrl = slug ? `/api/conversations?${conversationsParams}` : null;
  useEffect(() => {
    setMoreConversations([]);
  }, [conversationsUrl]);

  const { data: countsData, mutate: mutateCounts } = useSWR<{ mine?: number; queues?: number; individual?: number; groups?: number }>(
    slug ? ["/api/conversations/counts", slug] : null,
    ([url]) => fetcher(url, apiHeaders),
    { ...swrOpts, dedupingInterval: 30_000 }
  );
  const counts = {
    mine: typeof countsData?.mine === "number" ? countsData.mine : 0,
    queues: typeof countsData?.queues === "number" ? countsData.queues : 0,
    individual: typeof countsData?.individual === "number" ? countsData.individual : 0,
    groups: typeof countsData?.groups === "number" ? countsData.groups : 0,
  };

  const { data: conversationsRes, error: conversationsError, isLoading: loading, mutate: mutateConversations } = useSWR<{ data?: Conversation[]; total?: number; error?: string }>(
    conversationsUrl ? [conversationsUrl, slug, viewMode, activeTab] : null,
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

  const filtered = (() => {
    let list = search.trim()
      ? allConversations.filter(
          (c) =>
            (c.customer_name ?? "").toLowerCase().includes(search.toLowerCase()) ||
            (c.customer_phone ?? "").includes(search)
        )
      : allConversations;
    if (typeFilter === "group") list = list.filter((c) => c.is_group === true);
    else if (typeFilter === "individual") list = list.filter((c) => c.is_group !== true);
    return list;
  })();

  const currentId = pathname?.split("/")[3] ?? null;

  // Preenche fotos progressivamente: para as primeiras conversas sem avatar (e não grupo), chama chat-details e atualiza a lista.
  useEffect(() => {
    if (loading || !slug || !apiHeaders || baseList.length === 0) return;
    const needAvatar = baseList.filter(
      (c) => !c.is_group && !(c.avatar_url && c.avatar_url.trim()) && c.channel_id && !avatarRequestedRef.current.has(c.id)
    );
    const toFetch = needAvatar.slice(0, MAX_AVATAR_PREFETCH);
    if (toFetch.length === 0) return;
    let cancelled = false;
    const run = async () => {
      for (let i = 0; i < toFetch.length && !cancelled; i++) {
        const c = toFetch[i];
        const number = (c.customer_phone || c.wa_chat_jid || c.external_id || "").replace(/\D/g, "").trim()
          || (c.wa_chat_jid || c.external_id || "");
        if (!number) continue;
        avatarRequestedRef.current.add(c.id);
        try {
          const res = await fetch("/api/contacts/chat-details", {
            method: "POST",
            credentials: "include",
            headers: { "Content-Type": "application/json", ...apiHeaders },
            body: JSON.stringify({
              channel_id: c.channel_id,
              number,
              preview: true,
              conversation_id: c.id,
            }),
          });
          if (cancelled) return;
          const data = await res.json().catch(() => ({}));
          const url =
            (res.ok && data && typeof (data.imagePreview ?? data.image) === "string")
              ? (data.imagePreview ?? data.image)
              : null;
          if (url) {
            mutateConversations((prev) => {
              if (!prev?.data) return prev ?? { data: [], total: 0 };
              return {
                ...prev,
                data: prev.data.map((item) => (item.id === c.id ? { ...item, avatar_url: url } : item)),
              };
            }, { revalidate: false });
          }
        } catch {
          avatarRequestedRef.current.delete(c.id);
        }
        if (i < toFetch.length - 1) await new Promise((r) => setTimeout(r, AVATAR_PREFETCH_DELAY_MS));
      }
    };
    run();
    return () => { cancelled = true; };
  }, [loading, slug, baseList, apiHeaders, mutateConversations]);

  const refreshList = async () => {
    if (!conversationsUrl || refreshing) return;
    setRefreshing(true);
    avatarRequestedRef.current.clear();
    try {
      const url = `${conversationsUrl}${conversationsUrl.includes("?") ? "&" : "?"}skip_cache=1`;
      const res = await fetch(url, { credentials: "include", headers: apiHeaders });
      const json = await res.json().catch(() => ({}));
      if (res.ok) {
        mutateConversations(json, { revalidate: false });
        mutateCounts();
      }
    } finally {
      setRefreshing(false);
    }
  };

  return (
    <aside className="flex min-h-0 w-96 shrink-0 flex-col border-r border-[#E2E8F0] bg-white overflow-hidden self-stretch">
      <div className="flex shrink-0 items-center justify-between border-b border-[#E2E8F0] p-3">
        <h2 className="text-lg font-semibold text-[#1E293B]">Conversas</h2>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={refreshList}
            disabled={refreshing || !conversationsUrl}
            className="rounded p-2 text-[#64748B] hover:bg-[#F1F5F9] hover:text-[#1E293B] transition-colors disabled:opacity-50"
            aria-label="Atualizar lista (carrega fotos e dados frescos)"
            title="Atualizar lista (carrega fotos e dados frescos)"
          >
            <RefreshCw className={`h-5 w-5 ${refreshing ? "animate-spin" : ""}`} />
          </button>
          <button type="button" className="rounded p-2 text-[#64748B] hover:text-[#1E293B] transition-colors" aria-label="Menu">
            <MoreVertical className="h-5 w-5" />
          </button>
        </div>
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
      {/* Tabs só com ícones + badges: Filas, Meus atendimentos, Contatos, Grupos — clicar filtra a lista */}
      <div className="flex shrink-0 border-b border-[#E2E8F0] px-2 py-2">
        <div className="flex items-center gap-1 rounded-lg bg-[#F1F5F9] p-1">
          <button
            type="button"
            onClick={() => setActiveTab("queues")}
            className={`relative rounded-md p-2 transition-colors ${
              activeTab === "queues"
                ? "bg-white text-clicvend-orange shadow-sm"
                : "text-[#64748B] hover:bg-white/60 hover:text-[#1E293B]"
            }`}
            title="Filas"
            aria-label="Filas"
          >
            <Inbox className="h-5 w-5" />
            {counts.queues > 0 && (
              <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-clicvend-orange px-1 text-[10px] font-semibold text-white">
                {counts.queues > 99 ? "99+" : counts.queues}
              </span>
            )}
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("mine")}
            className={`relative rounded-md p-2 transition-colors ${
              activeTab === "mine"
                ? "bg-white text-clicvend-orange shadow-sm"
                : "text-[#64748B] hover:bg-white/60 hover:text-[#1E293B]"
            }`}
            title="Meus atendimentos"
            aria-label="Meus atendimentos"
          >
            <UserCheck className="h-5 w-5" />
            {counts.mine > 0 && (
              <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-clicvend-orange px-1 text-[10px] font-semibold text-white">
                {counts.mine > 99 ? "99+" : counts.mine}
              </span>
            )}
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("contacts")}
            className={`relative rounded-md p-2 transition-colors ${
              activeTab === "contacts"
                ? "bg-white text-clicvend-orange shadow-sm"
                : "text-[#64748B] hover:bg-white/60 hover:text-[#1E293B]"
            }`}
            title="Contatos (conversas individuais)"
            aria-label="Contatos"
          >
            <User className="h-5 w-5" />
            {counts.individual > 0 && (
              <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-clicvend-orange px-1 text-[10px] font-semibold text-white">
                {counts.individual > 99 ? "99+" : counts.individual}
              </span>
            )}
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("groups")}
            className={`relative rounded-md p-2 transition-colors ${
              activeTab === "groups"
                ? "bg-white text-clicvend-orange shadow-sm"
                : "text-[#64748B] hover:bg-white/60 hover:text-[#1E293B]"
            }`}
            title="Grupos"
            aria-label="Grupos"
          >
            <Users className="h-5 w-5" />
            {counts.groups > 0 && (
              <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-clicvend-orange px-1 text-[10px] font-semibold text-white">
                {counts.groups > 99 ? "99+" : counts.groups}
              </span>
            )}
          </button>
        </div>
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
              {activeTab === "mine" && "Você não tem conversas atribuídas. Novas conversas entram automaticamente pelas filas (não precisa sincronizar em Conexões)."}
              {activeTab === "queues" && "Nenhuma conversa nas suas filas no momento."}
              {activeTab === "contacts" && "Nenhuma conversa individual."}
              {activeTab === "groups" && "Nenhum grupo."}
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
