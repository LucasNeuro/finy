"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import {
  ChartLine,
  RefreshCw,
  Shuffle,
  ArrowRightLeft,
  Plus,
  ArrowLeftRight,
  Trash2,
  Users,
  Briefcase,
  CheckCircle2,
  UserMinus,
} from "lucide-react";
import { SideOver } from "@/components/SideOver";
import { ConfirmDialog } from "@/components/ConfirmDialog";

type OverviewQueue = {
  id: string;
  name: string;
  slug: string;
  consultants: number;
  leads_total: number;
  assigned_total: number;
  unassigned_total: number;
  closed_total: number;
  active_total: number;
};

type OverviewConsultant = {
  user_id: string;
  full_name: string;
  email: string | null;
  is_active: boolean;
  leads_total: number;
  active_total: number;
  closed_total: number;
  unresponsive_total: number;
  new_last_days: number;
  conversion_rate: number;
  queue_ids: string[];
  last_activity_at: string | null;
};

type OverviewBoard = {
  id: string;
  queue_id: string | null;
  assigned_to: string | null;
  assigned_to_name: string | null;
  queue_name: string | null;
  status: string;
  customer_name: string | null;
  customer_phone: string | null;
  last_message_at: string | null;
};

type OverviewResponse = {
  can_manage: boolean;
  days: number;
  queues: OverviewQueue[];
  totals: {
    leads_total: number;
    active_total: number;
    closed_total: number;
    unassigned_total: number;
    new_last_days: number;
  };
  consultants: OverviewConsultant[];
  pipeline: { status: string; count: number }[];
  board: OverviewBoard[];
};

type PerformanceResponse = {
  can_manage: boolean;
  days: number;
  totals: {
    leads_total: number;
    assigned_total: number;
    closed_total: number;
    conversion_rate: number;
    avg_first_response_min: number | null;
  };
  timeline: { day: string; leads: number; closed: number }[];
  consultants: {
    user_id: string;
    full_name: string;
    leads_total: number;
    assigned_total: number;
    closed_total: number;
    conversion_rate: number;
    avg_first_response_min: number | null;
  }[];
};

type PortfolioContact = {
  id: string;
  phone_canonical: string;
  queue_id: string;
  channel_id: string;
  source: string;
  notes: string | null;
  created_at: string;
  owner: { id: string; full_name: string; email: string | null; avatar_url: string | null } | null;
};

type PortfolioResponse = {
  data: PortfolioContact[];
  total: number;
  page: number;
  limit: number;
  readonly_fallback?: boolean;
  fallback_reason?: string;
};

type ChannelOption = {
  id: string;
  name: string;
  queue_id?: string | null;
  is_active?: boolean;
  queue_ids?: string[];
};

type RoundRobinResponse = {
  queue: { id: string; name: string; slug: string };
  pointer: { last_agent_id: string | null; next_agent_id: string | null };
  unassigned_count: number;
  agents: {
    user_id: string;
    full_name: string;
    email: string | null;
    total_assigned: number;
    open_count: number;
    closed_count: number;
    last_assigned_at: string | null;
    is_next: boolean;
    is_last: boolean;
  }[];
};

const statusLabelMap: Record<string, string> = {
  open: "Novo",
  in_queue: "Em fila",
  waiting: "Aguardando",
  in_progress: "Em atendimento",
  closed: "Fechado",
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

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("pt-BR");
}

export default function CrmCommercialPage() {
  const pathname = usePathname();
  const slug = getCompanySlug(pathname);
  const apiHeaders = useMemo(() => (slug ? { "X-Company-Slug": slug } : undefined), [slug]);

  const [days, setDays] = useState(30);
  const [queueId, setQueueId] = useState<string>("all");
  const [activeTab, setActiveTab] = useState<"carteiras" | "fluxo" | "distribuicao" | "performance">(
    "carteiras"
  );
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");

  const [overview, setOverview] = useState<OverviewResponse | null>(null);
  const [performance, setPerformance] = useState<PerformanceResponse | null>(null);
  const [roundRobin, setRoundRobin] = useState<RoundRobinResponse | null>(null);

  const [selectedConversationId, setSelectedConversationId] = useState<string>("");
  const [redistributeConversationId, setRedistributeConversationId] = useState<string>("");
  const [redistributeUserId, setRedistributeUserId] = useState<string>("");
  const [assignSideOverOpen, setAssignSideOverOpen] = useState(false);
  const [redistributeSideOverOpen, setRedistributeSideOverOpen] = useState(false);
  const [actionMessage, setActionMessage] = useState("");
  const [runningAction, setRunningAction] = useState(false);

  // Portfolio (Minha Carteira)
  const [portfolio, setPortfolio] = useState<PortfolioResponse | null>(null);
  const [portfolioLoading, setPortfolioLoading] = useState(false);
  const [addContactOpen, setAddContactOpen] = useState(false);
  const [transferContactOpen, setTransferContactOpen] = useState(false);
  const [selectedContactId, setSelectedContactId] = useState<string>("");
  const [newPhone, setNewPhone] = useState("");
  const [newNotes, setNewNotes] = useState("");
  const [newChannelId, setNewChannelId] = useState("");
  const [newQueueId, setNewQueueId] = useState("");
  const [transferToUserId, setTransferToUserId] = useState("");
  const [transferReason, setTransferReason] = useState("");
  const [portfolioMessage, setPortfolioMessage] = useState("");
  const [deleteContactId, setDeleteContactId] = useState<string | null>(null);
  const [channels, setChannels] = useState<ChannelOption[]>([]);
  const [linkedCommercialChannelQueueIds, setLinkedCommercialChannelQueueIds] = useState<Record<string, string[]>>({});
  const [portfolioPage, setPortfolioPage] = useState(0);
  const portfolioPageSize = 8;
  const flowPageSize = 6;
  const distPageSize = 6;
  const perfPageSize = 8;
  const [flowPage, setFlowPage] = useState(0);
  const [distPage, setDistPage] = useState(0);
  const [perfPage, setPerfPage] = useState(0);

  const canManage = overview?.can_manage ?? false;
  const selectedQueueId = queueId === "all" ? null : queueId;

  const loadOverview = useCallback(async () => {
    const qs = new URLSearchParams();
    qs.set("days", String(days));
    if (selectedQueueId) qs.set("queue_id", selectedQueueId);
    const r = await fetch(`/api/crm/commercial/overview?${qs.toString()}`, {
      credentials: "include",
      headers: apiHeaders,
    });
    const data = await r.json();
    if (!r.ok) throw new Error(data?.error || "Falha ao carregar visão geral");
    setOverview(data as OverviewResponse);
  }, [days, selectedQueueId, apiHeaders]);

  const loadPerformance = useCallback(async () => {
    const qs = new URLSearchParams();
    qs.set("days", String(days));
    if (selectedQueueId) qs.set("queue_id", selectedQueueId);
    const r = await fetch(`/api/crm/commercial/performance?${qs.toString()}`, {
      credentials: "include",
      headers: apiHeaders,
    });
    const data = await r.json();
    if (!r.ok) throw new Error(data?.error || "Falha ao carregar performance");
    setPerformance(data as PerformanceResponse);
  }, [days, selectedQueueId, apiHeaders]);

  const loadRoundRobin = useCallback(async () => {
    if (!selectedQueueId || !canManage) {
      setRoundRobin(null);
      return;
    }
    const r = await fetch(`/api/queues/${encodeURIComponent(selectedQueueId)}/round-robin`, {
      credentials: "include",
      headers: apiHeaders,
    });
    const data = await r.json();
    if (!r.ok) {
      setRoundRobin(null);
      return;
    }
    setRoundRobin(data as RoundRobinResponse);
  }, [selectedQueueId, canManage, apiHeaders]);

  const loadPortfolio = useCallback(async () => {
    setPortfolioLoading(true);
    const qs = new URLSearchParams();
    if (selectedQueueId) qs.set("queue_id", selectedQueueId);
    qs.set("page", String(portfolioPage + 1));
    qs.set("limit", String(portfolioPageSize));
    const r = await fetch(`/api/crm/commercial/contacts?${qs.toString()}`, {
      credentials: "include",
      headers: apiHeaders,
    });
    const data = await r.json();
    if (r.ok) {
      setPortfolio(data as PortfolioResponse);
    } else {
      setPortfolioMessage(data?.error || "Falha ao carregar carteira.");
      setPortfolio({ data: [], total: 0, page: portfolioPage + 1, limit: portfolioPageSize });
    }
    setPortfolioLoading(false);
  }, [selectedQueueId, apiHeaders, portfolioPage]);

  const loadChannels = useCallback(async () => {
    const r = await fetch("/api/channels", { credentials: "include", headers: apiHeaders });
    const data = await r.json();
    if (r.ok && Array.isArray(data)) {
      setChannels(
        data.map((c: { id: string; name?: string; queue_id?: string | null; is_active?: boolean }) => ({
          id: c.id,
          name: c.name ?? "Sem nome",
          queue_id: c.queue_id ?? null,
          is_active: c.is_active ?? true,
        }))
      );
      return;
    }
    setChannels([]);
  }, [apiHeaders]);

  const loadCommercialLinkedChannels = useCallback(async () => {
    const queueIds = (overview?.queues ?? []).map((q) => q.id);
    if (queueIds.length === 0) {
      setLinkedCommercialChannelQueueIds({});
      return;
    }

    const results = await Promise.all(
      queueIds.map(async (qid) => {
        const r = await fetch(`/api/queues/${encodeURIComponent(qid)}/channels`, {
          credentials: "include",
          headers: apiHeaders,
        });
        const data = await r.json();
        return { queueId: qid, ok: r.ok, linked: Array.isArray(data?.linked) ? data.linked : [] };
      })
    );

    const map: Record<string, string[]> = {};
    for (const result of results) {
      if (!result.ok) continue;
      for (const link of result.linked) {
        const channelId = link?.channel_id as string | undefined;
        if (!channelId) continue;
        if (!map[channelId]) map[channelId] = [];
        map[channelId].push(result.queueId);
      }
    }
    setLinkedCommercialChannelQueueIds(map);
  }, [overview?.queues, apiHeaders]);

  const filteredChannels = useMemo(() => {
    if (Object.keys(linkedCommercialChannelQueueIds).length > 0) {
      return channels.filter((channel) => {
        if (channel.is_active === false) return false;
        const queueIds = linkedCommercialChannelQueueIds[channel.id] ?? [];
        if (queueIds.length === 0) return false;
        if (selectedQueueId && !queueIds.includes(selectedQueueId)) return false;
        return true;
      });
    }

    const commercialQueueIds = new Set((overview?.queues ?? []).map((q) => q.id));
    return channels.filter((channel) => {
      if (channel.is_active === false) return false;
      if (!channel.queue_id) return false;
      if (!commercialQueueIds.has(channel.queue_id)) return false;
      if (selectedQueueId && channel.queue_id !== selectedQueueId) return false;
      return true;
    });
  }, [channels, linkedCommercialChannelQueueIds, overview?.queues, selectedQueueId]);

  const reloadAll = useCallback(
    async (fullLoading = false) => {
      if (fullLoading) setLoading(true);
      else setRefreshing(true);
      setError("");
      try {
        await Promise.all([loadOverview(), loadPerformance()]);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Erro ao carregar CRM");
      } finally {
        if (fullLoading) setLoading(false);
        else setRefreshing(false);
      }
    },
    [loadOverview, loadPerformance]
  );

  useEffect(() => {
    reloadAll(true);
  }, [reloadAll]);

  useEffect(() => {
    if (activeTab === "carteiras") loadPortfolio();
  }, [activeTab, loadPortfolio]);

  useEffect(() => {
    loadRoundRobin();
  }, [loadRoundRobin]);

  useEffect(() => {
    loadChannels();
  }, [loadChannels]);

  useEffect(() => {
    loadCommercialLinkedChannels();
  }, [loadCommercialLinkedChannels]);

  useEffect(() => {
    setPortfolioPage(0);
    setFlowPage(0);
    setDistPage(0);
    setPerfPage(0);
  }, [selectedQueueId]);

  useEffect(() => {
    if (addContactOpen && !newChannelId && filteredChannels.length === 1) {
      setNewChannelId(filteredChannels[0].id);
    }
    if (newChannelId && !filteredChannels.some((c) => c.id === newChannelId)) {
      setNewChannelId("");
    }
  }, [addContactOpen, filteredChannels, newChannelId]);

  const groupedBoard = useMemo(() => {
    const items = overview?.board ?? [];
    const map = new Map<string, OverviewBoard[]>();
    for (const card of items) {
      const status = card.status || "open";
      if (!map.has(status)) map.set(status, []);
      map.get(status)!.push(card);
    }
    return map;
  }, [overview?.board]);

  const flowRows = useMemo(() => {
    return (overview?.pipeline ?? []).map((item) => {
      const leads = groupedBoard.get(item.status) ?? [];
      const sample = leads
        .slice(0, 3)
        .map((lead) => lead.customer_name || lead.customer_phone || "Lead sem nome");
      return {
        status: item.status,
        count: item.count,
        sample,
      };
    });
  }, [overview?.pipeline, groupedBoard]);

  const flowPageCount = Math.max(1, Math.ceil(flowRows.length / flowPageSize));
  const safeFlowPage = Math.min(flowPage, flowPageCount - 1);
  const pagedFlowRows = flowRows.slice(
    safeFlowPage * flowPageSize,
    safeFlowPage * flowPageSize + flowPageSize
  );

  const distAgents = roundRobin?.agents ?? [];
  const distPageCount = Math.max(1, Math.ceil(distAgents.length / distPageSize));
  const safeDistPage = Math.min(distPage, distPageCount - 1);
  const pagedDistAgents = distAgents.slice(
    safeDistPage * distPageSize,
    safeDistPage * distPageSize + distPageSize
  );

  const perfConsultants = performance?.consultants ?? [];
  const perfPageCount = Math.max(1, Math.ceil(perfConsultants.length / perfPageSize));
  const safePerfPage = Math.min(perfPage, perfPageCount - 1);
  const pagedPerfConsultants = perfConsultants.slice(
    safePerfPage * perfPageSize,
    safePerfPage * perfPageSize + perfPageSize
  );

  const handleAssignNext = async () => {
    if (!selectedQueueId || !selectedConversationId) return;
    setRunningAction(true);
    setActionMessage("");
    try {
      const r = await fetch(`/api/queues/${encodeURIComponent(selectedQueueId)}/assign`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json", ...apiHeaders },
        body: JSON.stringify({ conversation_id: selectedConversationId }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data?.error || "Falha ao atribuir conversa");
      setActionMessage(`Conversa atribuída para ${data.assigned_to_name ?? "consultor"}.`);
      setAssignSideOverOpen(false);
      setSelectedConversationId("");
      await Promise.all([reloadAll(), loadRoundRobin()]);
    } catch (err) {
      setActionMessage(err instanceof Error ? err.message : "Erro ao atribuir conversa.");
    } finally {
      setRunningAction(false);
    }
  };

  const handleAddContact = async () => {
    if (!newPhone || !newQueueId || !newChannelId) return;
    setRunningAction(true);
    setPortfolioMessage("");
    try {
      const r = await fetch("/api/crm/commercial/contacts", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json", ...apiHeaders },
        body: JSON.stringify({ queue_id: newQueueId, channel_id: newChannelId, phone: newPhone, notes: newNotes || undefined }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data?.error || "Falha ao adicionar contato");
      setPortfolioMessage("Contato adicionado à carteira com sucesso.");
      setAddContactOpen(false);
      setNewPhone(""); setNewNotes(""); setNewChannelId(""); setNewQueueId("");
      await loadPortfolio();
      await reloadAll(false);
    } catch (err) {
      setPortfolioMessage(err instanceof Error ? err.message : "Erro ao adicionar contato.");
    } finally {
      setRunningAction(false);
    }
  };

  const handleTransferContact = async () => {
    if (!selectedContactId || !transferToUserId) return;
    setRunningAction(true);
    setPortfolioMessage("");
    try {
      const r = await fetch(`/api/crm/commercial/contacts/${encodeURIComponent(selectedContactId)}/transfer`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json", ...apiHeaders },
        body: JSON.stringify({ to_user_id: transferToUserId, reason: transferReason || undefined }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data?.error || "Falha ao transferir contato");
      setPortfolioMessage(`Contato transferido para ${data.transferred_to ?? "consultor"}.`);
      setTransferContactOpen(false);
      setSelectedContactId(""); setTransferToUserId(""); setTransferReason("");
      await loadPortfolio();
    } catch (err) {
      setPortfolioMessage(err instanceof Error ? err.message : "Erro ao transferir contato.");
    } finally {
      setRunningAction(false);
    }
  };

  const handleDeleteContact = async (id: string) => {
    setPortfolioMessage("");
    try {
      const r = await fetch(`/api/crm/commercial/contacts/${encodeURIComponent(id)}`, {
        method: "DELETE",
        credentials: "include",
        headers: apiHeaders,
      });
      if (!r.ok) {
        const d = await r.json();
        throw new Error(d?.error || "Falha ao remover contato");
      }
      setPortfolioMessage("Contato removido da carteira.");
      await loadPortfolio();
    } catch (err) {
      setPortfolioMessage(err instanceof Error ? err.message : "Erro ao remover contato.");
    }
  };

  const handleRedistribute = async () => {
    if (!selectedQueueId || !redistributeConversationId || !redistributeUserId) return;
    setRunningAction(true);
    setActionMessage("");
    try {
      const r = await fetch(`/api/queues/${encodeURIComponent(selectedQueueId)}/redistribute`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json", ...apiHeaders },
        body: JSON.stringify({
          conversation_id: redistributeConversationId,
          to_user_id: redistributeUserId,
        }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data?.error || "Falha ao redistribuir conversa");
      setActionMessage(`Conversa redistribuída para ${data.assigned_to_name ?? "consultor"}.`);
      setRedistributeSideOverOpen(false);
      setRedistributeConversationId("");
      setRedistributeUserId("");
      await Promise.all([reloadAll(), loadRoundRobin()]);
    } catch (err) {
      setActionMessage(err instanceof Error ? err.message : "Erro ao redistribuir conversa.");
    } finally {
      setRunningAction(false);
    }
  };

  const currentTabTotal =
    activeTab === "carteiras"
      ? overview?.consultants.length ?? 0
      : activeTab === "fluxo"
        ? flowRows.length
        : activeTab === "distribuicao"
          ? roundRobin?.agents.length ?? 0
          : performance?.consultants.length ?? 0;

  const currentTabLabel =
    activeTab === "carteiras"
      ? "consultor(es)"
      : activeTab === "fluxo"
        ? "etapa(s)"
        : activeTab === "distribuicao"
          ? "consultor(es)"
          : "consultor(es)";

  return (
    <div className="flex flex-col gap-4 p-6">
      <div className="rounded-xl border border-[#E2E8F0] bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="flex items-center gap-2 text-2xl font-bold text-[#1E293B]">
              <ChartLine className="h-5 w-5 text-clicvend-orange" />
              CRM Comercial
            </h1>
            <p className="mt-0.5 text-sm text-[#64748B]">
              Total: <span className="font-medium tabular-nums text-[#1E293B]">{currentTabTotal}</span> {currentTabLabel}
            </p>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2">
            <select
              value={queueId}
              onChange={(e) => setQueueId(e.target.value)}
              className="h-9 rounded-lg border border-[#E2E8F0] bg-white px-3 text-sm text-[#1E293B] focus:border-clicvend-orange focus:outline-none focus:ring-1 focus:ring-clicvend-orange"
            >
              <option value="all">Todas as filas comerciais</option>
              {(overview?.queues ?? []).map((q) => (
                <option key={q.id} value={q.id}>
                  {q.name}
                </option>
              ))}
            </select>
            <select
              value={days}
              onChange={(e) => setDays(Number(e.target.value))}
              className="h-9 rounded-lg border border-[#E2E8F0] bg-white px-3 text-sm text-[#1E293B] focus:border-clicvend-orange focus:outline-none focus:ring-1 focus:ring-clicvend-orange"
            >
              <option value={7}>Últimos 7 dias</option>
              <option value={15}>Últimos 15 dias</option>
              <option value={30}>Últimos 30 dias</option>
              <option value={60}>Últimos 60 dias</option>
              <option value={90}>Últimos 90 dias</option>
            </select>
            <button
              onClick={() => reloadAll()}
              className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#F1F5F9] text-[#64748B] transition-colors hover:bg-[#E2E8F0]"
              disabled={refreshing || loading}
              aria-label="Atualizar CRM"
              title="Atualizar CRM"
            >
              <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
            </button>
          </div>
        </div>
      </div>

      <p className="text-sm text-[#64748B]">
        {canManage
          ? "Gestor visualiza todas as carteiras comerciais, acompanha distribuição e pode redistribuir leads via SideOver."
          : "Consultor visualiza apenas a própria carteira comercial nas tabelas abaixo."}
      </p>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>
      )}

      <section className="flex flex-col gap-2">
          <div className="flex gap-2 border-b border-[#E2E8F0] px-2">
            {[
              ["carteiras", "Carteiras"],
              ["fluxo", "Fluxo visual"],
              ["distribuicao", "Distribuição"],
              ["performance", "Performance"],
            ].map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => setActiveTab(id as typeof activeTab)}
                className={`flex items-center gap-2 border-b-2 px-4 py-2 text-sm font-medium transition-colors ${
                  activeTab === id
                    ? "border-clicvend-orange text-clicvend-orange"
                    : "border-transparent text-[#64748B] hover:text-[#1E293B]"
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {activeTab === "carteiras" && (
            <div className="flex flex-col gap-4">
              {canManage && (
                <div className="grid gap-3 md:grid-cols-4">
                  <div className="rounded-xl border border-[#E2E8F0] bg-white p-4 shadow-sm border-r-4 border-r-[#0EA5E9]">
                    <div className="flex items-start justify-between">
                      <p className="text-xs uppercase tracking-wide text-[#64748B]">Leads totais</p>
                      <Users className="h-4 w-4 text-[#0EA5E9]" />
                    </div>
                    <p className="mt-2 text-2xl font-semibold text-[#0F172A]">{overview?.totals.leads_total ?? 0}</p>
                  </div>
                  <div className="rounded-xl border border-[#E2E8F0] bg-white p-4 shadow-sm border-r-4 border-r-[#6366F1]">
                    <div className="flex items-start justify-between">
                      <p className="text-xs uppercase tracking-wide text-[#64748B]">Ativos</p>
                      <Briefcase className="h-4 w-4 text-[#6366F1]" />
                    </div>
                    <p className="mt-2 text-2xl font-semibold text-[#0F172A]">{overview?.totals.active_total ?? 0}</p>
                  </div>
                  <div className="rounded-xl border border-[#E2E8F0] bg-white p-4 shadow-sm border-r-4 border-r-[#16A34A]">
                    <div className="flex items-start justify-between">
                      <p className="text-xs uppercase tracking-wide text-[#64748B]">Fechados</p>
                      <CheckCircle2 className="h-4 w-4 text-[#16A34A]" />
                    </div>
                    <p className="mt-2 text-2xl font-semibold text-[#0F172A]">{overview?.totals.closed_total ?? 0}</p>
                  </div>
                  <div className="rounded-xl border border-[#E2E8F0] bg-white p-4 shadow-sm border-r-4 border-r-[#F59E0B]">
                    <div className="flex items-start justify-between">
                      <p className="text-xs uppercase tracking-wide text-[#64748B]">Sem responsável</p>
                      <UserMinus className="h-4 w-4 text-[#F59E0B]" />
                    </div>
                    <p className="mt-2 text-2xl font-semibold text-[#0F172A]">{overview?.totals.unassigned_total ?? 0}</p>
                  </div>
                </div>
              )}

              {/* Minha carteira (contatos individuais) */}
              <div className="rounded-xl border border-[#E2E8F0] bg-white shadow-sm overflow-hidden">
                <div className="flex items-center justify-between border-b border-[#E2E8F0] px-4 py-3">
                  <div>
                    <h2 className="text-sm font-semibold text-[#0F172A]">Minha carteira</h2>
                    <p className="text-xs text-[#64748B]">
                      {portfolio?.total ?? 0} contato(s) na carteira
                    </p>
                  </div>
                  <button
                    onClick={() => setAddContactOpen(true)}
                    disabled={portfolio?.readonly_fallback}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-clicvend-orange px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-clicvend-orange-dark disabled:cursor-not-allowed disabled:opacity-60"
                    title={portfolio?.readonly_fallback ? "Cadastro manual indisponível até criar a tabela de carteira comercial." : undefined}
                  >
                    <Plus className="h-4 w-4" />
                    Adicionar contato
                  </button>
                </div>

                {portfolioMessage && (
                  <div className="border-b border-[#E2E8F0] bg-[#F0FDF4] px-4 py-2 text-sm text-[#15803D]">
                    {portfolioMessage}
                  </div>
                )}
                {portfolio?.readonly_fallback && (
                  <div className="border-b border-[#E2E8F0] bg-amber-50 px-4 py-2 text-sm text-amber-700">
                    {portfolio.fallback_reason ?? "Lista em modo de leitura por falta da tabela de carteiras comerciais."}
                  </div>
                )}

                <div className="max-h-[300px] overflow-auto">
                  <table className="min-w-full text-sm">
                    <thead className="bg-[#F8FAFC] text-left text-xs uppercase tracking-wide text-[#64748B]">
                      <tr>
                        <th className="px-4 py-3">Telefone</th>
                        <th className="px-4 py-3">Origem</th>
                        <th className="px-4 py-3">Notas</th>
                        <th className="px-4 py-3">Adicionado em</th>
                        <th className="px-4 py-3 text-right">Ações</th>
                      </tr>
                    </thead>
                    <tbody>
                      {portfolioLoading && (
                        <tr>
                          <td colSpan={5} className="px-4 py-8 text-center text-[#64748B]">
                            Carregando carteira...
                          </td>
                        </tr>
                      )}
                      {!portfolioLoading && (portfolio?.data ?? []).map((c) => (
                        <tr key={c.id} className="border-t border-[#E2E8F0] hover:bg-[#F8FAFC] transition-colors">
                          <td className="px-4 py-3 font-mono text-[#0F172A]">{c.phone_canonical}</td>
                          <td className="px-4 py-3">
                            <span className="inline-flex rounded-full bg-clicvend-orange/10 px-2 py-0.5 text-xs font-medium text-clicvend-orange">
                              {c.source === "round_robin"
                                ? "Round-robin"
                                : c.source === "manual"
                                  ? "Manual"
                                  : c.source === "import"
                                    ? "Importação"
                                    : c.source === "conversation_fallback"
                                      ? "Carteira detectada"
                                      : c.source}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-[#64748B]">{c.notes ?? "—"}</td>
                          <td className="px-4 py-3 text-[#64748B]">{formatDate(c.created_at)}</td>
                          <td className="px-4 py-3">
                            <div className="flex items-center justify-end gap-1">
                              <button
                                onClick={() => { setSelectedContactId(c.id); setTransferContactOpen(true); }}
                                disabled={c.source === "conversation_fallback"}
                                className="rounded p-1.5 text-[#64748B] transition-colors hover:bg-clicvend-orange/10 hover:text-clicvend-orange"
                                title="Transferir contato"
                              >
                                <ArrowLeftRight className="h-4 w-4" />
                              </button>
                              <button
                                onClick={() => setDeleteContactId(c.id)}
                                disabled={c.source === "conversation_fallback"}
                                className="rounded p-1.5 text-[#64748B] hover:bg-[#FEF2F2] hover:text-[#DC2626] transition-colors"
                                title="Remover da carteira"
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                      {!portfolioLoading && (portfolio?.data ?? []).length === 0 && (
                        <tr>
                          <td colSpan={5} className="px-4 py-8 text-center text-[#64748B]">
                            Nenhum contato na carteira. Adicione manualmente ou aguarde a chegada de novos leads via round-robin.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
                <div className="flex items-center justify-between border-t border-[#E2E8F0] bg-[#F8FAFC] px-4 py-2">
                  <p className="text-sm text-[#64748B]">
                    Página <span className="font-medium text-[#1E293B]">{portfolioPage + 1}</span> de{" "}
                    <span className="font-medium text-[#1E293B]">
                      {Math.max(1, Math.ceil((portfolio?.total ?? 0) / portfolioPageSize))}
                    </span>{" "}
                    ({portfolio?.total ?? 0} contato{(portfolio?.total ?? 0) === 1 ? "" : "s"})
                  </p>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setPortfolioPage((p) => Math.max(0, p - 1))}
                      disabled={portfolioPage === 0}
                      className="inline-flex items-center rounded-lg border border-[#E2E8F0] px-2.5 py-1.5 text-sm text-[#475569] hover:bg-[#F8FAFC] disabled:opacity-50"
                    >
                      Anterior
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        setPortfolioPage((p) =>
                          Math.min(Math.max(0, Math.ceil((portfolio?.total ?? 0) / portfolioPageSize) - 1), p + 1)
                        )
                      }
                      disabled={portfolioPage >= Math.max(0, Math.ceil((portfolio?.total ?? 0) / portfolioPageSize) - 1)}
                      className="inline-flex items-center rounded-lg border border-[#E2E8F0] px-2.5 py-1.5 text-sm text-[#475569] hover:bg-[#F8FAFC] disabled:opacity-50"
                    >
                      Próxima
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === "fluxo" && (
            <div className="rounded-xl border border-[#E2E8F0] bg-white shadow-sm overflow-hidden">
              <div className="max-h-[300px] overflow-auto">
                <table className="w-full min-w-[900px]">
                <thead>
                  <tr className="border-b border-[#E2E8F0] bg-[#F8FAFC]">
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-[#64748B]">
                      Etapa do fluxo
                    </th>
                    <th className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-wider text-[#64748B]">
                      Quantidade
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-[#64748B]">
                      Últimos leads da etapa
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {pagedFlowRows.map((row) => (
                    <tr
                      key={row.status}
                      className="border-b border-[#E2E8F0] last:border-0 transition-colors hover:bg-[#F8FAFC]"
                    >
                      <td className="px-4 py-3">
                        <span className="inline-flex rounded-full bg-clicvend-orange/10 px-2.5 py-1 text-xs font-medium text-clicvend-orange">
                          {statusLabelMap[row.status] ?? row.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center font-semibold text-[#1E293B]">{row.count}</td>
                      <td className="px-4 py-3 text-sm text-[#64748B]">
                        {row.sample.length > 0 ? row.sample.join(" · ") : "Sem leads nesta etapa"}
                      </td>
                    </tr>
                  ))}
                  {pagedFlowRows.length === 0 && (
                    <tr>
                      <td colSpan={3} className="px-4 py-8 text-center text-sm text-[#64748B]">
                        Sem dados de fluxo para os filtros selecionados.
                      </td>
                    </tr>
                  )}
                </tbody>
                </table>
              </div>
              <div className="flex items-center justify-between border-t border-[#E2E8F0] bg-[#F8FAFC] px-4 py-2">
                <p className="text-sm text-[#64748B]">
                  Página <span className="font-medium text-[#1E293B]">{safeFlowPage + 1}</span> de{" "}
                  <span className="font-medium text-[#1E293B]">{flowPageCount}</span> ({flowRows.length} etapa{flowRows.length === 1 ? "" : "s"})
                </p>
                <div className="flex items-center gap-2">
                  <button type="button" onClick={() => setFlowPage((p) => Math.max(0, p - 1))} disabled={safeFlowPage === 0} className="inline-flex items-center rounded-lg border border-[#E2E8F0] px-2.5 py-1.5 text-sm text-[#475569] hover:bg-[#F8FAFC] disabled:opacity-50">Anterior</button>
                  <button type="button" onClick={() => setFlowPage((p) => Math.min(flowPageCount - 1, p + 1))} disabled={safeFlowPage >= flowPageCount - 1} className="inline-flex items-center rounded-lg border border-[#E2E8F0] px-2.5 py-1.5 text-sm text-[#475569] hover:bg-[#F8FAFC] disabled:opacity-50">Próxima</button>
                </div>
              </div>
            </div>
          )}

          {activeTab === "distribuicao" && (
            <div className="rounded-xl border border-[#E2E8F0] bg-white shadow-sm overflow-hidden">
              <div className="space-y-4 p-4">
                {!canManage && (
                  <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-700">
                    Apenas gestor/admin pode gerenciar distribuição.
                  </div>
                )}
                {canManage && !selectedQueueId && (
                  <div className="rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] p-3 text-sm text-[#64748B]">
                    Selecione uma fila específica para visualizar e operar o round-robin.
                  </div>
                )}
                {canManage && selectedQueueId && roundRobin && (
                  <>
                    <div className="rounded-lg border border-clicvend-orange/20 bg-clicvend-orange/10 p-3 text-sm text-[#9A3412]">
                    Próximo consultor:{" "}
                    <strong>
                      {roundRobin.agents.find((a) => a.user_id === roundRobin.pointer.next_agent_id)?.full_name ??
                        "—"}
                    </strong>{" "}
                    · Conversas sem responsável: <strong>{roundRobin.unassigned_count}</strong>
                  </div>

                  <div className="max-h-[280px] overflow-auto rounded-lg border border-[#E2E8F0]">
                    <table className="min-w-full text-sm">
                      <thead className="bg-[#F8FAFC] text-left text-xs uppercase tracking-wide text-[#64748B]">
                        <tr>
                          <th className="px-3 py-2">Consultor</th>
                          <th className="px-3 py-2 text-center">Total</th>
                          <th className="px-3 py-2 text-center">Abertos</th>
                          <th className="px-3 py-2 text-center">Fechados</th>
                          <th className="px-3 py-2">Última atribuição</th>
                        </tr>
                      </thead>
                      <tbody>
                        {pagedDistAgents.map((a) => (
                          <tr key={a.user_id} className="border-t border-[#E2E8F0]">
                            <td className="px-3 py-2">
                              <div className="flex items-center gap-2">
                                <span className="font-medium text-[#0F172A]">{a.full_name}</span>
                                {a.is_next && (
                                  <span className="rounded-full bg-clicvend-orange/10 px-2 py-0.5 text-xs font-medium text-clicvend-orange">
                                    Próximo
                                  </span>
                                )}
                              </div>
                            </td>
                            <td className="px-3 py-2 text-center font-semibold">{a.total_assigned}</td>
                            <td className="px-3 py-2 text-center text-[#0369A1]">{a.open_count}</td>
                            <td className="px-3 py-2 text-center text-[#15803D]">{a.closed_count}</td>
                            <td className="px-3 py-2 text-[#64748B]">{formatDate(a.last_assigned_at)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div className="flex items-center justify-between rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] px-3 py-2">
                    <p className="text-sm text-[#64748B]">
                      Página <span className="font-medium text-[#1E293B]">{safeDistPage + 1}</span> de{" "}
                      <span className="font-medium text-[#1E293B]">{distPageCount}</span> ({distAgents.length} consultor{distAgents.length === 1 ? "" : "es"})
                    </p>
                    <div className="flex items-center gap-2">
                      <button type="button" onClick={() => setDistPage((p) => Math.max(0, p - 1))} disabled={safeDistPage === 0} className="inline-flex items-center rounded-lg border border-[#E2E8F0] px-2.5 py-1.5 text-sm text-[#475569] hover:bg-[#F8FAFC] disabled:opacity-50">Anterior</button>
                      <button type="button" onClick={() => setDistPage((p) => Math.min(distPageCount - 1, p + 1))} disabled={safeDistPage >= distPageCount - 1} className="inline-flex items-center rounded-lg border border-[#E2E8F0] px-2.5 py-1.5 text-sm text-[#475569] hover:bg-[#F8FAFC] disabled:opacity-50">Próxima</button>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center justify-end gap-2">
                    <button
                      onClick={() => setAssignSideOverOpen(true)}
                      className="inline-flex items-center gap-2 rounded-lg bg-clicvend-orange px-3 py-2 text-sm font-medium text-white hover:bg-clicvend-orange-dark"
                    >
                      <Shuffle className="h-4 w-4" />
                      Atribuir em round-robin
                    </button>
                    <button
                      onClick={() => setRedistributeSideOverOpen(true)}
                      className="inline-flex items-center gap-2 rounded-lg border border-[#E2E8F0] bg-white px-3 py-2 text-sm font-medium text-[#334155] hover:bg-[#F8FAFC] hover:text-clicvend-orange"
                    >
                      <ArrowRightLeft className="h-4 w-4" />
                      Redistribuir lead
                    </button>
                  </div>

                    {actionMessage && (
                      <div className="rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] p-3 text-sm text-[#334155]">
                        {actionMessage}
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          )}

          {activeTab === "performance" && (
            <div className="rounded-xl border border-[#E2E8F0] bg-white shadow-sm overflow-hidden">
              <div className="space-y-4 p-4">
                <div className="overflow-x-auto rounded-lg border border-[#E2E8F0]">
                <table className="w-full min-w-[760px]">
                  <thead>
                    <tr className="border-b border-[#E2E8F0] bg-[#F8FAFC]">
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-[#64748B]">
                        Indicador
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-[#64748B]">
                        Valor
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr className="border-b border-[#E2E8F0]">
                      <td className="px-4 py-3 text-sm text-[#64748B]">Leads no período ({days} dias)</td>
                      <td className="px-4 py-3 text-sm font-medium text-[#1E293B]">{performance?.totals.leads_total ?? 0}</td>
                    </tr>
                    <tr className="border-b border-[#E2E8F0]">
                      <td className="px-4 py-3 text-sm text-[#64748B]">Taxa de conversão</td>
                      <td className="px-4 py-3 text-sm font-medium text-[#1E293B]">{performance?.totals.conversion_rate ?? 0}%</td>
                    </tr>
                    <tr className="border-b border-[#E2E8F0]">
                      <td className="px-4 py-3 text-sm text-[#64748B]">Tempo médio de 1ª resposta</td>
                      <td className="px-4 py-3 text-sm font-medium text-[#1E293B]">
                        {performance?.totals.avg_first_response_min != null
                          ? `${performance.totals.avg_first_response_min} min`
                          : "—"}
                      </td>
                    </tr>
                    <tr>
                      <td className="px-4 py-3 text-sm text-[#64748B]">Filas comerciais no escopo</td>
                      <td className="px-4 py-3 text-sm font-medium text-[#1E293B]">{overview?.queues.length ?? 0}</td>
                    </tr>
                  </tbody>
                </table>
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                <div className="overflow-x-auto rounded-lg border border-[#E2E8F0]">
                  <table className="w-full min-w-[420px]">
                    <thead>
                      <tr className="border-b border-[#E2E8F0] bg-[#F8FAFC]">
                        <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-[#64748B]">Dia</th>
                        <th className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-wider text-[#64748B]">Entraram</th>
                        <th className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-wider text-[#64748B]">Fechados</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(performance?.timeline ?? []).map((row) => (
                        <tr key={row.day} className="border-b border-[#E2E8F0] last:border-0">
                          <td className="px-4 py-3 text-sm text-[#1E293B]">{row.day}</td>
                          <td className="px-4 py-3 text-center text-sm text-[#1E293B]">{row.leads}</td>
                          <td className="px-4 py-3 text-center text-sm text-[#1E293B]">{row.closed}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="max-h-[280px] overflow-auto rounded-lg border border-[#E2E8F0]">
                  <table className="w-full min-w-[480px]">
                    <thead>
                      <tr className="border-b border-[#E2E8F0] bg-[#F8FAFC]">
                        <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-[#64748B]">Consultor</th>
                        <th className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-wider text-[#64748B]">Leads</th>
                        <th className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-wider text-[#64748B]">Conversão</th>
                        <th className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-wider text-[#64748B]">1ª resposta</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pagedPerfConsultants.map((row) => (
                        <tr key={row.user_id} className="border-b border-[#E2E8F0] last:border-0">
                          <td className="px-4 py-3 text-sm text-[#1E293B]">{row.full_name}</td>
                          <td className="px-4 py-3 text-center text-sm text-[#1E293B]">{row.leads_total}</td>
                          <td className="px-4 py-3 text-center text-sm text-[#1E293B]">{row.conversion_rate}%</td>
                          <td className="px-4 py-3 text-center text-sm text-[#1E293B]">
                            {row.avg_first_response_min != null ? `${row.avg_first_response_min} min` : "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="md:col-span-2 flex items-center justify-between rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] px-3 py-2">
                  <p className="text-sm text-[#64748B]">
                    Página <span className="font-medium text-[#1E293B]">{safePerfPage + 1}</span> de{" "}
                    <span className="font-medium text-[#1E293B]">{perfPageCount}</span> ({perfConsultants.length} consultor{perfConsultants.length === 1 ? "" : "es"})
                  </p>
                  <div className="flex items-center gap-2">
                    <button type="button" onClick={() => setPerfPage((p) => Math.max(0, p - 1))} disabled={safePerfPage === 0} className="inline-flex items-center rounded-lg border border-[#E2E8F0] px-2.5 py-1.5 text-sm text-[#475569] hover:bg-[#F8FAFC] disabled:opacity-50">Anterior</button>
                    <button type="button" onClick={() => setPerfPage((p) => Math.min(perfPageCount - 1, p + 1))} disabled={safePerfPage >= perfPageCount - 1} className="inline-flex items-center rounded-lg border border-[#E2E8F0] px-2.5 py-1.5 text-sm text-[#475569] hover:bg-[#F8FAFC] disabled:opacity-50">Próxima</button>
                  </div>
                </div>
              </div>
            </div>
            </div>
          )}
        </section>

        <SideOver
          open={assignSideOverOpen}
          onClose={() => setAssignSideOverOpen(false)}
          title="Atribuir em round-robin"
        >
          <div className="space-y-4">
            <p className="text-sm text-[#64748B]">
              Selecione uma conversa da fila comercial atual para atribuir ao próximo consultor da rotação.
            </p>
            <div>
              <label className="mb-1 block text-sm font-medium text-[#334155]">Conversa</label>
              <select
                value={selectedConversationId}
                onChange={(e) => setSelectedConversationId(e.target.value)}
                className="w-full rounded-lg border border-[#E2E8F0] px-3 py-2 text-sm text-[#1E293B] focus:border-clicvend-orange focus:outline-none focus:ring-1 focus:ring-clicvend-orange"
              >
                <option value="">Selecione uma conversa</option>
                {(overview?.board ?? [])
                  .filter((c) => c.queue_id === selectedQueueId)
                  .map((c) => (
                    <option key={c.id} value={c.id}>
                      {(c.customer_name || c.customer_phone || c.id) + ` (${statusLabelMap[c.status] ?? c.status})`}
                    </option>
                  ))}
              </select>
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setAssignSideOverOpen(false)}
                className="rounded-lg border border-[#E2E8F0] px-4 py-2 text-sm font-medium text-[#64748B] hover:bg-[#F8FAFC]"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleAssignNext}
                disabled={!selectedConversationId || runningAction}
                className="inline-flex items-center gap-2 rounded-lg bg-clicvend-orange px-4 py-2 text-sm font-medium text-white hover:bg-clicvend-orange-dark disabled:opacity-60"
              >
                <Shuffle className="h-4 w-4" />
                Atribuir
              </button>
            </div>
          </div>
        </SideOver>

        {/* SideOver: Adicionar contato à carteira */}
        <SideOver
          open={addContactOpen}
          onClose={() => { setAddContactOpen(false); setPortfolioMessage(""); }}
          title="Adicionar contato à carteira"
        >
          <div className="space-y-4">
            <p className="text-sm text-[#64748B]">
              Adicione um número de WhatsApp à sua carteira. Próximas mensagens deste contato serão roteadas diretamente para você.
            </p>
            <div>
              <label className="mb-1 block text-sm font-medium text-[#334155]">Fila comercial</label>
              <select
                value={newQueueId}
                onChange={(e) => setNewQueueId(e.target.value)}
                className="w-full rounded-lg border border-[#E2E8F0] px-3 py-2 text-sm text-[#1E293B] focus:border-clicvend-orange focus:outline-none focus:ring-1 focus:ring-clicvend-orange"
              >
                <option value="">Selecione a fila</option>
                {(overview?.queues ?? []).map((q) => (
                  <option key={q.id} value={q.id}>{q.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-[#334155]">Canal (instância)</label>
              <select
                value={newChannelId}
                onChange={(e) => setNewChannelId(e.target.value)}
                className="w-full rounded-lg border border-[#E2E8F0] px-3 py-2 text-sm text-[#1E293B] focus:border-clicvend-orange focus:outline-none focus:ring-1 focus:ring-clicvend-orange"
              >
                <option value="">Selecione uma instância</option>
                {filteredChannels.map((channel) => (
                  <option key={channel.id} value={channel.id}>
                    {channel.name} ({channel.id.slice(0, 8)}...)
                  </option>
                ))}
              </select>
              {filteredChannels.length === 0 && (
                <p className="mt-1 text-xs text-[#64748B]">
                  Nenhuma instância vinculada a fila comercial encontrada.
                </p>
              )}
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-[#334155]">Telefone</label>
              <input
                type="text"
                value={newPhone}
                onChange={(e) => setNewPhone(e.target.value)}
                placeholder="Ex.: 5511999990000"
                className="w-full rounded-lg border border-[#E2E8F0] px-3 py-2 text-sm text-[#1E293B] placeholder-[#94A3B8] focus:border-clicvend-orange focus:outline-none focus:ring-1 focus:ring-clicvend-orange"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-[#334155]">Notas (opcional)</label>
              <textarea
                value={newNotes}
                onChange={(e) => setNewNotes(e.target.value)}
                rows={3}
                placeholder="Observações sobre este contato..."
                className="w-full rounded-lg border border-[#E2E8F0] px-3 py-2 text-sm text-[#1E293B] placeholder-[#94A3B8] focus:border-clicvend-orange focus:outline-none focus:ring-1 focus:ring-clicvend-orange"
              />
            </div>
            {portfolioMessage && (
              <p className="text-sm text-red-600">{portfolioMessage}</p>
            )}
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => { setAddContactOpen(false); setPortfolioMessage(""); }}
                className="rounded-lg border border-[#E2E8F0] px-4 py-2 text-sm font-medium text-[#64748B] hover:bg-[#F8FAFC]"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleAddContact}
                disabled={!newPhone || !newQueueId || !newChannelId || runningAction}
                className="inline-flex items-center gap-2 rounded-lg bg-clicvend-orange px-4 py-2 text-sm font-medium text-white hover:bg-clicvend-orange-dark disabled:opacity-60"
              >
                <Plus className="h-4 w-4" />
                Adicionar
              </button>
            </div>
          </div>
        </SideOver>

        {/* SideOver: Transferir contato */}
        <SideOver
          open={transferContactOpen}
          onClose={() => { setTransferContactOpen(false); setPortfolioMessage(""); }}
          title="Transferir contato"
        >
          <div className="space-y-4">
            <p className="text-sm text-[#64748B]">
              Transfira este contato para outro consultor da mesma fila. As conversas abertas também serão reatribuídas.
            </p>
            <div>
              <label className="mb-1 block text-sm font-medium text-[#334155]">Consultor de destino</label>
              <select
                value={transferToUserId}
                onChange={(e) => setTransferToUserId(e.target.value)}
                className="w-full rounded-lg border border-[#E2E8F0] px-3 py-2 text-sm text-[#1E293B] focus:border-clicvend-orange focus:outline-none focus:ring-1 focus:ring-clicvend-orange"
              >
                <option value="">Selecione o consultor</option>
                {(overview?.consultants ?? []).map((c) => (
                  <option key={c.user_id} value={c.user_id}>{c.full_name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-[#334155]">Motivo (opcional)</label>
              <textarea
                value={transferReason}
                onChange={(e) => setTransferReason(e.target.value)}
                rows={2}
                placeholder="Ex.: Consultor de férias, redistribuição de carteira..."
                className="w-full rounded-lg border border-[#E2E8F0] px-3 py-2 text-sm text-[#1E293B] placeholder-[#94A3B8] focus:border-clicvend-orange focus:outline-none focus:ring-1 focus:ring-clicvend-orange"
              />
            </div>
            {portfolioMessage && (
              <p className="text-sm text-red-600">{portfolioMessage}</p>
            )}
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => { setTransferContactOpen(false); setPortfolioMessage(""); }}
                className="rounded-lg border border-[#E2E8F0] px-4 py-2 text-sm font-medium text-[#64748B] hover:bg-[#F8FAFC]"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleTransferContact}
                disabled={!transferToUserId || runningAction}
                className="inline-flex items-center gap-2 rounded-lg bg-clicvend-orange px-4 py-2 text-sm font-medium text-white hover:bg-clicvend-orange-dark disabled:opacity-60"
              >
                <ArrowLeftRight className="h-4 w-4" />
                Transferir
              </button>
            </div>
          </div>
        </SideOver>

        <SideOver
          open={redistributeSideOverOpen}
          onClose={() => setRedistributeSideOverOpen(false)}
          title="Redistribuir lead"
        >
          <div className="space-y-4">
            <p className="text-sm text-[#64748B]">
              Reatribua uma conversa para outro consultor da mesma fila comercial.
            </p>
            <div>
              <label className="mb-1 block text-sm font-medium text-[#334155]">Conversa</label>
              <select
                value={redistributeConversationId}
                onChange={(e) => setRedistributeConversationId(e.target.value)}
                className="w-full rounded-lg border border-[#E2E8F0] px-3 py-2 text-sm text-[#1E293B] focus:border-clicvend-orange focus:outline-none focus:ring-1 focus:ring-clicvend-orange"
              >
                <option value="">Selecione a conversa</option>
                {(overview?.board ?? [])
                  .filter((c) => c.queue_id === selectedQueueId)
                  .map((c) => (
                    <option key={c.id} value={c.id}>
                      {(c.customer_name || c.customer_phone || c.id) +
                        ` — atual: ${c.assigned_to_name ?? "não atribuído"}`}
                    </option>
                  ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-[#334155]">Novo consultor</label>
              <select
                value={redistributeUserId}
                onChange={(e) => setRedistributeUserId(e.target.value)}
                className="w-full rounded-lg border border-[#E2E8F0] px-3 py-2 text-sm text-[#1E293B] focus:border-clicvend-orange focus:outline-none focus:ring-1 focus:ring-clicvend-orange"
              >
                <option value="">Selecione o consultor</option>
                {(roundRobin?.agents ?? []).map((a) => (
                  <option key={a.user_id} value={a.user_id}>
                    {a.full_name}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setRedistributeSideOverOpen(false)}
                className="rounded-lg border border-[#E2E8F0] px-4 py-2 text-sm font-medium text-[#64748B] hover:bg-[#F8FAFC]"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleRedistribute}
                disabled={!redistributeConversationId || !redistributeUserId || runningAction}
                className="inline-flex items-center gap-2 rounded-lg bg-clicvend-orange px-4 py-2 text-sm font-medium text-white hover:bg-clicvend-orange-dark disabled:opacity-60"
              >
                <ArrowRightLeft className="h-4 w-4" />
                Redistribuir
              </button>
            </div>
          </div>
        </SideOver>

        <ConfirmDialog
          open={!!deleteContactId}
          onClose={() => setDeleteContactId(null)}
          onConfirm={async () => {
            if (!deleteContactId) return;
            await handleDeleteContact(deleteContactId);
            setDeleteContactId(null);
          }}
          title="Remover contato da carteira?"
          message="Esse contato deixará de pertencer ao consultor atual. Na próxima entrada, ele pode cair no round-robin."
          confirmLabel="Remover"
          variant="danger"
        />
    </div>
  );
}
