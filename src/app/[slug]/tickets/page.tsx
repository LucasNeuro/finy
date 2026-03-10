"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useInfiniteQuery, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, GripVertical, LayoutGrid, Table2, Settings2, UserPlus, MessageSquare, ChevronLeft, ChevronRight, X, Hash, Layers, UserCheck } from "lucide-react";
import { ChannelIcon } from "@/components/ChannelIcon";
import { queryKeys } from "@/lib/query-keys";

const StatusConfigSideOver = dynamic(() => import("./StatusConfigSideOver").then((m) => ({ default: m.StatusConfigSideOver })), { ssr: false });
const ReassignSideOver = dynamic(() => import("./ReassignSideOver").then((m) => ({ default: m.ReassignSideOver })), { ssr: false });

const TICKETS_PAGE_SIZE = 40;
const TABLE_PAGE_SIZE = 20;

type Ticket = {
  id: string;
  customer_phone: string;
  customer_name: string | null;
  status: string;
  queue_id: string | null;
  assigned_to: string | null;
  assigned_to_name?: string | null;
  last_message_at: string;
  created_at: string;
  channel_name?: string | null;
  avatar_url?: string | null;
};

type TicketStatusColumn = {
  id: string;
  key: string;
  title: string;
  color_hex: string;
  is_closed: boolean;
  sort_order: number;
};

type Queue = { id: string; name: string };

const FALLBACK_STATUSES: TicketStatusColumn[] = [
  { id: "", key: "open", title: "Novo", color_hex: "#22C55E", is_closed: false, sort_order: 0 },
  // Status padrão "Fila" continua existindo na API, mas não exibimos como coluna no Kanban.
  { id: "", key: "in_progress", title: "Em atendimento", color_hex: "#8B5CF6", is_closed: false, sort_order: 1 },
  { id: "", key: "closed", title: "Encerrados", color_hex: "#64748B", is_closed: true, sort_order: 2 },
];

function normalizeStatus(raw: string): string {
  const s = (raw || "").toLowerCase().trim();
  if (s === "closed" || s === "fechado" || s === "resolvido") return "closed";
  if (s === "waiting" || s === "pendente" || s === "pending") return "waiting";
  if (s === "in_progress" || s === "atendimento" || s === "ongoing") return "in_progress";
  if (s === "in_queue") return "in_queue";
  if (s === "open") return "open";
  return s || "open";
}

function statusToApi(slug: string): string {
  return slug;
}

export default function TicketsPage() {
  const pathname = usePathname();
  const segments = pathname?.split("/").filter(Boolean) ?? [];
  const slug = segments[0];
  const apiHeaders = slug ? { "X-Company-Slug": slug } : undefined;

  const [queueId, setQueueId] = useState<string>("");
  const [viewMode, setViewMode] = useState<"kanban" | "table">("kanban");
  const [statusConfigOpen, setStatusConfigOpen] = useState(false);
  const [reassignTicket, setReassignTicket] = useState<Ticket | null>(null);
  const [tablePageIndex, setTablePageIndex] = useState(0);
  const [selectedTicketIds, setSelectedTicketIds] = useState<Set<string>>(new Set());
  const [bulkStatusSaving, setBulkStatusSaving] = useState(false);

  const queryClient = useQueryClient();

  const { data: permissionsData } = useQuery({
    queryKey: queryKeys.permissions(slug ?? ""),
    queryFn: async () => {
      const r = await fetch("/api/auth/permissions", { credentials: "include", headers: apiHeaders });
      return r.json();
    },
    enabled: !!slug,
    staleTime: 5 * 60 * 1000,
  });

  const permissions = Array.isArray(permissionsData?.permissions) ? permissionsData.permissions : [];
  const canAccessTickets = permissions.includes("tickets.view");
  const canManageTickets = permissions.includes("inbox.manage_tickets") || permissions.includes("inbox.see_all");
  const canManageStatuses = permissions.includes("queues.manage");

  const { data: queuesData } = useQuery({
    queryKey: queryKeys.queues(slug ?? ""),
    queryFn: async () => {
      const r = await fetch("/api/queues?for_inbox=1", { credentials: "include", headers: apiHeaders });
      const data = await r.json();
      return Array.isArray(data) ? data.map((q: { id: string; name: string }) => ({ id: q.id, name: q.name ?? "(sem nome)" })) : [];
    },
    enabled: !!slug,
    staleTime: 60 * 1000,
  });
  const queues = queuesData ?? [];

  const statusUrl = queueId ? `/api/queues/${encodeURIComponent(queueId)}/ticket-statuses` : "/api/ticket-statuses";
  const { data: statusesData } = useQuery({
    queryKey: queryKeys.ticketStatuses(slug ?? "", queueId || undefined),
    queryFn: async () => {
      const r = await fetch(statusUrl, { credentials: "include", headers: apiHeaders });
      return r.json();
    },
    enabled: !!slug,
    staleTime: 60 * 1000,
  });

  const statusColumns = useMemo(() => {
    if (Array.isArray(statusesData) && statusesData.length > 0) {
      return statusesData
        // Não exibimos a coluna padrão "Fila" no Kanban; ela continua válida na API/chat.
        .filter((s: { slug: string }) => s.slug !== "in_queue")
        .map((s: { id: string; name: string; slug: string; color_hex?: string; is_closed?: boolean; sort_order?: number }) => ({
          id: s.id,
          key: s.slug,
          title: s.name,
          color_hex: s.color_hex ?? "#64748B",
          is_closed: !!s.is_closed,
          sort_order: s.sort_order ?? 0,
        }));
    }
    return FALLBACK_STATUSES;
  }, [statusesData]);

  const {
    data: ticketsData,
    isLoading: loading,
    error: ticketsError,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage: loadingMore,
    refetch: refetchTickets,
  } = useInfiniteQuery({
    queryKey: queryKeys.ticketsList(slug ?? "", queueId, !canManageTickets),
    queryFn: async ({ pageParam = 0 }) => {
      const p = new URLSearchParams();
      p.set("include_closed", "1");
      p.set("limit", String(TICKETS_PAGE_SIZE));
      p.set("offset", String(pageParam));
      p.set("only_assigned_to_me", canManageTickets ? "0" : "1");
      if (queueId) p.set("queue_id", queueId);
      const r = await fetch(`/api/conversations?${p}`, { credentials: "include", headers: apiHeaders });
      if (!r.ok) {
        const body = await r.json().catch(() => ({}));
        throw new Error(body?.error || "Falha ao carregar tickets");
      }
      return r.json();
    },
    initialPageParam: 0,
    getNextPageParam: (lastPage, allPages) => {
      const loaded = allPages.reduce((acc, pg) => acc + (Array.isArray(pg?.data) ? pg.data.length : 0), 0);
      const total = typeof lastPage?.total === "number" ? lastPage.total : 0;
      return loaded < total ? loaded : undefined;
    },
    enabled: !!slug && permissionsData !== undefined,
    staleTime: 45 * 1000,
  });

  const tickets = ticketsData?.pages.flatMap((pg) => (Array.isArray(pg?.data) ? pg.data : [])) ?? [];
  const totalCount = ticketsData?.pages[0]?.total ?? tickets.length;
  const error = ticketsError instanceof Error ? ticketsError.message : null;

  const { data: tablePageData, isLoading: tableLoading } = useQuery({
    queryKey: [...queryKeys.ticketsList(slug ?? "", queueId, !canManageTickets), "table", tablePageIndex],
    queryFn: async () => {
      const p = new URLSearchParams();
      p.set("include_closed", "1");
      p.set("limit", String(TABLE_PAGE_SIZE));
      p.set("offset", String(tablePageIndex * TABLE_PAGE_SIZE));
      p.set("only_assigned_to_me", canManageTickets ? "0" : "1");
      if (queueId) p.set("queue_id", queueId);
      const r = await fetch(`/api/conversations?${p}`, { credentials: "include", headers: apiHeaders });
      if (!r.ok) {
        const body = await r.json().catch(() => ({}));
        throw new Error(body?.error || "Falha ao carregar tickets");
      }
      return r.json();
    },
    enabled: !!slug && permissionsData !== undefined && viewMode === "table",
    staleTime: 45 * 1000,
  });
  const tableTickets = Array.isArray(tablePageData?.data) ? tablePageData.data : [];
  const tableTotal = typeof tablePageData?.total === "number" ? tablePageData.total : 0;
  const tablePageCount = Math.max(1, Math.ceil(tableTotal / TABLE_PAGE_SIZE));

  useEffect(() => {
    if (viewMode === "table") {
      setTablePageIndex(0);
      setSelectedTicketIds(new Set());
    }
  }, [viewMode, queueId]);

  useEffect(() => {
    const el = tableSelectAllRef.current;
    if (!el || tableTickets.length === 0) return;
    const selectedOnPage = tableTickets.filter((t) => selectedTicketIds.has(t.id)).length;
    el.indeterminate = selectedOnPage > 0 && selectedOnPage < tableTickets.length;
  }, [tableTickets, selectedTicketIds]);

  const refreshStatuses = useCallback(() => {
    if (!slug) return;
    queryClient.invalidateQueries({ queryKey: queryKeys.ticketStatuses(slug, queueId || undefined) });
  }, [slug, queueId, queryClient]);

  useEffect(() => {
    const onReset = () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.ticketsList(slug ?? "", queueId, !canManageTickets) });
    };
    window.addEventListener("conversations-status-reset", onReset);
    return () => window.removeEventListener("conversations-status-reset", onReset);
  }, [slug, queueId, canManageTickets, queryClient]);

  const [saving, setSaving] = useState(false);
  const [dragOverColumn, setDragOverColumn] = useState<string | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [draggingColumnKey, setDraggingColumnKey] = useState<string | null>(null);
  const [reorderingColumns, setReorderingColumns] = useState(false);

  const sentinelRefsByColumn = useRef<Record<string, HTMLDivElement>>({});
  const tableSelectAllRef = useRef<HTMLInputElement>(null);
  const loadMore = useCallback(() => {
    if (loading || loadingMore || !hasNextPage) return;
    fetchNextPage();
  }, [loading, loadingMore, hasNextPage, fetchNextPage]);

  useEffect(() => {
    const sentinels = Object.values(sentinelRefsByColumn.current).filter(Boolean);
    if (sentinels.length === 0 || !hasNextPage || loading || loadingMore) return;
    const obs = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) loadMore();
      },
      { rootMargin: "200px", threshold: 0 }
    );
    sentinels.forEach((el) => obs.observe(el));
    return () => obs.disconnect();
  }, [hasNextPage, loading, loadingMore, loadMore, statusColumns.length]);

  const handleReassigned = useCallback(
    (ticketId: string, newAssigneeId: string, newAssigneeName: string) => {
      queryClient.setQueryData(
        queryKeys.ticketsList(slug ?? "", queueId, !canManageTickets),
        (old: { pages: { data: Ticket[]; total: number }[]; pageParams: unknown[] } | undefined) => {
          if (!old) return old;
          return {
            ...old,
            pages: old.pages.map((pg) => ({
              ...pg,
              data: pg.data.map((t) =>
                t.id === ticketId
                  ? { ...t, assigned_to: newAssigneeId || null, assigned_to_name: newAssigneeName || null }
                  : t
              ),
            })),
          };
        }
      );
    },
    [slug, queueId, canManageTickets, queryClient]
  );

  const updateTicketStatus = useCallback(async (ticketId: string, newStatusSlug: string) => {
    const apiStatus = statusToApi(newStatusSlug);
    const listKey = queryKeys.ticketsList(slug ?? "", queueId, !canManageTickets);
    const previousData = queryClient.getQueryData<{ pages: { data: Ticket[]; total: number }[]; pageParams: unknown[] }>(listKey);

    // Atualização otimista: move o card na hora; se a API falhar, revertemos.
    queryClient.setQueryData(listKey, (old: typeof previousData) => {
      if (!old) return old;
      return {
        ...old,
        pages: old.pages.map((pg) => ({
          ...pg,
          data: pg.data.map((t) => (t.id === ticketId ? { ...t, status: apiStatus } : t)),
        })),
      };
    });

    setSaving(true);
    try {
      const r = await fetch(`/api/conversations/${ticketId}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json", ...apiHeaders },
        body: JSON.stringify({ status: apiStatus }),
      });
      if (!r.ok) {
        const d = await r.json().catch(() => ({}));
        if (previousData) queryClient.setQueryData(listKey, previousData);
        alert(d?.error ?? "Falha ao atualizar status");
      } else {
        queryClient.invalidateQueries({ queryKey: queryKeys.conversationListInfinite(slug ?? "", "queues") });
        queryClient.invalidateQueries({ queryKey: queryKeys.conversationListInfinite(slug ?? "", "mine") });
        queryClient.invalidateQueries({ queryKey: queryKeys.counts(slug ?? "") });
      }
    } catch {
      if (previousData) queryClient.setQueryData(listKey, previousData);
      alert("Erro de rede");
    } finally {
      setSaving(false);
    }
  }, [apiHeaders, slug, queueId, canManageTickets, queryClient]);

  const reorderColumns = useCallback(
    async (fromIndex: number, toIndex: number) => {
      if (fromIndex === toIndex) return;
      const newOrder = [...statusColumns];
      const [removed] = newOrder.splice(fromIndex, 1);
      if (!removed) return;
      newOrder.splice(toIndex, 0, removed);
      const orderIds = newOrder.map((c) => c.id).filter(Boolean);
      if (orderIds.length === 0) return;
      setReorderingColumns(true);
      try {
        const r = queueId
          ? await fetch(`/api/queues/${encodeURIComponent(queueId)}/ticket-statuses`, {
              method: "PUT",
              credentials: "include",
              headers: { "Content-Type": "application/json", ...apiHeaders },
              body: JSON.stringify({ ticket_status_ids: orderIds }),
            })
          : await fetch("/api/ticket-statuses/reorder", {
              method: "PUT",
              credentials: "include",
              headers: { "Content-Type": "application/json", ...apiHeaders },
              body: JSON.stringify({ order: orderIds }),
            });
        if (r.ok) {
          refreshStatuses();
        } else {
          const d = await r.json().catch(() => ({}));
          alert(d?.error ?? "Falha ao reordenar");
        }
      } catch {
        alert("Erro de rede");
      } finally {
        setReorderingColumns(false);
        setDraggingColumnKey(null);
      }
    },
    [statusColumns, queueId, apiHeaders, refreshStatuses]
  );

  const columns = useMemo(() => {
    const grouped: Record<string, Ticket[]> = {};
    statusColumns.forEach((c) => {
      grouped[c.key] = [];
    });
    for (const t of tickets) {
      const baseKey = normalizeStatus(t.status);
      // No Kanban, tratamos "in_queue" como "open" (sem coluna própria).
      const key = baseKey === "in_queue" ? "open" : baseKey;
      if (!grouped[key]) grouped[key] = [];
      grouped[key].push(t);
    }
    return statusColumns.map((c) => ({
      ...c,
      items: grouped[c.key] ?? [],
    }));
  }, [tickets, statusColumns]);

  if (slug && permissionsData !== undefined && !canAccessTickets) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 bg-[#F1F5F9] p-8">
        <h1 className="text-lg font-semibold text-[#0F172A]">Sem permissão</h1>
        <p className="max-w-md text-center text-sm text-[#64748B]">
          Você não tem acesso ao módulo Tickets. Peça ao administrador para conceder a permissão &quot;Acesso: ver módulo Tickets&quot; no seu cargo.
        </p>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col gap-4 bg-[#F1F5F9] p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-[#0F172A]">Tickets</h1>
          <p className="text-sm text-[#64748B]">
            Visão em quadro dos atendimentos por status. {canManageTickets ? "Você vê todos os tickets e pode reatribuir e mudar status." : "Você vê apenas seus tickets."}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex rounded-lg border border-[#E2E8F0] bg-white p-0.5">
            <button
              type="button"
              onClick={() => setViewMode("kanban")}
              className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                viewMode === "kanban" ? "bg-clicvend-orange text-white" : "text-[#64748B] hover:bg-[#F1F5F9]"
              }`}
            >
              <LayoutGrid className="h-4 w-4" />
              Kanban
            </button>
            <button
              type="button"
              onClick={() => setViewMode("table")}
              className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                viewMode === "table" ? "bg-clicvend-orange text-white" : "text-[#64748B] hover:bg-[#F1F5F9]"
              }`}
            >
              <Table2 className="h-4 w-4" />
              Tabela
            </button>
          </div>
          {canManageStatuses && (
            <button
              type="button"
              onClick={() => setStatusConfigOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-[#E2E8F0] bg-white px-3 py-1.5 text-sm font-medium text-[#64748B] hover:bg-[#F8FAFC] hover:text-[#0F172A]"
              title="Configurar status"
            >
              <Settings2 className="h-4 w-4" />
              Configurar status
            </button>
          )}
          <label className="flex items-center gap-2 text-sm text-[#64748B]">
            <span>Fila:</span>
            <select
              value={queueId}
              onChange={(e) => setQueueId(e.target.value)}
              className="rounded-lg border border-[#E2E8F0] bg-white px-3 py-1.5 text-sm font-medium text-[#1E293B] hover:border-[#CBD5E1]"
              title="Filtrar Kanban por fila. Todas = status padrão. Fila específica = status padrão + exclusivos da fila."
            >
              <option value="">Todas</option>
              {queues.map((q) => (
                <option key={q.id} value={q.id}>
                  {q.name}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>

      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      )}

      {loading ? (
        <div className="flex min-h-0 flex-1 gap-4 overflow-x-auto pb-2">
          {statusColumns.map((col) => (
            <div key={col.key} className="flex min-w-[280px] max-w-[320px] flex-1 flex-col gap-3 rounded-lg border-2 border-transparent bg-[#F8FAFC] p-3">
              <div className="flex items-center justify-between gap-2">
                <div className="h-6 w-24 animate-pulse rounded-full bg-[#E2E8F0]" />
                <div className="h-5 w-8 animate-pulse rounded-full bg-[#E2E8F0]" />
              </div>
              <div className="flex flex-1 flex-col gap-2">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="h-20 animate-pulse rounded-md bg-[#E2E8F0]" />
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : tickets.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center rounded-xl border-2 border-dashed border-[#E2E8F0] bg-white/80 p-8 text-center">
          <p className="text-base font-medium text-[#1E293B]">
            {queueId ? "Nenhum ticket nesta fila" : "Nenhum ticket"}
          </p>
          <p className="mt-2 max-w-md text-sm text-[#64748B]">
            {queueId ? (
              <>Tente selecionar <strong>Todas</strong> no filtro de fila ou conecte o número em <Link href={slug ? `/${slug}/conexoes` : "#"} className="text-clicvend-orange hover:underline">Conexões</Link>.</>
            ) : (
              <>Ao conectar o número em <Link href={slug ? `/${slug}/conexoes` : "#"} className="text-clicvend-orange hover:underline">Conexões</Link>, o histórico é sincronizado automaticamente.</>
            )}
          </p>
          {!canManageTickets && <p className="mt-2 text-xs text-[#94A3B8]">Você vê apenas tickets atribuídos a você. Pegue chamados no Chat para que apareçam aqui.</p>}
        </div>
      ) : viewMode === "table" ? (
        <div className="flex flex-1 flex-col overflow-hidden rounded-xl border border-[#E2E8F0] bg-white">
          {selectedTicketIds.size > 0 && (
            <div className="shrink-0 flex flex-wrap items-center justify-between gap-4 px-4 py-3 bg-clicvend-orange/10 border-b border-[#E2E8F0]">
              <span className="text-sm font-medium text-[#1E293B]">
                {selectedTicketIds.size} ticket(s) selecionado(s)
              </span>
              <div className="inline-flex flex-wrap rounded-lg border border-[#E2E8F0] bg-white overflow-hidden shadow-sm">
                {canManageTickets && (
                  <select
                    className="inline-flex items-center gap-1.5 border-r border-[#E2E8F0] bg-white px-3 py-2 text-sm font-medium text-[#334155] hover:bg-[#F8FAFC] disabled:opacity-60"
                    defaultValue=""
                    onChange={async (e) => {
                      const slugStatus = e.target.value;
                      if (!slugStatus) return;
                      e.target.value = "";
                      setBulkStatusSaving(true);
                      try {
                        const apiStatus = statusToApi(slugStatus);
                        await Promise.all(
                          Array.from(selectedTicketIds).map((id) =>
                            fetch(`/api/conversations/${id}`, {
                              method: "PATCH",
                              credentials: "include",
                              headers: { "Content-Type": "application/json", ...apiHeaders },
                              body: JSON.stringify({ status: apiStatus }),
                            })
                          )
                        );
                        queryClient.invalidateQueries({ queryKey: queryKeys.ticketsList(slug ?? "", queueId, !canManageTickets) });
                        queryClient.invalidateQueries({ queryKey: queryKeys.counts(slug ?? "") });
                        setSelectedTicketIds(new Set());
                      } catch {
                        alert("Erro ao atualizar status");
                      } finally {
                        setBulkStatusSaving(false);
                      }
                    }}
                    disabled={bulkStatusSaving}
                  >
                    <option value="">Alterar status</option>
                    {statusColumns.map((col) => (
                      <option key={col.id || col.key} value={col.key}>{col.title}</option>
                    ))}
                  </select>
                )}
                {canManageTickets && tableTickets.some((t) => selectedTicketIds.has(t.id)) && (
                  <button
                    type="button"
                    onClick={() => {
                      const first = tableTickets.find((t) => selectedTicketIds.has(t.id));
                      if (first) setReassignTicket(first);
                    }}
                    className="inline-flex items-center gap-1.5 border-r border-[#E2E8F0] bg-white px-3 py-2 text-sm font-medium text-[#334155] hover:bg-[#F8FAFC] hover:text-clicvend-orange disabled:opacity-60"
                    title="Reatribuir selecionados (abre o primeiro)"
                  >
                    <UserPlus className="h-4 w-4" />
                    Reatribuir
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setSelectedTicketIds(new Set())}
                  className="inline-flex items-center gap-1.5 bg-white px-3 py-2 text-sm font-medium text-[#64748B] hover:bg-[#F1F5F9] disabled:opacity-60 last:border-r-0"
                  title="Desmarcar todos os tickets selecionados"
                >
                  <X className="h-4 w-4" />
                  Limpar seleção
                </button>
              </div>
            </div>
          )}
          <div className="flex-1 min-h-0 overflow-auto">
            {tableLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-10 w-10 animate-spin text-clicvend-orange" />
              </div>
            ) : (
              <table className="w-full min-w-[640px] border-collapse text-sm">
                <thead className="sticky top-0 z-10 bg-[#F8FAFC]">
                  <tr className="border-b border-[#E2E8F0]">
                    <th className="w-10 px-4 py-3 text-left">
                      <input
                        ref={tableSelectAllRef}
                        type="checkbox"
                        checked={tableTickets.length > 0 && tableTickets.every((t) => selectedTicketIds.has(t.id))}
                        onChange={() => {
                          if (tableTickets.every((t) => selectedTicketIds.has(t.id))) {
                            setSelectedTicketIds((prev) => {
                              const next = new Set(prev);
                              tableTickets.forEach((t) => next.delete(t.id));
                              return next;
                            });
                          } else {
                            setSelectedTicketIds((prev) => {
                              const next = new Set(prev);
                              tableTickets.forEach((t) => next.add(t.id));
                              return next;
                            });
                          }
                        }}
                        className="h-4 w-4 rounded border-[#E2E8F0] text-clicvend-orange focus:ring-clicvend-orange"
                        aria-label="Selecionar todos da página"
                      />
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-[#64748B]">Cliente</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-[#64748B]">Status</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-[#64748B]">Últ. msg</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-[#64748B]">Atendente</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-[#64748B]">Entrou</th>
                    {canManageTickets && (
                      <th className="w-12 px-4 py-3 text-center text-xs font-semibold uppercase tracking-wider text-[#64748B]">Reatribuir</th>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {tableTickets.map((t) => {
                    const statusKey = normalizeStatus(t.status);
                    const colDef = statusColumns.find((s) => s.key === statusKey);
                    const barColor = colDef?.color_hex ?? "#64748B";
                    const statusLabel =
                      colDef?.title ??
                      (statusKey === "open"
                        ? "Novo"
                        : statusKey === "in_queue"
                          ? "Fila"
                          : statusKey === "in_progress"
                            ? "Em atendimento"
                            : statusKey === "closed"
                              ? "Encerrado"
                              : statusKey);
                    return (
                      <tr key={t.id} className="border-b border-[#E2E8F0] hover:bg-[#F8FAFC]">
                        <td className="w-10 px-2 py-3">
                          <input
                            type="checkbox"
                            checked={selectedTicketIds.has(t.id)}
                            onChange={() => {
                              setSelectedTicketIds((prev) => {
                                const next = new Set(prev);
                                if (next.has(t.id)) next.delete(t.id);
                                else next.add(t.id);
                                return next;
                              });
                            }}
                            className="h-4 w-4 rounded border-[#E2E8F0] text-clicvend-orange focus:ring-clicvend-orange"
                            aria-label={`Selecionar ${t.customer_name || t.customer_phone}`}
                          />
                        </td>
                        <td className="px-4 py-3">
                          <Link href={slug ? `/${slug}/conversas/${t.id}` : "#"} className="font-medium text-[#0F172A] hover:text-clicvend-orange">
                            {t.customer_name || t.customer_phone}
                          </Link>
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className="inline-flex rounded-full px-2 py-0.5 text-xs font-semibold uppercase text-white"
                            style={{ backgroundColor: barColor }}
                          >
                            {statusLabel}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-[#64748B]">
                          {t.last_message_at
                            ? new Date(t.last_message_at).toLocaleString("pt-BR", {
                                day: "2-digit",
                                month: "2-digit",
                                hour: "2-digit",
                                minute: "2-digit",
                              })
                            : "—"}
                        </td>
                        <td className="px-4 py-3 text-[#64748B]">
                          {t.assigned_to_name ?? "—"}
                        </td>
                        <td className="px-4 py-3 text-[#64748B]">
                          {new Date(t.created_at).toLocaleDateString("pt-BR", {
                            day: "2-digit",
                            month: "2-digit",
                            year: "2-digit",
                          })}
                        </td>
                        {canManageTickets && (
                          <td className="px-4 py-3 text-center">
                            <button
                              type="button"
                              onClick={() => setReassignTicket(t)}
                              className="inline-flex items-center justify-center rounded p-2 text-[#64748B] hover:bg-[#E2E8F0] hover:text-clicvend-orange"
                              title="Reatribuir a outro agente"
                            >
                              <UserPlus className="h-4 w-4" />
                            </button>
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
          <div className="shrink-0 flex items-center justify-between gap-2 border-t border-[#E2E8F0] bg-[#F8FAFC] px-4 py-2">
            <span className="text-sm text-[#64748B]">
              Página {tablePageIndex + 1} de {tablePageCount} ({tableTotal} ticket{tableTotal !== 1 ? "s" : ""})
            </span>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => { setTablePageIndex((i) => Math.max(0, i - 1)); setSelectedTicketIds(new Set()); }}
                disabled={tablePageIndex === 0}
                className="rounded p-2 text-[#64748B] hover:bg-white hover:text-[#1E293B] disabled:opacity-40 disabled:pointer-events-none"
                aria-label="Página anterior"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => { setTablePageIndex((i) => Math.min(tablePageCount - 1, i + 1)); setSelectedTicketIds(new Set()); }}
                disabled={tablePageIndex >= tablePageCount - 1}
                className="rounded p-2 text-[#64748B] hover:bg-white hover:text-[#1E293B] disabled:opacity-40 disabled:pointer-events-none"
                aria-label="Próxima página"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 gap-4 overflow-x-auto pb-2">
          {columns.map((col, colIndex) => (
            <div
              key={col.key}
              className={`flex min-w-[280px] max-w-[320px] flex-1 flex-col min-h-0 rounded-lg border-2 bg-[#F8FAFC] p-3 transition-colors ${
                dragOverColumn === col.key ? "border-clicvend-orange bg-clicvend-orange/5" : "border-transparent"
              } ${draggingColumnKey === col.key ? "opacity-70" : ""}`}
              onDragOver={(e) => {
                e.preventDefault();
                e.dataTransfer.dropEffect = "move";
                if (e.dataTransfer.types.includes("columnKey")) setDragOverColumn(col.key);
                else if (e.dataTransfer.types.includes("ticketId")) setDragOverColumn(col.key);
              }}
              onDragLeave={() => setDragOverColumn(null)}
              onDrop={(e) => {
                e.preventDefault();
                setDragOverColumn(null);
                const columnKey = e.dataTransfer.getData("columnKey");
                const ticketId = e.dataTransfer.getData("ticketId");
                const fromStatus = e.dataTransfer.getData("fromStatus");
                if (columnKey && columnKey !== col.key) {
                  const fromIndex = columns.findIndex((c) => c.key === columnKey);
                  if (fromIndex >= 0) reorderColumns(fromIndex, colIndex);
                } else if (ticketId && fromStatus !== col.key) {
                  updateTicketStatus(ticketId, col.key);
                }
              }}
            >
              <div
                className={`mb-3 flex shrink-0 items-center justify-between gap-2 ${
                  canManageStatuses ? "cursor-grab active:cursor-grabbing" : ""
                }`}
                draggable={canManageStatuses && !reorderingColumns}
                onDragStart={(e) => {
                  if (!canManageStatuses || reorderingColumns) return;
                  setDraggingColumnKey(col.key);
                  e.dataTransfer.setData("columnKey", col.key);
                  e.dataTransfer.setData("columnId", col.id);
                  e.dataTransfer.effectAllowed = "move";
                }}
                onDragEnd={() => setDraggingColumnKey(null)}
                title={canManageStatuses ? "Arraste para reordenar as colunas" : undefined}
              >
                {canManageStatuses && (
                  <GripVertical className="h-4 w-4 shrink-0 text-[#94A3B8]" aria-hidden />
                )}
                <span
                  className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold uppercase text-white"
                  style={{ backgroundColor: col.color_hex }}
                >
                  {col.title}
                </span>
                <span className="rounded-full bg-[#E2E8F0] px-2.5 py-0.5 text-xs font-medium text-[#64748B]">
                  {col.items.length}
                </span>
              </div>
              <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto overflow-x-hidden rounded-md">
                {col.items.map((t) => {
                  const statusKey = normalizeStatus(t.status);
                  const colDef = statusColumns.find((s) => s.key === statusKey);
                  const barColor = colDef?.color_hex ?? "#3B82F6";
                  const statusLabel =
                    colDef?.title ??
                    (statusKey === "open"
                      ? "Novo"
                      : statusKey === "in_queue"
                        ? "Fila"
                        : statusKey === "in_progress"
                          ? "Em atendimento"
                          : statusKey === "closed"
                            ? "Encerrado"
                            : statusKey);
                  const lastMsgAt = t.last_message_at
                    ? new Date(t.last_message_at).toLocaleString("pt-BR", {
                        day: "2-digit",
                        month: "2-digit",
                        hour: "2-digit",
                        minute: "2-digit",
                      })
                    : null;
                  const displayName = t.customer_name || t.customer_phone || "?";
                  return (
                  <div
                    key={t.id}
                    draggable={canManageTickets && !saving}
                    onDragStart={(e) => {
                      setDraggingId(t.id);
                      e.dataTransfer.setData("ticketId", t.id);
                      e.dataTransfer.setData("fromStatus", normalizeStatus(t.status));
                      e.dataTransfer.effectAllowed = "move";
                    }}
                    onDragEnd={() => setDraggingId(null)}
                    className={`group relative flex flex-shrink-0 flex-col rounded-md border border-[#E2E8F0] bg-white text-sm shadow-sm transition-all overflow-hidden ${
                      canManageTickets ? "cursor-grab active:cursor-grabbing" : ""
                    } ${draggingId === t.id ? "opacity-60 shadow-lg" : "hover:shadow-md hover:border-[#CBD5E1]"}`}
                  >
                    <div className="flex shrink-0 items-center justify-between gap-1 border-b border-[#F1F5F9] bg-[#FAFBFC] px-2 py-1.5">
                      <Link
                        href={slug ? `/${slug}/conversas/${t.id}` : "#"}
                        className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs font-medium text-[#64748B] hover:bg-[#E2E8F0] hover:text-[#0F172A]"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <MessageSquare className="h-3.5 w-3.5" />
                        Abrir
                      </Link>
                      {canManageTickets && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            setReassignTicket(t);
                          }}
                          className="inline-flex items-center justify-center rounded p-1.5 text-[#64748B] hover:bg-[#E2E8F0] hover:text-clicvend-orange"
                          title="Reatribuir a outro agente"
                        >
                          <UserPlus className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                    <Link
                      href={slug ? `/${slug}/conversas/${t.id}` : "#"}
                      className="min-w-0 flex-1 flex flex-col cursor-pointer"
                    >
                      <div className="p-3">
                        <div className="flex items-start gap-2 mb-1.5">
                          <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-gradient-to-br from-[#F1F5F9] to-[#E2E8F0] text-[#64748B] ring-1 ring-white/80">
                            {t.avatar_url ? (
                              <img
                                src={t.avatar_url.startsWith("http") ? `/api/contacts/avatar?url=${encodeURIComponent(t.avatar_url)}` : t.avatar_url}
                                alt=""
                                className="h-full w-full object-cover"
                              />
                            ) : (
                              <span className="text-xs font-semibold">
                                {t.customer_name
                                  ? t.customer_name.trim().split(/\s+/).map((w) => w[0]).slice(0, 2).join("").toUpperCase() || "?"
                                  : (t.customer_phone || "?").slice(-2)}
                              </span>
                            )}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center justify-between gap-1.5">
                              <p className="truncate font-medium text-[#0F172A]" title={displayName}>
                                {displayName}
                              </p>
                              <ChannelIcon variant="outline" channelName={t.channel_name} size={18} title={t.channel_name ?? "WhatsApp"} />
                            </div>
                            <span
                              className="inline-flex shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase text-white mt-0.5"
                              style={{ backgroundColor: barColor }}
                            >
                              {statusLabel}
                            </span>
                          </div>
                        </div>
                        <div className="text-[11px] text-[#64748B] space-y-0.5">
                          {lastMsgAt && <span title="Última mensagem">Últ. msg: {lastMsgAt}</span>}
                          <span>
                            Entrou:{" "}
                            {new Date(t.created_at).toLocaleDateString("pt-BR", {
                              day: "2-digit",
                              month: "2-digit",
                              year: "2-digit",
                            })}
                          </span>
                        </div>
                      </div>
                      <footer className="flex flex-wrap items-center gap-x-2 gap-y-1 border-t border-[#F1F5F9] bg-[#F8FAFC]/80 px-3 py-2 text-[10px] text-[#64748B]">
                        <span className="inline-flex items-center gap-1" title={`ID: ${t.id}`}>
                          <Hash className="h-3.5 w-3.5 shrink-0 text-[#94A3B8]" />
                          <span className="font-mono font-medium">{t.id.replace(/-/g, "").slice(0, 8).toUpperCase()}</span>
                        </span>
                        {t.channel_name && (
                          <span className="inline-flex items-center gap-1 truncate max-w-[90px]" title={t.channel_name}>
                            <Layers className="h-3.5 w-3.5 shrink-0 text-[#94A3B8]" />
                            {t.channel_name}
                          </span>
                        )}
                        <span className="inline-flex items-center gap-1 ml-auto" title={t.assigned_to_name ? `Atendente: ${t.assigned_to_name}` : "Ninguém pegou ainda"}>
                          <UserCheck className="h-3.5 w-3.5 shrink-0 text-[#94A3B8]" />
                          <span className="truncate max-w-[72px]"><span className="text-[#94A3B8]">Atendente:</span> {t.assigned_to_name ?? "—"}</span>
                        </span>
                      </footer>
                    </Link>
                  </div>
                  );
                })}
                <div
                  ref={(el) => {
                    if (el) sentinelRefsByColumn.current[col.key] = el;
                  }}
                  className="h-4 flex-shrink-0"
                  aria-hidden
                >
                  {hasNextPage && (loadingMore || loading) && col.key === columns[0]?.key && (
                    <div className="flex items-center justify-center py-2 text-[#64748B]">
                      <Loader2 className="h-5 w-5 animate-spin" />
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <StatusConfigSideOver
        open={statusConfigOpen}
        onClose={() => setStatusConfigOpen(false)}
        companySlug={slug ?? ""}
        queues={queues}
        onSaved={refreshStatuses}
      />

      <ReassignSideOver
        open={!!reassignTicket}
        onClose={() => setReassignTicket(null)}
        ticketId={reassignTicket?.id ?? ""}
        ticketCustomerName={reassignTicket?.customer_name ?? reassignTicket?.customer_phone ?? null}
        currentAssignedToName={reassignTicket?.assigned_to_name ?? null}
        companySlug={slug ?? ""}
        onReassigned={handleReassigned}
      />
    </div>
  );
}
