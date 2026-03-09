"use client";

import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import { useState, useEffect, memo, useRef } from "react";
import { useQuery, useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import { Search, Users, Inbox, UserCheck, User, Loader2, Plus, ChevronLeft, ChevronRight, Archive } from "lucide-react";
import { ConversationListSkeleton } from "@/components/Skeleton";
import { queryKeys } from "@/lib/query-keys";

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
  assigned_to?: string | null;
  assigned_to_name?: string | null;
  queue_id?: string | null;
  queue_name?: string | null;
};

function formatLastMessageTime(iso: string): string {
  const d = new Date(iso);
  const today = new Date();
  if (d.toDateString() === today.toDateString()) {
    return d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  }
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
}

/** Corrige Brasil: DDD+0+8 dígitos → DDD+9+8 (celular). */
function fixBrazilMobileZero(d: string): string {
  if (d.length === 11 && !d.startsWith("55")) {
    const ddd = d.slice(0, 2);
    const rest = d.slice(2);
    if (/^\d{2}$/.test(ddd) && rest.length >= 9 && rest[0] === "0") return ddd + "9" + rest.slice(1, 9);
  }
  if (d.length === 13 && d.startsWith("55")) {
    const after55 = d.slice(2);
    if (after55.length >= 9 && after55[2] === "0") {
      const ddd = after55.slice(0, 2);
      const rest = after55.slice(2, 11);
      if (/^\d{2}$/.test(ddd) && rest[0] === "0") return "55" + ddd + "9" + rest.slice(1);
    }
  }
  return d;
}
/** Formata número para exibição: (DDD) 9 00000-0000. Aceita dígitos puros. */
function formatPhoneBrazil(raw: string | null | undefined): string {
  let s = (raw ?? "").trim().replace(/\D/g, "");
  if (!s) return "—";
  s = fixBrazilMobileZero(s);
  const withCountry = s.length >= 12 && s.startsWith("55");
  const digits = withCountry ? s.slice(2) : s;
  if (digits.length >= 10) {
    const ddd = digits.slice(0, 2);
    const rest = digits.slice(2);
    if (rest.length >= 9 && rest[0] === "9") {
      return `(${ddd}) ${rest.slice(0, 1)} ${rest.slice(1, 6)}-${rest.slice(6, 10)}`;
    }
    if (rest.length >= 8) {
      return `(${ddd}) ${rest.slice(0, 4)}-${rest.slice(4, 8)}`;
    }
  }
  if (s.length <= 14) return s;
  return s.slice(0, 14) + "…";
}

type ViewMode = "mine" | "queues" | "unassigned" | "mine_closed";
type ConversationTypeFilter = "all" | "individual" | "group";
/** Tab ativa: Novos, Filas, Meus, Meus encerrado, Contatos, Grupos */
type TabId = "novos" | "queues" | "mine" | "mine_closed" | "contacts" | "groups";

/** Contato da API /api/contacts (mesma lista do módulo Contatos) */
type SidebarContact = {
  id: string;
  channel_id: string;
  jid: string;
  phone: string | null;
  contact_name: string | null;
  first_name: string | null;
  synced_at: string;
};

/** Grupo da API /api/groups (mesma lista do módulo Contatos e grupos) */
type SidebarGroup = {
  id: string;
  channel_id: string;
  jid: string;
  name: string | null;
  topic: string | null;
  invite_link: string | null;
  synced_at: string | null;
  left_at: string | null;
};

/** Cards em degradê cinza; só os botões mantêm cor (ex.: verde do Atribuir). */
const STYLE_CARD_GRAY = "border-l-4 border-l-slate-200 bg-gradient-to-r from-slate-50/80 to-white shadow-sm";

function getTabRowStyle(activeTab: TabId, showQueueColors: boolean): string {
  if (!showQueueColors) return "";
  return STYLE_CARD_GRAY;
}

/** Bolinha "novo" em cinza para combinar com o card. */
function getTabDotStyle(_activeTab: TabId): { dot: string; dotRing: string } {
  return { dot: "bg-slate-500", dotRing: "ring-slate-100" };
}

const ConversationListItem = memo(function ConversationListItem({
  conversation: c,
  base,
  currentId,
  onHover,
  canClaim,
  onClaim,
  showQueueColors = false,
  activeTab = "queues",
}: {
  conversation: Conversation;
  base: string;
  currentId: string | null;
  onHover?: (id: string) => void;
  canClaim?: boolean;
  onClaim?: (conversationId: string) => void;
  /** Cards em degradê cinza; botões mantêm cores (ex.: verde Atribuir). */
  showQueueColors?: boolean;
  activeTab?: TabId;
}) {
  const href = `${base}/conversas/${c.id}`;
  const displayName = (c.customer_name ?? formatPhoneBrazil(c.customer_phone)) ?? "?";
  const initial = displayName.slice(0, 1).toUpperCase();
  const isGroup = c.is_group === true;
  const showClaim = canClaim && (c.assigned_to == null || c.assigned_to === "");
  const [claiming, setClaiming] = useState(false);
  const [imgError, setImgError] = useState(false);
  const isNew = (c.assigned_to == null || c.assigned_to === "") && (c.status === "open" || c.status === "in_queue");
  const rowStyle = getTabRowStyle(activeTab, showQueueColors);
  const tabDot = getTabDotStyle(activeTab);
  const avatarSrc =
    c.avatar_url && !imgError
      ? c.avatar_url.startsWith("http://") || c.avatar_url.startsWith("https://")
        ? `/api/contacts/avatar?url=${encodeURIComponent(c.avatar_url)}`
        : c.avatar_url
      : null;

  const handleClaimClick = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!onClaim || claiming) return;
    setClaiming(true);
    try {
      await onClaim(c.id);
    } finally {
      setClaiming(false);
    }
  };

  return (
    <li onMouseEnter={() => onHover?.(c.id)}>
      <div
        className={`flex items-center gap-1.5 transition-all duration-150 ${currentId === c.id ? "bg-clicvend-green/10 ring-1 ring-clicvend-green/20" : ""} ${rowStyle}`}
      >
        <Link
          href={href}
          className="flex min-w-0 flex-1 items-center gap-3.5 p-3.5 hover:bg-[#F8FAFC] rounded-lg transition-colors duration-150"
        >
          <span className="relative flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-full bg-gradient-to-br from-[#E2E8F0] to-[#CBD5E1] text-base font-semibold text-[#475569] shadow-sm ring-1 ring-white/50">
            {avatarSrc ? (
              <img
                src={avatarSrc}
                alt=""
                className="h-full w-full object-cover"
                referrerPolicy="no-referrer"
                onError={() => setImgError(true)}
              />
            ) : isGroup ? (
              <Users className="h-5 w-5 text-[#64748B]" />
            ) : (
              <span aria-hidden>{initial}</span>
            )}
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between gap-2">
              <p className="flex min-w-0 items-center gap-2 truncate text-sm font-semibold text-[#1E293B]">
                {isNew && (
                  <span
                    className={`h-2.5 w-2.5 shrink-0 rounded-full shadow-sm ring-2 ${showQueueColors ? `${tabDot.dot} ${tabDot.dotRing}` : "bg-amber-500 ring-amber-100"}`}
                    title="Nova conversa (não atribuída)"
                    aria-hidden
                  />
                )}
                <span className="truncate">{c.customer_name || formatPhoneBrazil(c.customer_phone)}</span>
              </p>
              <span className="shrink-0 text-xs font-medium text-[#64748B]">
                {formatLastMessageTime(c.last_message_at)}
              </span>
            </div>
            <p className="truncate text-xs text-[#64748B] flex items-center gap-2 mt-0.5">
              {isGroup && (
                <span className="shrink-0 rounded-md bg-[#E2E8F0] px-2 py-0.5 text-[10px] font-semibold text-[#64748B]">
                  Grupo
                </span>
              )}
              {!isGroup && c.customer_phone && (
                <span className="shrink-0 text-[#64748B]" title="Número normalizado para envio">
                  {formatPhoneBrazil(c.customer_phone)}
                </span>
              )}
              {!isGroup && c.customer_phone && (c.last_message_preview != null && c.last_message_preview !== "" || c.status) && (
                <span className="text-[#94A3B8]">·</span>
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
        {showClaim && (
          <button
            type="button"
            onClick={handleClaimClick}
            disabled={claiming}
            className="mr-3 flex h-9 w-9 shrink-0 items-center justify-center rounded-full border-2 border-[#E2E8F0] bg-white text-[#009B84] shadow-sm transition-all duration-200 hover:bg-[#009B84] hover:text-white hover:border-[#009B84] hover:shadow-md hover:scale-105 disabled:opacity-60 disabled:hover:scale-100"
            title="Atribuir a mim e colocar em atendimento"
            aria-label="Atribuir a mim"
          >
            {claiming ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Plus className="h-4 w-4" />
            )}
          </button>
        )}
      </div>
    </li>
  );
});

const ContactListItem = memo(function ContactListItem({
  contact,
  base,
  apiHeaders,
}: {
  contact: SidebarContact;
  base: string;
  apiHeaders: Record<string, string> | undefined;
}) {
  const router = useRouter();
  const [starting, setStarting] = useState(false);
  const displayName = (contact.contact_name ?? contact.first_name ?? contact.phone ?? contact.jid) ?? "—";
  const initial = displayName.slice(0, 1).toUpperCase();

  const handleClick = async (e: React.MouseEvent) => {
    e.preventDefault();
    if (starting) return;
    setStarting(true);
    try {
      const params = new URLSearchParams({
        channel_id: contact.channel_id,
        jid: contact.jid,
        customer_phone: contact.phone ?? "",
        customer_name: (contact.contact_name ?? contact.first_name ?? "") || "",
      });
      const res = await fetch(`/api/conversations/find-or-create?${params}`, {
        credentials: "include",
        headers: apiHeaders ?? {},
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data?.id) {
        router.push(`${base}/conversas/${data.id}`);
      } else {
        router.push(`${base}/contatos`);
      }
    } catch {
      router.push(`${base}/contatos`);
    } finally {
      setStarting(false);
    }
  };

  return (
    <li>
      <button
        type="button"
        onClick={handleClick}
        disabled={starting}
        className="flex w-full items-center gap-3.5 p-3.5 text-left rounded-lg transition-all duration-150 hover:bg-[#F8FAFC] disabled:opacity-70"
      >
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[#E2E8F0] to-[#CBD5E1] text-sm font-semibold text-[#64748B] shadow-sm ring-1 ring-white/50">
          {starting ? (
            <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-[#64748B] border-t-transparent" />
          ) : (
            initial
          )}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-[#1E293B]">
            {contact.contact_name || contact.first_name || "—"}
          </p>
          <p className="truncate text-xs text-[#64748B] mt-0.5">
            {contact.phone || contact.jid || ""}
          </p>
        </div>
      </button>
    </li>
  );
});

const GroupListItem = memo(function GroupListItem({
  group,
  base,
  apiHeaders,
}: {
  group: SidebarGroup;
  base: string;
  apiHeaders: Record<string, string> | undefined;
}) {
  const router = useRouter();
  const [opening, setOpening] = useState(false);
  const displayName = (group.name ?? group.topic ?? group.jid) ?? "—";
  const initial = displayName.slice(0, 1).toUpperCase();

  const handleClick = async (e: React.MouseEvent) => {
    e.preventDefault();
    if (opening) return;
    setOpening(true);
    try {
      const params = new URLSearchParams({
        channel_id: group.channel_id,
        jid: group.jid,
        is_group: "1",
        customer_name: (group.name ?? group.topic ?? "").trim() || "",
      });
      const res = await fetch(`/api/conversations/find-or-create?${params}`, {
        credentials: "include",
        headers: apiHeaders ?? {},
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data?.id) {
        router.push(`${base}/conversas/${data.id}`);
      } else {
        router.push(`${base}/contatos`);
      }
    } catch {
      router.push(`${base}/contatos`);
    } finally {
      setOpening(false);
    }
  };

  return (
    <li>
      <button
        type="button"
        onClick={handleClick}
        disabled={opening}
        className="flex w-full items-center gap-3.5 p-3.5 text-left rounded-lg transition-all duration-150 hover:bg-[#F8FAFC] disabled:opacity-70"
      >
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[#E2E8F0] to-[#CBD5E1] text-sm font-semibold text-[#64748B] shadow-sm ring-1 ring-white/50">
          {opening ? (
            <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-[#64748B] border-t-transparent" />
          ) : (
            <Users className="h-5 w-5" />
          )}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-[#1E293B]">
            {group.name || group.topic || "Grupo"}
          </p>
          <p className="truncate text-xs text-[#64748B] mt-0.5">{group.jid}</p>
        </div>
      </button>
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
  const [unassigning, setUnassigning] = useState(false);
  const [resettingToOpen, setResettingToOpen] = useState(false);
  const tabsScrollRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  const handleTabChange = (tab: TabId) => {
    setActiveTab(tab);
    if ((tab === "queues" || tab === "mine" || tab === "novos") && slug) {
      setResettingToOpen(true);
      fetch("/api/conversations/reset-to-open", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json", ...apiHeaders },
        body: JSON.stringify({ filter: tab }),
      })
        .then((res) => {
          if (res.ok) {
            queryClient.invalidateQueries({ queryKey: queryKeys.conversationListInfinite(slug ?? "", "queues") });
            queryClient.invalidateQueries({ queryKey: queryKeys.conversationListInfinite(slug ?? "", "mine") });
            queryClient.invalidateQueries({ queryKey: queryKeys.conversationListInfinite(slug ?? "", "unassigned") });
            queryClient.invalidateQueries({ queryKey: queryKeys.conversationListInfinite(slug ?? "", "mine_closed") });
            queryClient.invalidateQueries({ queryKey: queryKeys.counts(slug ?? "") });
            if (typeof window !== "undefined") {
              window.dispatchEvent(new CustomEvent("conversations-status-reset"));
            }
          }
        })
        .finally(() => setResettingToOpen(false));
    }
  };
  const viewMode: ViewMode =
    activeTab === "queues" ? "queues"
    : activeTab === "novos" ? "unassigned"
    : activeTab === "mine_closed" ? "mine_closed"
    : "mine";
  const typeFilter: ConversationTypeFilter =
    activeTab === "groups" ? "group" : activeTab === "contacts" ? "individual" : "all";
  const queryClient = useQueryClient();
  const loadMoreSentinelRef = useRef<HTMLDivElement>(null);

  // Verificar se pode rolar os tabs
  const checkTabsScroll = () => {
    const container = tabsScrollRef.current;
    if (!container) return;
    const hasScroll = container.scrollWidth > container.clientWidth;
    setCanScrollLeft(hasScroll && container.scrollLeft > 1);
    setCanScrollRight(hasScroll && container.scrollLeft < container.scrollWidth - container.clientWidth - 1);
  };

  // Scroll dos tabs
  const scrollTabs = (direction: "left" | "right") => {
    const container = tabsScrollRef.current;
    if (!container) return;
    const scrollAmount = container.clientWidth * 0.8; // Scroll 80% da largura visível
    container.scrollBy({
      left: direction === "left" ? -scrollAmount : scrollAmount,
      behavior: "smooth",
    });
    // Verificar novamente após o scroll para atualizar os chevrons
    setTimeout(checkTabsScroll, 300);
  };

  useEffect(() => {
    const container = tabsScrollRef.current;
    if (!container) return;
    // Verificar após um pequeno delay para garantir que o DOM está renderizado
    const timeoutId = setTimeout(checkTabsScroll, 100);
    container.addEventListener("scroll", checkTabsScroll);
    window.addEventListener("resize", checkTabsScroll);
    return () => {
      clearTimeout(timeoutId);
      container.removeEventListener("scroll", checkTabsScroll);
      window.removeEventListener("resize", checkTabsScroll);
    };
  }, [activeTab]); // Re-executar quando a tab ativa mudar

  const { data: permissionsData } = useQuery({
    queryKey: queryKeys.permissions(slug ?? ""),
    queryFn: () =>
      fetch("/api/auth/permissions", { credentials: "include", headers: apiHeaders }).then((r) => r.json()),
    enabled: !!slug,
    staleTime: 5 * 60 * 1000,
  });
  const inboxSeeAll = permissionsData?.inbox_see_all === true;

  const { data: countsData } = useQuery({
    queryKey: queryKeys.counts(slug ?? ""),
    queryFn: () =>
      fetch("/api/conversations/counts", { credentials: "include", headers: apiHeaders }).then((r) => r.json()),
    enabled: !!slug,
    staleTime: 45 * 1000,
    refetchInterval: 60 * 1000,
    refetchIntervalInBackground: false,
  });
  const counts = {
    mine: typeof countsData?.mine === "number" ? countsData.mine : 0,
    queues: typeof countsData?.queues === "number" ? countsData.queues : 0,
    individual: typeof countsData?.individual === "number" ? countsData.individual : 0,
    groups: typeof countsData?.groups === "number" ? countsData.groups : 0,
    unassigned: typeof (countsData as { unassigned?: number })?.unassigned === "number" ? (countsData as { unassigned: number }).unassigned : 0,
    mine_closed: typeof (countsData as { mine_closed?: number })?.mine_closed === "number" ? (countsData as { mine_closed: number }).mine_closed : 0,
  };

  // Re-verificar scroll dos tabs quando counts mudarem (após counts ser definido)
  useEffect(() => {
    checkTabsScroll();
  }, [countsData]);

  const { data: contactsData, isLoading: contactsLoading } = useQuery({
    queryKey: queryKeys.contacts(slug ?? ""),
    queryFn: () =>
      fetch("/api/contacts", { credentials: "include", headers: apiHeaders }).then((r) => r.json()),
    enabled: !!slug && activeTab === "contacts",
    staleTime: 2 * 60 * 1000,
  });
  const contactsList: SidebarContact[] = Array.isArray(contactsData) ? contactsData : [];

  const { data: groupsData, isLoading: groupsLoading } = useQuery({
    queryKey: queryKeys.groups(slug ?? ""),
    queryFn: () =>
      fetch("/api/groups", { credentials: "include", headers: apiHeaders }).then((r) => r.json()),
    enabled: !!slug && activeTab === "groups",
    staleTime: 2 * 60 * 1000,
  });
  const groupsList: SidebarGroup[] = Array.isArray(groupsData) ? groupsData : [];

  const conversationsParams = new URLSearchParams();
  conversationsParams.set("limit", "500");
  if (viewMode === "mine") conversationsParams.set("only_assigned_to_me", "1");
  if (viewMode === "unassigned") conversationsParams.set("only_unassigned", "1");
  if (viewMode === "mine_closed") {
    conversationsParams.set("only_assigned_to_me", "1");
    conversationsParams.set("status", "closed");
  }

  const {
    data: conversationsData,
    error: conversationsError,
    isLoading: loading,
    isFetchingNextPage: loadingMore,
    hasNextPage: hasMore,
    fetchNextPage: loadMore,
    refetch: refetchConversations,
  } = useInfiniteQuery({
    queryKey: queryKeys.conversationListInfinite(slug ?? "", viewMode),
    queryFn: async ({ pageParam = 0 }) => {
      const params = new URLSearchParams(conversationsParams);
      params.set("offset", String(pageParam));
      const res = await fetch(`/api/conversations?${params}`, {
        credentials: "include",
        headers: apiHeaders,
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error ?? "Falha ao carregar conversas");
      return json as { data: Conversation[]; total: number };
    },
    initialPageParam: 0,
    getNextPageParam: (lastPage, allPages) => {
      const fetched = allPages.reduce((s, p) => s + (p.data?.length ?? 0), 0);
      const total = lastPage?.total ?? 0;
      if ((lastPage?.data?.length ?? 0) < 500 || fetched >= total) return undefined;
      return fetched;
    },
    enabled: !!slug,
    staleTime: 60 * 1000,
  });

  const baseList = conversationsData?.pages?.[0]?.data ?? [];
  const allConversations = conversationsData?.pages?.flatMap((p) => p.data ?? []) ?? [];
  const totalFromApi = conversationsData?.pages?.[0]?.total ?? 0;

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

  const searchLower = search.trim().toLowerCase();
  const filteredContacts = searchLower
    ? contactsList.filter(
        (c) =>
          (c.contact_name ?? "").toLowerCase().includes(searchLower) ||
          (c.first_name ?? "").toLowerCase().includes(searchLower) ||
          (c.phone ?? "").toLowerCase().includes(searchLower) ||
          (c.jid ?? "").toLowerCase().includes(searchLower)
      )
    : contactsList;

  const filteredGroups = searchLower
    ? groupsList.filter(
        (g) =>
          (g.name ?? "").toLowerCase().includes(searchLower) ||
          (g.topic ?? "").toLowerCase().includes(searchLower) ||
          (g.jid ?? "").toLowerCase().includes(searchLower)
      )
    : groupsList;

  const currentId = pathname?.split("/")[3] ?? null;

  // Infinite scroll: ao chegar perto do fim da lista, carrega mais conversas automaticamente.
  useEffect(() => {
    if (!hasMore || loadingMore || loading) return;
    const el = loadMoreSentinelRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) loadMore();
      },
      { root: null, rootMargin: "200px", threshold: 0 }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [hasMore, loadingMore, loading, filtered.length]);

  // Fotos vêm do banco (channel_contacts.avatar_url). Atualizadas por sync-contacts ou quando
  // o usuário abre o painel de informações e chama chat-details. Sem chamadas em loop à UAZAPI.

  return (
    <aside className="flex min-h-0 w-[440px] shrink-0 flex-col border-r border-[#E2E8F0]/60 bg-white shadow-sm overflow-hidden self-stretch">
      <div className="flex shrink-0 items-center p-4">
        
      </div>
      <div className="shrink-0 px-3 pb-3">
        <div className="relative">
          <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#94A3B8]" />
          <input
            type="search"
            placeholder="Pesquisar por nome ou número…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] pl-10 pr-4 py-2.5 text-sm text-[#1E293B] placeholder-[#94A3B8] transition-all focus:border-clicvend-orange focus:bg-white focus:outline-none focus:ring-2 focus:ring-clicvend-orange/20 shadow-sm hover:border-[#CBD5E1]"
          />
        </div>
      </div>
      {/* Tabs: Novos, Filas, Meus, Contatos, Grupos — scroll horizontal se não couber */}
      <div className="flex shrink-0 w-full border-b border-[#E2E8F0]/60 px-3 py-0.5 items-center gap-1 min-w-0">
        <button
          type="button"
          onClick={() => scrollTabs("left")}
          disabled={!canScrollLeft}
          className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-[#64748B] hover:bg-[#F1F5F9] hover:text-[#1E293B] transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
          aria-label="Rolar para esquerda"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <div
          ref={tabsScrollRef}
          className="scroll-tabs flex w-full flex-nowrap items-center gap-1.5 rounded-md bg-white py-0.5 px-1.5 overflow-x-auto touch-pan-x min-w-0"
        >
          <button
            type="button"
            onClick={() => handleTabChange("novos")}
            className={`relative flex min-w-[5rem] shrink-0 items-center justify-center gap-2 rounded-lg px-3 py-2 transition-all duration-200 ${
              activeTab === "novos"
                ? "bg-amber-50 text-amber-800 shadow-md shadow-amber-200/60 border border-amber-200/70"
                : "text-[#64748B] hover:bg-slate-50 hover:text-[#1E293B]"
            }`}
            title="Novos (não atribuídos)"
            aria-label="Novos"
          >
            <Inbox className="h-5 w-5 shrink-0" />
            <span className="truncate text-xs font-semibold">Novos</span>
            {counts.unassigned > 0 && (
              <span className="absolute -right-0.5 -top-0.5 flex h-4.5 min-w-[1.125rem] items-center justify-center rounded-full bg-amber-500 px-1.5 text-[10px] font-bold text-white shadow-sm ring-1 ring-white/20">
                {counts.unassigned > 99 ? "99+" : counts.unassigned}
              </span>
            )}
          </button>
          <button
            type="button"
            onClick={() => handleTabChange("queues")}
            className={`relative flex min-w-[5rem] shrink-0 items-center justify-center gap-2 rounded-lg px-3 py-2 transition-all duration-200 ${
              activeTab === "queues"
                ? "bg-sky-50 text-sky-800 shadow-md shadow-sky-200/60 border border-sky-200/70"
                : "text-[#64748B] hover:bg-slate-50 hover:text-[#1E293B]"
            }`}
            title="Filas"
            aria-label="Filas"
          >
            <Inbox className="h-5 w-5 shrink-0" />
            <span className="truncate text-xs font-semibold">Filas</span>
            {counts.queues > 0 && (
              <span className="absolute -right-0.5 -top-0.5 flex h-4.5 min-w-[1.125rem] items-center justify-center rounded-full bg-sky-500 px-1.5 text-[10px] font-bold text-white shadow-sm ring-1 ring-white/20">
                {counts.queues > 99 ? "99+" : counts.queues}
              </span>
            )}
          </button>
          <button
            type="button"
            onClick={() => handleTabChange("mine")}
            className={`relative flex min-w-[5rem] shrink-0 items-center justify-center gap-2 rounded-lg px-3 py-2 transition-all duration-200 ${
              activeTab === "mine"
                ? "bg-violet-50 text-violet-800 shadow-md shadow-violet-200/60 border border-violet-200/70"
                : "text-[#64748B] hover:bg-slate-50 hover:text-[#1E293B]"
            }`}
            title="Meus atendimentos"
            aria-label="Meus atendimentos"
          >
            <UserCheck className="h-5 w-5 shrink-0" />
            <span className="truncate text-xs font-semibold">Meus</span>
            {counts.mine > 0 && (
              <span className="absolute -right-0.5 -top-0.5 flex h-4.5 min-w-[1.125rem] items-center justify-center rounded-full bg-violet-500 px-1.5 text-[10px] font-bold text-white shadow-sm ring-1 ring-white/20">
                {counts.mine > 99 ? "99+" : counts.mine}
              </span>
            )}
          </button>
          <button
            type="button"
            onClick={() => handleTabChange("mine_closed")}
            className={`relative flex min-w-[5rem] shrink-0 items-center justify-center gap-2 rounded-lg px-3 py-2 transition-all duration-200 ${
              activeTab === "mine_closed"
                ? "bg-red-50 text-red-800 shadow-md shadow-red-200/50 border border-red-200/70"
                : "text-[#64748B] hover:bg-slate-50 hover:text-[#1E293B]"
            }`}
            title="Meus encerrados"
            aria-label="Meus encerrados"
          >
            <Archive className="h-5 w-5 shrink-0" />
            <span className="truncate text-xs font-semibold">Encerrados</span>
            {counts.mine_closed > 0 && (
              <span className="absolute -right-0.5 -top-0.5 flex h-4.5 min-w-[1.125rem] items-center justify-center rounded-full bg-red-500 px-1.5 text-[10px] font-bold text-white shadow-sm ring-1 ring-white/20">
                {counts.mine_closed > 99 ? "99+" : counts.mine_closed}
              </span>
            )}
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("contacts")}
            className={`relative flex min-w-[5rem] shrink-0 items-center justify-center gap-2 rounded-lg px-3 py-2 transition-all duration-200 ${
              activeTab === "contacts"
                ? "bg-slate-100 text-slate-800 shadow-md shadow-slate-200/50 border border-slate-200/70"
                : "text-[#64748B] hover:bg-slate-50 hover:text-[#1E293B]"
            }`}
            title="Contatos (conversas individuais)"
            aria-label="Contatos"
          >
            <User className="h-5 w-5 shrink-0" />
            <span className="truncate text-xs font-semibold">Contatos</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("groups")}
            className={`relative flex min-w-[5rem] shrink-0 items-center justify-center gap-2 rounded-lg px-3 py-2 transition-all duration-200 ${
              activeTab === "groups"
                ? "bg-slate-100 text-slate-800 shadow-md shadow-slate-200/50 border border-slate-200/70"
                : "text-[#64748B] hover:bg-slate-50 hover:text-[#1E293B]"
            }`}
            title="Grupos"
            aria-label="Grupos"
          >
            <Users className="h-5 w-5 shrink-0" />
            <span className="truncate text-xs font-semibold">Grupos</span>
            {counts.groups > 0 && (
              <span className="absolute -right-0.5 -top-0.5 flex h-4.5 min-w-[1.125rem] items-center justify-center rounded-full bg-slate-500 px-1.5 text-[10px] font-bold text-white shadow-sm ring-1 ring-white/20">
                {counts.groups > 99 ? "99+" : counts.groups}
              </span>
            )}
          </button>
        </div>
        <button
          type="button"
          onClick={() => scrollTabs("right")}
          disabled={!canScrollRight}
          className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-[#64748B] hover:bg-[#F1F5F9] hover:text-[#1E293B] transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
          aria-label="Rolar para direita"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
      {activeTab === "mine" && counts.mine > 0 && (
        <div className="shrink-0 border-b border-[#E2E8F0]/60 px-3 py-2.5">
          <button
            type="button"
            onClick={async () => {
              if (unassigning) return;
              setUnassigning(true);
              try {
                const res = await fetch("/api/conversations/unassign-my-tickets", {
                  method: "POST",
                  credentials: "include",
                  headers: apiHeaders ?? {},
                });
                if (res.ok) {
                  queryClient.invalidateQueries({ queryKey: queryKeys.conversationListInfinite(slug ?? "", "mine") });
                  queryClient.invalidateQueries({ queryKey: queryKeys.conversationListInfinite(slug ?? "", "queues") });
                  queryClient.invalidateQueries({ queryKey: queryKeys.counts(slug ?? "") });
                }
              } finally {
                setUnassigning(false);
              }
            }}
            disabled={unassigning}
            className="flex w-full items-center justify-center gap-2 rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] py-2.5 text-xs font-semibold text-[#64748B] transition-all duration-200 hover:bg-[#F1F5F9] hover:text-[#1E293B] hover:border-[#CBD5E1] hover:shadow-sm disabled:opacity-60"
          >
            {unassigning ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
            Esvaziar Meus
          </button>
        </div>
      )}
      {/* Lista com rolagem própria — scrollbar sempre visível na janela da lista */}
      <div className="scroll-area-conversas scroll-area flex-1 min-h-0 overflow-x-hidden overscroll-contain">
        {activeTab === "contacts" ? (
          contactsLoading ? (
            <ConversationListSkeleton count={8} />
          ) : filteredContacts.length === 0 ? (
            <div className="p-4 text-center text-sm text-[#64748B]">
              <p className="font-medium text-[#1E293B]">Nenhum contato</p>
              <p className="mt-1 text-xs">
                Sincronize contatos em <Link href={`${base}/contatos`} className="text-clicvend-orange hover:underline">Contatos e grupos</Link> ou conecte um número em <Link href={`${base}/conexoes`} className="text-clicvend-orange hover:underline">Conexões</Link>.
              </p>
            </div>
          ) : (
            <ul className="divide-y divide-[#E2E8F0]/40 px-2">
              {filteredContacts.map((c) => (
                <ContactListItem key={c.id} contact={c} base={base} apiHeaders={apiHeaders} />
              ))}
            </ul>
          )
        ) : activeTab === "groups" ? (
          groupsLoading ? (
            <ConversationListSkeleton count={8} />
          ) : filteredGroups.length === 0 ? (
            <div className="p-4 text-center text-sm text-[#64748B]">
              <p className="font-medium text-[#1E293B]">Nenhum grupo</p>
              <p className="mt-1 text-xs">
                Sincronize em <Link href={`${base}/contatos`} className="text-clicvend-orange hover:underline">Contatos e grupos</Link> (botão do canal) ou conecte o número em <Link href={`${base}/conexoes`} className="text-clicvend-orange hover:underline">Conexões</Link>.
              </p>
            </div>
          ) : (
            <ul className="divide-y divide-[#E2E8F0]/40 px-2">
              {filteredGroups.map((g) => (
                <GroupListItem key={g.id} group={g} base={base} apiHeaders={apiHeaders} />
              ))}
            </ul>
          )
        ) : loading ? (
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
              onClick={() => refetchConversations()}
              className="mt-3 rounded-lg bg-clicvend-orange px-3 py-2 text-sm font-medium text-white hover:bg-clicvend-orange-dark"
            >
              Tentar novamente
            </button>
          </div>
          ) : filtered.length === 0 ? (
          <div className="p-6 text-center text-sm text-[#64748B]">
            <p className="font-semibold text-[#1E293B] text-base">Nenhuma conversa</p>
            <p className="mt-2 text-xs leading-relaxed">
              {activeTab === "mine" && "Você não tem conversas atribuídas. Novas conversas entram automaticamente pelas filas (não precisa sincronizar em Conexões)."}
              {activeTab === "queues" && "Nenhuma conversa nas suas filas no momento."}
              {activeTab === "novos" && "Novos chamados aparecem aqui. Clique em Pegar para assumir."}
              {activeTab === "mine_closed" && "Nenhum chamado encerrado por você ainda. Ao fechar atendimentos, eles aparecerão aqui."}
            </p>
            <p className="mt-3 text-xs leading-relaxed">
              Se você já tem contatos/conversas, confira a aba <strong>Filas</strong> ou as <Link href={`${base}/filas`} className="text-clicvend-orange hover:underline font-medium">Atribuições</Link>. Números conectados em <Link href={`${base}/conexoes`} className="text-clicvend-orange hover:underline font-medium">Conexões</Link> recebem mensagens e histórico em segundo plano.
            </p>
          </div>
        ) : (
          <>
            <ul className="divide-y divide-[#E2E8F0]/40 px-2">
              {filtered.map((c) => (
                <ConversationListItem
                  key={c.id}
                  conversation={c}
                  base={base}
                  currentId={currentId}
                  canClaim={Array.isArray(permissionsData?.permissions) && permissionsData.permissions.includes("inbox.claim")}
                  onClaim={async (conversationId) => {
                    const res = await fetch(`/api/conversations/${conversationId}/claim`, {
                      method: "POST",
                      credentials: "include",
                      headers: apiHeaders ?? {},
                    });
                    if (res.ok) {
                      queryClient.invalidateQueries({ queryKey: queryKeys.conversationListInfinite(slug ?? "", viewMode) });
                    }
                  }}
                  onHover={slug ? (id) => {
                    queryClient.prefetchQuery({
                      queryKey: queryKeys.conversation(id),
                      queryFn: () =>
                        fetch(`/api/conversations/${id}`, {
                          credentials: "include",
                          headers: apiHeaders,
                        }).then((r) => r.json()),
                    });
                  } : undefined}
                  showQueueColors={activeTab === "queues" || activeTab === "novos" || activeTab === "mine" || activeTab === "mine_closed"}
                  activeTab={activeTab}
                />
              ))}
            </ul>
          {hasMore && <div ref={loadMoreSentinelRef} className="h-1" aria-hidden />}
          {hasMore && (
            <div className="border-t border-[#E2E8F0]/60 p-3">
              <button
                type="button"
                onClick={() => loadMore()}
                disabled={loadingMore}
                className="w-full rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] py-2.5 text-sm font-semibold text-[#64748B] transition-all duration-200 hover:bg-[#F1F5F9] hover:border-[#CBD5E1] hover:shadow-sm disabled:opacity-60"
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
