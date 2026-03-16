"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import {
  Inbox,
  Plus,
  Loader2,
  Plug,
  Settings,
  Trash2,
  Search,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
  Users,
  Layers3,
  Link2,
} from "lucide-react";
import { usePathname } from "next/navigation";
import { SideOver } from "@/components/SideOver";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { QueueConfigSideOver, type Queue } from "./QueueConfigSideOver";

const QUEUES_PAGE_SIZE = 5;
const MAX_QUEUES_PER_CHANNEL = 8;

type ChannelRef = {
  id: string;
  name: string;
};

function getCompanySlug(pathname: string | null): string {
  const fromPath = pathname?.split("/").filter(Boolean)[0] ?? "";
  if (fromPath && !["login", "api", "onboarding", "auth"].includes(fromPath)) return fromPath;
  if (typeof document !== "undefined") {
    const match = document.cookie.match(/\bclicvend_slug=([^;]+)/);
    if (match?.[1]) return match[1].trim();
  }
  return fromPath;
}

export default function FilasPage() {
  const pathname = usePathname();
  const slug = getCompanySlug(pathname);
  const apiHeaders = slug ? { "X-Company-Slug": slug } : undefined;

  const [queues, setQueues] = useState<Queue[]>([]);
  const [queueChannelCount, setQueueChannelCount] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);

  const [newQueueOpen, setNewQueueOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newQueueType, setNewQueueType] = useState<"standard" | "commercial">("standard");
  const [useGroups, setUseGroups] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const [search, setSearch] = useState("");
  const [linkedFilter, setLinkedFilter] = useState<"all" | "with" | "without">("all");
  const [selectedQueueIds, setSelectedQueueIds] = useState<Set<string>>(new Set());
  const [pageIndex, setPageIndex] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const [channels, setChannels] = useState<ChannelRef[]>([]);
  const [queueAgentsCount, setQueueAgentsCount] = useState<Record<string, number>>({});
  const [queueStatusesCount, setQueueStatusesCount] = useState<Record<string, number>>({});
  const [linkChannelsOpen, setLinkChannelsOpen] = useState(false);
  const [selectedChannelIdsToLink, setSelectedChannelIdsToLink] = useState<Set<string>>(new Set());
  const [linkingChannels, setLinkingChannels] = useState(false);

  const [configQueue, setConfigQueue] = useState<Queue | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<{ ids: string[]; label: string } | null>(null);

  const fetchQueues = useCallback(() => {
    return fetch("/api/queues?for_management=1", { credentials: "include", headers: apiHeaders })
      .then((r) => r.json())
      .then((data) => setQueues(Array.isArray(data) ? data : []))
      .catch(() => setQueues([]));
  }, [slug]);

  const fetchQueueLinkedCount = useCallback(
    async (queueId: string) => {
      const r = await fetch(`/api/queues/${encodeURIComponent(queueId)}/channels`, {
        credentials: "include",
        headers: apiHeaders,
      });
      const data = await r.json();
      if (r.ok && Array.isArray(data?.linked)) return data.linked.length;
      return 0;
    },
    [slug]
  );

  useEffect(() => {
    setLoading(true);
    fetchQueues().finally(() => setLoading(false));
  }, [fetchQueues]);

  const refreshAll = useCallback(async () => {
    setRefreshing(true);
    try {
      await Promise.all([
        fetchQueues(),
        fetch("/api/channels", { credentials: "include", headers: apiHeaders })
          .then((r) => r.json())
          .then((data) => setChannels(Array.isArray(data) ? data : []))
          .catch(() => setChannels([])),
      ]);
    } finally {
      setRefreshing(false);
    }
  }, [fetchQueues, slug]);

  useEffect(() => {
    fetch("/api/channels", { credentials: "include", headers: apiHeaders })
      .then((r) => r.json())
      .then((data) => setChannels(Array.isArray(data) ? data : []))
      .catch(() => setChannels([]));
  }, [slug]);

  useEffect(() => {
    if (queues.length === 0) {
      setQueueChannelCount({});
      return;
    }
    let cancelled = false;
    Promise.all(
      queues.map((q) =>
        fetchQueueLinkedCount(q.id).then((count) => (cancelled ? null : { id: q.id, count }))
      )
    ).then((results) => {
      if (cancelled) return;
      const next: Record<string, number> = {};
      results.forEach((r) => {
        if (r) next[r.id] = r.count;
      });
      setQueueChannelCount((prev) => ({ ...prev, ...next }));
    });
    return () => {
      cancelled = true;
    };
  }, [queues, fetchQueueLinkedCount]);

  useEffect(() => {
    if (queues.length === 0) {
      setQueueAgentsCount({});
      setQueueStatusesCount({});
      return;
    }
    let cancelled = false;
    Promise.all(
      queues.map(async (q) => {
        const [assignRes, statusRes] = await Promise.all([
          fetch(`/api/queues/${encodeURIComponent(q.id)}/assignments`, {
            credentials: "include",
            headers: apiHeaders,
          }).then((r) => r.json()).catch(() => ({})),
          fetch(`/api/queues/${encodeURIComponent(q.id)}/ticket-statuses`, {
            credentials: "include",
            headers: apiHeaders,
          }).then((r) => r.json()).catch(() => []),
        ]);
        return {
          id: q.id,
          agents: Array.isArray(assignRes?.users) ? assignRes.users.length : 0,
          statuses: Array.isArray(statusRes) ? statusRes.length : 0,
        };
      })
    ).then((rows) => {
      if (cancelled) return;
      const nextAgents: Record<string, number> = {};
      const nextStatuses: Record<string, number> = {};
      rows.forEach((r) => {
        nextAgents[r.id] = r.agents;
        nextStatuses[r.id] = r.statuses;
      });
      setQueueAgentsCount(nextAgents);
      setQueueStatusesCount(nextStatuses);
    });
    return () => {
      cancelled = true;
    };
  }, [queues, slug]);

  const createQueue = async () => {
    const n = newName.trim();
    if (!n) {
      setError("Informe o nome da fila.");
      return;
    }
    setError("");
    setCreating(true);
    try {
      const slugVal =
        n
          .toLowerCase()
          .normalize("NFD")
          .replace(/[\u0300-\u036f]/g, "")
          .replace(/\s+/g, "-")
          .replace(/[^a-z0-9-]/g, "") || "fila";
      const r = await fetch("/api/queues", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...apiHeaders },
        body: JSON.stringify({ name: n, slug: slugVal, use_groups: useGroups, queue_type: newQueueType }),
        credentials: "include",
      });
      const data = await r.json();
      if (!r.ok) {
        setError(data?.error ?? "Falha ao criar fila");
        setCreating(false);
        return;
      }
      setQueues((prev) => [
        ...prev,
        { id: data.id, name: data.name, slug: data.slug, queue_type: data.queue_type },
      ]);
      setQueueChannelCount((prev) => ({ ...prev, [data.id]: 0 }));
      setNewName("");
      setNewQueueType("standard");
      setUseGroups(false);
      setNewQueueOpen(false);
      setFeedback({ type: "success", message: `Fila "${data.name}" criada com sucesso.` });
      if (useGroups) fetchQueues();
    } catch {
      setError("Erro de rede.");
      setFeedback({ type: "error", message: "Não foi possível criar a fila. Tente novamente." });
    }
    setCreating(false);
  };

  const deleteQueues = async () => {
    const target = deleteConfirm;
    if (!target || target.ids.length === 0) return;
    setDeleteConfirm(null);
    try {
      const ids = target.ids;
      const results = await Promise.all(
        ids.map((id) =>
          fetch(`/api/queues/${encodeURIComponent(id)}`, {
            method: "DELETE",
            credentials: "include",
            headers: apiHeaders,
          }).then((r) => ({ id, ok: r.ok })).catch(() => ({ id, ok: false }))
        )
      );
      const deletedIds = results.filter((r) => r.ok).map((r) => r.id);
      if (deletedIds.length > 0) {
        setQueues((prev) => prev.filter((x) => !deletedIds.includes(x.id)));
        setQueueChannelCount((prev) => {
          const next = { ...prev };
          deletedIds.forEach((id) => delete next[id]);
          return next;
        });
        setSelectedQueueIds((prev) => {
          const next = new Set(prev);
          deletedIds.forEach((id) => next.delete(id));
          return next;
        });
        setFeedback({
          type: "success",
          message:
            deletedIds.length === 1
              ? "Fila excluída com sucesso."
              : `${deletedIds.length} filas excluídas com sucesso.`,
        });
      }
    } catch {
      setFeedback({ type: "error", message: "Não foi possível excluir a(s) fila(s)." });
    }
  };

  const getQueueSla = useCallback((queueId: string) => {
    const linked = queueChannelCount[queueId] ?? 0;
    const agents = queueAgentsCount[queueId] ?? 0;
    const statuses = queueStatusesCount[queueId] ?? 0;
    if (linked === 0) {
      return { label: "Sem números vinculados", className: "bg-red-50 text-red-700" };
    }
    if (agents === 0) {
      return { label: "Sem atendente", className: "bg-amber-50 text-amber-700" };
    }
    if (statuses < 2) {
      return { label: "Status incompleto", className: "bg-amber-50 text-amber-700" };
    }
    return { label: "OK", className: "bg-emerald-50 text-emerald-700" };
  }, [queueAgentsCount, queueChannelCount, queueStatusesCount]);

  const handleBulkLinkChannels = async () => {
    const queueIds = Array.from(selectedQueueIds);
    const channelIds = Array.from(selectedChannelIdsToLink);
    if (queueIds.length === 0 || channelIds.length === 0) return;
    setLinkingChannels(true);
    try {
      await Promise.all(
        channelIds.flatMap((channelId) =>
          queueIds.map((queueId) =>
            fetch(`/api/channels/${encodeURIComponent(channelId)}/queues`, {
              method: "POST",
              credentials: "include",
              headers: { "Content-Type": "application/json", ...apiHeaders },
              body: JSON.stringify({ queue_id: queueId, is_default: false }),
            }).catch(() => null)
          )
        )
      );
      setLinkChannelsOpen(false);
      setSelectedChannelIdsToLink(new Set());
      await refreshAll();
      setFeedback({ type: "success", message: "Vínculos aplicados com sucesso." });
    } finally {
      setLinkingChannels(false);
    }
  };

  const filteredQueues = useMemo(() => {
    const term = search.trim().toLowerCase();
    return queues.filter((q) => {
      const matchSearch = !term || q.name.toLowerCase().includes(term) || q.slug.toLowerCase().includes(term);
      if (!matchSearch) return false;
      const linked = (queueChannelCount[q.id] ?? 0) > 0;
      if (linkedFilter === "with") return linked;
      if (linkedFilter === "without") return !linked;
      return true;
    });
  }, [queues, search, linkedFilter, queueChannelCount]);

  const pageCount = Math.max(1, Math.ceil(filteredQueues.length / QUEUES_PAGE_SIZE));
  const safePageIndex = Math.min(pageIndex, pageCount - 1);
  const pagedQueues = filteredQueues.slice(
    safePageIndex * QUEUES_PAGE_SIZE,
    safePageIndex * QUEUES_PAGE_SIZE + QUEUES_PAGE_SIZE
  );
  const allFilteredSelected =
    filteredQueues.length > 0 && filteredQueues.every((q) => selectedQueueIds.has(q.id));

  useEffect(() => {
    setPageIndex(0);
  }, [search, linkedFilter]);

  useEffect(() => {
    if (pageIndex > pageCount - 1) {
      setPageIndex(Math.max(0, pageCount - 1));
    }
  }, [pageCount, pageIndex]);

  return (
    <div className="flex flex-col gap-4 p-6">
      <div className="rounded-xl border border-[#E2E8F0] bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-[#1E293B]">Filas (Caixas de entrada)</h1>
            <p className="mt-0.5 text-sm text-[#64748B]">
              Total: <span className="font-medium tabular-nums text-[#1E293B]">{filteredQueues.length}</span> fila{filteredQueues.length !== 1 ? "s" : ""}
              {search.trim() || linkedFilter !== "all" ? (
                <>
                  {" "}de <span className="font-medium tabular-nums text-[#1E293B]">{queues.length}</span>
                </>
              ) : null}
            </p>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2">
            <div className="inline-flex overflow-hidden rounded-full border border-[#E2E8F0] bg-white">
              <button
                type="button"
                onClick={() => setLinkedFilter("all")}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium transition-colors ${
                  linkedFilter === "all"
                    ? "bg-clicvend-orange/10 text-clicvend-orange"
                    : "text-[#64748B] hover:bg-[#F8FAFC]"
                }`}
              >
                <Layers3 className="h-3.5 w-3.5" />
                Todas
              </button>
              <button
                type="button"
                onClick={() => setLinkedFilter("with")}
                className={`inline-flex items-center gap-1.5 border-l border-[#E2E8F0] px-3 py-1.5 text-xs font-medium transition-colors ${
                  linkedFilter === "with"
                    ? "bg-clicvend-orange/10 text-clicvend-orange"
                    : "text-[#64748B] hover:bg-[#F8FAFC]"
                }`}
              >
                <Link2 className="h-3.5 w-3.5" />
                Com número vinculado
              </button>
              <button
                type="button"
                onClick={() => setLinkedFilter("without")}
                className={`inline-flex items-center gap-1.5 border-l border-[#E2E8F0] px-3 py-1.5 text-xs font-medium transition-colors ${
                  linkedFilter === "without"
                    ? "bg-clicvend-orange/10 text-clicvend-orange"
                    : "text-[#64748B] hover:bg-[#F8FAFC]"
                }`}
              >
                <Plug className="h-3.5 w-3.5" />
                Sem número vinculado
              </button>
            </div>

            <div className="relative w-[260px] max-w-full">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#94A3B8]" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Pesquisar filas..."
                className="h-9 w-full rounded-lg border border-[#E2E8F0] bg-white pl-9 pr-3 text-sm text-[#1E293B] placeholder:text-[#94A3B8] focus:border-clicvend-orange focus:outline-none focus:ring-1 focus:ring-clicvend-orange"
              />
            </div>

            <button
              type="button"
              onClick={() => {
                void refreshAll();
              }}
              className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#F1F5F9] text-[#64748B] hover:bg-[#E2E8F0] transition-colors"
              aria-label="Atualizar"
              title="Atualizar filas"
            >
              <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
            </button>
            <button
              type="button"
              onClick={() => {
                setNewQueueOpen(true);
                setError("");
                setNewName("");
                setNewQueueType("standard");
                setUseGroups(false);
              }}
              className="inline-flex items-center gap-1.5 rounded-lg bg-clicvend-orange px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-clicvend-orange-dark"
            >
              <Plus className="h-4 w-4" />
              Nova fila
            </button>
          </div>
        </div>
      </div>

      <p className="text-sm text-[#64748B]">
        Crie e edite filas para organizar conversas por setor (ex.: Comercial, Suporte). Para vincular cada fila aos
        números (até 8 caixas por número), use <strong>Conexões</strong> e abra <strong>Configurar</strong> no número.
      </p>

      {feedback && (
        <div
          className={`rounded-lg border px-3 py-2 text-sm ${
            feedback.type === "success"
              ? "border-emerald-200 bg-emerald-50 text-emerald-700"
              : "border-red-200 bg-red-50 text-red-700"
          }`}
        >
          {feedback.message}
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-12">
          <div className="flex flex-col items-center gap-3">
            <Loader2 className="h-8 w-8 animate-spin text-clicvend-orange" />
            <span className="text-sm text-[#64748B]">Carregando…</span>
          </div>
        </div>
      ) : queues.length === 0 ? (
        <div className="rounded-xl border border-[#E2E8F0] bg-white p-8 text-center">
          <Inbox className="mx-auto h-12 w-12 text-[#94A3B8]" />
          <p className="mt-2 text-[#64748B]">Nenhuma fila cadastrada.</p>
          <p className="mt-1 text-xs text-[#94A3B8]">Crie uma fila. Depois vincule aos números em Conexões.</p>
          <button
            type="button"
            onClick={() => setNewQueueOpen(true)}
            className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-clicvend-orange px-4 py-2 text-sm font-medium text-white hover:bg-clicvend-orange-dark"
          >
            <Plus className="h-4 w-4" />
            Nova fila
          </button>
        </div>
      ) : (
        <div className="rounded-xl border border-[#E2E8F0] bg-white shadow-sm overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[#E2E8F0] bg-[#F8FAFC] px-4 py-3">
            <p className="text-sm text-[#64748B]">
              <span className="font-medium text-[#1E293B]">{filteredQueues.length}</span> fila
              {filteredQueues.length !== 1 ? "s" : ""}
              {search.trim() ? (
                <>
                  {" "}
                  de <span className="font-medium text-[#1E293B]">{queues.length}</span>
                </>
              ) : null}
            </p>
            <span className="flex items-center gap-1.5 text-sm text-[#64748B]">
              <Plug className="h-4 w-4 text-clicvend-orange" />
              <span className="uppercase text-[10px] font-medium tracking-wider text-[#64748B]">Números vinculados</span>
              <strong className="text-[#1E293B]">
                {filteredQueues.reduce((sum, q) => sum + (queueChannelCount[q.id] ?? 0), 0)}
              </strong>
            </span>
          </div>

          <div className="max-h-[300px] overflow-auto">
            {selectedQueueIds.size > 0 && (
              <div className="flex flex-wrap items-center justify-between gap-4 px-4 py-3 bg-clicvend-orange/10 border-b border-[#E2E8F0]">
                <span className="text-sm font-medium text-[#1E293B]">
                  {selectedQueueIds.size} fila(s) selecionada(s)
                </span>
                <div className="inline-flex flex-wrap rounded-lg border border-[#E2E8F0] bg-white overflow-hidden shadow-sm">
                  <button
                    type="button"
                    onClick={() => setLinkChannelsOpen(true)}
                    className="inline-flex items-center gap-1.5 border-r border-[#E2E8F0] bg-white px-3 py-2 text-sm font-medium text-[#334155] hover:bg-[#F8FAFC] disabled:opacity-60 last:border-r-0"
                  >
                    <Link2 className="h-4 w-4" />
                    Vincular números
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (selectedQueueIds.size !== 1) return;
                      const selected = queues.find((q) => q.id === Array.from(selectedQueueIds)[0]) ?? null;
                      setConfigQueue(selected);
                    }}
                    disabled={selectedQueueIds.size !== 1}
                    className="inline-flex items-center gap-1.5 border-r border-[#E2E8F0] bg-white px-3 py-2 text-sm font-medium text-[#334155] hover:bg-[#F8FAFC] disabled:opacity-60 last:border-r-0"
                  >
                    Configurar
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const ids = Array.from(selectedQueueIds);
                      if (ids.length === 0) return;
                      setDeleteConfirm({
                        ids,
                        label:
                          ids.length === 1
                            ? `Excluir a fila "${queues.find((q) => q.id === ids[0])?.name ?? ""}"?`
                            : `Excluir ${ids.length} filas selecionadas?`,
                      });
                    }}
                    className="inline-flex items-center gap-1.5 border-r border-[#E2E8F0] bg-red-50 px-3 py-2 text-sm font-medium text-red-700 hover:bg-red-100 last:border-r-0"
                  >
                    Excluir
                  </button>
                  <button
                    type="button"
                    onClick={() => setSelectedQueueIds(new Set())}
                    className="inline-flex items-center gap-1.5 bg-white px-3 py-2 text-sm font-medium text-[#64748B] hover:bg-[#F1F5F9] last:border-r-0"
                    title="Limpar seleção"
                  >
                    Limpar seleção
                  </button>
                </div>
              </div>
            )}

            <table className="w-full min-w-[900px]">
              <thead>
                <tr className="border-b border-[#E2E8F0] bg-[#F8FAFC]">
                  <th className="w-10 px-4 py-3 text-left">
                    <input
                      type="checkbox"
                      checked={allFilteredSelected}
                      onChange={() => {
                        if (allFilteredSelected) {
                          setSelectedQueueIds(new Set());
                        } else {
                          setSelectedQueueIds(new Set(filteredQueues.map((q) => q.id)));
                        }
                      }}
                      className="h-4 w-4 rounded border-[#E2E8F0] text-clicvend-orange focus:ring-clicvend-orange"
                      aria-label="Selecionar todas"
                    />
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-[#64748B]">Nome</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-[#64748B]">Slug</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-[#64748B]">Status SLA</th>
                  <th className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-wider text-[#64748B]">Números vinculados</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-[#64748B]">Ações</th>
                </tr>
              </thead>
              <tbody>
                {pagedQueues.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-sm text-[#64748B]">
                      Nenhuma fila encontrada para a busca.
                    </td>
                  </tr>
                ) : (
                  pagedQueues.map((q) => (
                    <tr key={q.id} className="border-b border-[#E2E8F0] last:border-0 transition-colors hover:bg-[#F8FAFC]">
                      <td className="px-4 py-3">
                        <input
                          type="checkbox"
                          checked={selectedQueueIds.has(q.id)}
                          onChange={() => {
                            setSelectedQueueIds((prev) => {
                              const next = new Set(prev);
                              if (next.has(q.id)) next.delete(q.id);
                              else next.add(q.id);
                              return next;
                            });
                          }}
                          className="h-4 w-4 rounded border-[#E2E8F0] text-clicvend-orange focus:ring-clicvend-orange"
                          aria-label={`Selecionar fila ${q.name}`}
                        />
                      </td>
                      <td className="px-4 py-3">
                        <p className="font-medium text-[#1E293B]">{q.name}</p>
                        <div className="mt-1 flex flex-wrap items-center gap-1.5">
                          <span
                            className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${
                              q.queue_type === "commercial"
                                ? "bg-blue-100 text-blue-700"
                                : "bg-[#F1F5F9] text-[#475569]"
                            }`}
                          >
                            {q.queue_type === "commercial" ? "Comercial" : "Padrao"}
                          </span>
                          <span className="inline-flex items-center gap-1 rounded-full bg-[#F1F5F9] px-2 py-0.5 text-[11px] font-medium text-[#475569]">
                            <Users className="h-3 w-3" />
                            {queueAgentsCount[q.id] ?? 0} atendente{(queueAgentsCount[q.id] ?? 0) === 1 ? "" : "s"}
                          </span>
                          <span className="inline-flex items-center gap-1 rounded-full bg-[#EFF6FF] px-2 py-0.5 text-[11px] font-medium text-[#1D4ED8]">
                            <Layers3 className="h-3 w-3" />
                            {queueStatusesCount[q.id] ?? 0} status
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3 font-mono text-sm text-[#64748B]">{q.slug}</td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${getQueueSla(q.id).className}`}>
                          {getQueueSla(q.id).label}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className="inline-flex items-center gap-1.5 text-sm text-[#64748B]">
                          <Plug className="h-4 w-4 text-clicvend-orange" />
                          <strong className="text-[#1E293B]">{queueChannelCount[q.id] ?? 0}</strong>
                          {(queueChannelCount[q.id] ?? 0) === 1 ? " número" : " números"}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex justify-end gap-1">
                          <button
                            type="button"
                            onClick={() => setConfigQueue(q)}
                            className="rounded-lg p-2 text-[#64748B] hover:bg-[#F1F5F9] hover:text-[#1E293B]"
                            title="Configurar"
                          >
                            <Settings className="h-4 w-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => setDeleteConfirm({ ids: [q.id], label: `Excluir a fila "${q.name}"?` })}
                            className="rounded-lg p-2 text-[#64748B] hover:bg-red-50 hover:text-red-600"
                            title="Excluir"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[#E2E8F0] bg-[#F8FAFC] px-4 py-3">
            <p className="text-sm text-[#64748B]">
              Página{" "}
              <span className="font-medium text-[#1E293B] tabular-nums">{safePageIndex + 1}</span>{" "}
              de{" "}
              <span className="font-medium text-[#1E293B] tabular-nums">{pageCount}</span>{" "}
              ({filteredQueues.length} fila{filteredQueues.length !== 1 ? "s" : ""})
            </p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setPageIndex((p) => Math.max(0, p - 1))}
                disabled={safePageIndex === 0}
                className="inline-flex items-center gap-1 rounded-lg border border-[#E2E8F0] px-2.5 py-1.5 text-sm text-[#475569] hover:bg-[#F8FAFC] disabled:opacity-50"
                aria-label="Página anterior"
              >
                <ChevronLeft className="h-4 w-4" />
                Anterior
              </button>
              <button
                type="button"
                onClick={() => setPageIndex((p) => Math.min(pageCount - 1, p + 1))}
                disabled={safePageIndex >= pageCount - 1}
                className="inline-flex items-center gap-1 rounded-lg border border-[#E2E8F0] px-2.5 py-1.5 text-sm text-[#475569] hover:bg-[#F8FAFC] disabled:opacity-50"
                aria-label="Próxima página"
              >
                Próxima
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* SideOver Nova fila */}
      <SideOver open={newQueueOpen} onClose={() => setNewQueueOpen(false)} title="Nova fila">
        <div className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-[#334155]">Nome da fila</label>
            <input
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Ex: Comercial, Suporte"
              className="w-full rounded-lg border border-[#E2E8F0] px-3 py-2 text-[#1E293B] placeholder:text-[#94A3B8] focus:border-clicvend-orange focus:outline-none focus:ring-1 focus:ring-clicvend-orange"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-[#334155]">Tipo da fila</label>
            <select
              value={newQueueType}
              onChange={(e) => setNewQueueType(e.target.value === "commercial" ? "commercial" : "standard")}
              className="w-full rounded-lg border border-[#E2E8F0] px-3 py-2 text-sm text-[#1E293B] focus:border-clicvend-orange focus:outline-none focus:ring-1 focus:ring-clicvend-orange"
            >
              <option value="standard">Padrao</option>
              <option value="commercial">Comercial (carteira privada + round-robin)</option>
            </select>
          </div>
          <label className="flex cursor-pointer items-center gap-2">
            <input
              type="checkbox"
              checked={useGroups}
              onChange={(e) => setUseGroups(e.target.checked)}
              className="h-4 w-4 rounded border-[#E2E8F0] text-clicvend-orange focus:ring-clicvend-orange"
            />
            <span className="text-sm text-[#334155]">Vai usar grupos? (cria a fila &quot;Grupos&quot; automaticamente)</span>
          </label>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setNewQueueOpen(false)}
              className="rounded-lg border border-[#E2E8F0] px-4 py-2 text-sm font-medium text-[#64748B] hover:bg-[#F8FAFC]"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={createQueue}
              disabled={creating}
              className="inline-flex items-center gap-2 rounded-lg bg-clicvend-orange px-4 py-2 text-sm font-medium text-white hover:bg-clicvend-orange-dark disabled:opacity-60"
            >
              {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Criar fila
            </button>
          </div>
        </div>
      </SideOver>

      <SideOver
        open={linkChannelsOpen}
        onClose={() => {
          if (linkingChannels) return;
          setLinkChannelsOpen(false);
        }}
        title="Vincular números às filas selecionadas"
      >
        <div className="space-y-4">
          <p className="text-sm text-[#64748B]">
            Selecione os números que devem receber as filas escolhidas. Cada número aceita até {MAX_QUEUES_PER_CHANNEL} filas.
          </p>
          <div className="rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] px-3 py-2 text-sm text-[#475569]">
            Filas selecionadas: <strong className="text-[#1E293B]">{selectedQueueIds.size}</strong>
          </div>
          <div className="max-h-[320px] overflow-y-auto rounded-lg border border-[#E2E8F0]">
            {channels.length === 0 ? (
              <p className="px-3 py-4 text-sm text-[#94A3B8]">Nenhum número encontrado em Conexões.</p>
            ) : (
              <ul className="divide-y divide-[#E2E8F0]">
                {channels.map((ch) => (
                  <li key={ch.id} className="px-3 py-2.5">
                    <label className="flex cursor-pointer items-center gap-2">
                      <input
                        type="checkbox"
                        checked={selectedChannelIdsToLink.has(ch.id)}
                        onChange={() => {
                          setSelectedChannelIdsToLink((prev) => {
                            const next = new Set(prev);
                            if (next.has(ch.id)) next.delete(ch.id);
                            else next.add(ch.id);
                            return next;
                          });
                        }}
                        className="h-4 w-4 rounded border-[#E2E8F0] text-clicvend-orange focus:ring-clicvend-orange"
                      />
                      <span className="text-sm font-medium text-[#1E293B]">{ch.name}</span>
                    </label>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setLinkChannelsOpen(false)}
              disabled={linkingChannels}
              className="rounded-lg border border-[#E2E8F0] px-4 py-2 text-sm font-medium text-[#64748B] hover:bg-[#F8FAFC] disabled:opacity-60"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={handleBulkLinkChannels}
              disabled={linkingChannels || selectedChannelIdsToLink.size === 0 || selectedQueueIds.size === 0}
              className="inline-flex items-center gap-2 rounded-lg bg-clicvend-orange px-4 py-2 text-sm font-medium text-white hover:bg-clicvend-orange-dark disabled:opacity-60"
            >
              {linkingChannels ? <Loader2 className="h-4 w-4 animate-spin" /> : <Link2 className="h-4 w-4" />}
              Aplicar vínculos
            </button>
          </div>
        </div>
      </SideOver>

      <QueueConfigSideOver
        open={!!configQueue}
        onClose={() => setConfigQueue(null)}
        queue={configQueue}
        companySlug={slug}
        onSaved={(updated) => {
          if (configQueue && updated) {
            setQueues((prev) =>
              prev.map((q) => (q.id === configQueue.id ? { ...q, ...updated } : q))
            );
            setFeedback({
              type: "success",
              message: `Fila "${updated.name ?? configQueue.name}" atualizada com sucesso.`,
            });
          }
        }}
      />

      <ConfirmDialog
        open={!!deleteConfirm}
        onClose={() => setDeleteConfirm(null)}
        onConfirm={deleteQueues}
        title="Excluir fila?"
        message={
          deleteConfirm
            ? `${deleteConfirm.label} Ela será desvinculada de todos os números. Esta ação não pode ser desfeita.`
            : ""
        }
        confirmLabel="Excluir"
        variant="danger"
      />
    </div>
  );
}
