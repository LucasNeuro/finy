"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import {
  Bot,
  ChevronLeft,
  ChevronRight,
  Loader2,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Sparkles,
  Trash2,
} from "lucide-react";
import { queryKeys } from "@/lib/query-keys";
import { SideOver } from "@/components/SideOver";
import { ConfirmDialog } from "@/components/ConfirmDialog";

const COPILOT_PAGE_SIZE = 5;

type CopilotAgentRow = {
  id: string;
  name: string;
  external_agent_id: string;
  agent_version: number;
  prompt_extra: string;
  channel_id: string | null;
  queue_id: string | null;
  is_active: boolean;
};

type ChannelOpt = { id: string; name: string };
type QueueOpt = { id: string; name: string };

type Draft = {
  name: string;
  external_agent_id: string;
  agent_version: number;
  prompt_extra: string;
  channel_id: string | null;
  queue_id: string | null;
  is_active: boolean;
};

function slugFromPath(pathname: string | null): string {
  const s = pathname?.split("/").filter(Boolean)[0] ?? "";
  if (s && !["login", "api", "onboarding", "auth"].includes(s)) return s;
  return s;
}

function emptyDraft(): Draft {
  return {
    name: "Copiloto",
    external_agent_id: "",
    agent_version: 0,
    prompt_extra: "",
    channel_id: null,
    queue_id: null,
    is_active: true,
  };
}

function rowToDraft(r: CopilotAgentRow): Draft {
  return {
    name: r.name,
    external_agent_id: r.external_agent_id,
    agent_version: r.agent_version,
    prompt_extra: r.prompt_extra,
    channel_id: r.channel_id,
    queue_id: r.queue_id,
    is_active: r.is_active,
  };
}

export default function CopilotoPage() {
  const pathname = usePathname();
  const router = useRouter();
  const slug = slugFromPath(pathname);
  /** Objeto estável por slug — evita recriar `load` a cada render e loop infinito no useEffect de fetch. */
  const apiHeaders = useMemo(
    () => (slug ? ({ "X-Company-Slug": slug } as const) : undefined),
    [slug]
  );

  const { data: permissionsData } = useQuery({
    queryKey: queryKeys.permissions(slug ?? ""),
    queryFn: () =>
      fetch("/api/auth/permissions", { credentials: "include", headers: apiHeaders }).then((r) => r.json()),
    enabled: !!slug,
    staleTime: 5 * 60 * 1000,
  });
  const permissions = Array.isArray(permissionsData?.permissions) ? permissionsData.permissions : [];
  const copilotModuleOn = permissionsData?.copilot_module_enabled !== false;
  const canManage = permissions.includes("copilot.manage");

  useEffect(() => {
    if (slug && permissionsData !== undefined && (!canManage || !copilotModuleOn)) {
      router.replace(`/${slug}/conversas`);
    }
  }, [slug, permissionsData, canManage, copilotModuleOn, router]);

  const [agents, setAgents] = useState<CopilotAgentRow[]>([]);
  const [channels, setChannels] = useState<ChannelOpt[]>([]);
  const [queues, setQueues] = useState<QueueOpt[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [search, setSearch] = useState("");
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const [panelOpen, setPanelOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [panelSaving, setPanelSaving] = useState(false);
  const [panelError, setPanelError] = useState("");

  const [deleteTarget, setDeleteTarget] = useState<CopilotAgentRow | null>(null);

  const [pageIndex, setPageIndex] = useState(0);

  const [createDescription, setCreateDescription] = useState(
    "Assistente interno para atendentes no painel."
  );
  const [createInstructions, setCreateInstructions] = useState(
    "Você é um copiloto em português brasileiro. Ajude o atendente com sugestões; o cliente não lê suas respostas."
  );
  const [createModel, setCreateModel] = useState("mistral-medium-latest");
  const [provisioning, setProvisioning] = useState(false);

  const load = useCallback(async () => {
    if (!apiHeaders) return;
    setLoadError("");
    try {
      const [agRes, chRes, qRes] = await Promise.all([
        fetch("/api/companies/copilot-agents", { credentials: "include", headers: apiHeaders }),
        fetch("/api/channels", { credentials: "include", headers: apiHeaders }),
        fetch("/api/queues", { credentials: "include", headers: apiHeaders }),
      ]);
      const agJson = (await agRes.json().catch(() => ({}))) as {
        error?: string;
        agents?: CopilotAgentRow[];
      };
      if (!agRes.ok) {
        setLoadError(typeof agJson.error === "string" ? agJson.error : "Falha ao carregar agentes.");
        setAgents([]);
      } else {
        setAgents(Array.isArray(agJson.agents) ? agJson.agents : []);
      }

      if (chRes.ok) {
        const ch = (await chRes.json().catch(() => [])) as ChannelOpt[];
        setChannels(Array.isArray(ch) ? ch : []);
      }
      if (qRes.ok) {
        const qu = (await qRes.json().catch(() => [])) as QueueOpt[];
        setQueues(Array.isArray(qu) ? qu : []);
      }
    } catch {
      setLoadError("Erro de rede.");
    }
  }, [apiHeaders]);

  useEffect(() => {
    if (!canManage || !apiHeaders || !copilotModuleOn) return;
    setLoading(true);
    void load().finally(() => setLoading(false));
  }, [canManage, apiHeaders, copilotModuleOn, load]);

  const channelLabel = useCallback(
    (id: string | null) => {
      if (!id) return "Qualquer conexão";
      return channels.find((c) => c.id === id)?.name ?? id.slice(0, 8) + "…";
    },
    [channels]
  );

  const queueLabel = useCallback(
    (id: string | null) => {
      if (!id) return "Qualquer fila";
      return queues.find((q) => q.id === id)?.name ?? id.slice(0, 8) + "…";
    },
    [queues]
  );

  const schemaMigrationHint = useMemo(
    () => /company_copilot_agents|schema cache/i.test(loadError),
    [loadError]
  );

  const filteredAgents = useMemo(() => {
    const t = search.trim().toLowerCase();
    if (!t) return agents;
    return agents.filter(
      (a) =>
        a.name.toLowerCase().includes(t) ||
        a.external_agent_id.toLowerCase().includes(t) ||
        channelLabel(a.channel_id).toLowerCase().includes(t) ||
        queueLabel(a.queue_id).toLowerCase().includes(t)
    );
  }, [agents, search, channelLabel, queueLabel]);

  const pageCount = Math.max(1, Math.ceil(filteredAgents.length / COPILOT_PAGE_SIZE));
  const safePageIndex = Math.min(pageIndex, pageCount - 1);
  const pagedAgents = filteredAgents.slice(
    safePageIndex * COPILOT_PAGE_SIZE,
    safePageIndex * COPILOT_PAGE_SIZE + COPILOT_PAGE_SIZE
  );

  useEffect(() => {
    setPageIndex(0);
  }, [search]);

  useEffect(() => {
    if (pageIndex > pageCount - 1) {
      setPageIndex(Math.max(0, pageCount - 1));
    }
  }, [pageCount, pageIndex]);

  async function persistAll(nextAgents: CopilotAgentRow[]): Promise<boolean> {
    if (!apiHeaders) return false;
    const res = await fetch("/api/companies/copilot-agents", {
      method: "PUT",
      credentials: "include",
      headers: { "Content-Type": "application/json", ...apiHeaders },
      body: JSON.stringify({
        agents: nextAgents.map((a) => ({
          name: a.name,
          external_agent_id: a.external_agent_id.trim(),
          agent_version: a.agent_version,
          prompt_extra: a.prompt_extra.trim(),
          channel_id: a.channel_id,
          queue_id: a.queue_id,
          is_active: a.is_active,
        })),
      }),
    });
    const json = (await res.json().catch(() => ({}))) as { error?: string };
    if (!res.ok) {
      setFeedback({ type: "error", message: typeof json.error === "string" ? json.error : "Erro ao salvar." });
      return false;
    }
    setFeedback({ type: "success", message: "Alterações salvas." });
    await load();
    return true;
  }

  function openNew() {
    setEditingId(null);
    setDraft(emptyDraft());
    setPanelError("");
    setPanelOpen(true);
  }

  function openEdit(row: CopilotAgentRow) {
    setEditingId(row.id);
    setDraft(rowToDraft(row));
    setPanelError("");
    setPanelOpen(true);
  }

  async function savePanel() {
    const agId = draft.external_agent_id.trim();
    if (!agId.startsWith("ag_")) {
      setPanelError("Informe um ID de agente válido (começa com ag_).");
      return;
    }
    setPanelSaving(true);
    setPanelError("");
    try {
      let next: CopilotAgentRow[];
      if (editingId) {
        next = agents.map((a) =>
          a.id === editingId
            ? {
                ...a,
                name: draft.name.trim() || "Copiloto",
                external_agent_id: agId,
                agent_version: draft.agent_version,
                prompt_extra: draft.prompt_extra,
                channel_id: draft.channel_id,
                queue_id: draft.queue_id,
                is_active: draft.is_active,
              }
            : a
        );
      } else {
        next = [
          ...agents,
          {
            id: `local-${crypto.randomUUID()}`,
            name: draft.name.trim() || "Copiloto",
            external_agent_id: agId,
            agent_version: draft.agent_version,
            prompt_extra: draft.prompt_extra,
            channel_id: draft.channel_id,
            queue_id: draft.queue_id,
            is_active: draft.is_active,
          },
        ];
      }
      const ok = await persistAll(next);
      if (ok) setPanelOpen(false);
    } finally {
      setPanelSaving(false);
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    const next = agents.filter((a) => a.id !== deleteTarget.id);
    setDeleteTarget(null);
    await persistAll(next);
  }

  async function provisionAndBind() {
    if (!apiHeaders) return;
    if (!draft.name.trim()) {
      setPanelError("Informe o nome do agente.");
      return;
    }
    if (!createDescription.trim()) {
      setPanelError("Descrição é obrigatória para criar no provedor.");
      return;
    }
    setProvisioning(true);
    setPanelError("");
    try {
      const res = await fetch("/api/companies/copilot-agents/provision", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json", ...apiHeaders },
        body: JSON.stringify({
          name: draft.name.trim(),
          description: createDescription.trim(),
          instructions: createInstructions.trim(),
          model: createModel.trim() || "mistral-medium-latest",
          channel_id: draft.channel_id,
          queue_id: draft.queue_id,
          prompt_extra: draft.prompt_extra.trim(),
          is_active: draft.is_active,
        }),
      });
      const json = (await res.json().catch(() => ({}))) as {
        error?: string;
        hint?: string;
        dev?: { platformKeySource?: string; chatTargetIsMistral?: boolean };
      };
      if (!res.ok) {
        const msg =
          typeof json.error === "string" ? json.error : "Falha ao criar e vincular.";
        let full = json.hint ? `${msg} ${json.hint}` : msg;
        if (json.dev?.platformKeySource) {
          full += ` [dev: chave usada=${json.dev.platformKeySource}, chatMistral=${String(json.dev.chatTargetIsMistral)} — confira .env.local não sobrescrever com chave vazia]`;
        }
        setPanelError(full);
        return;
      }
      setFeedback({ type: "success", message: "Agente criado no provedor e vinculado à conexão/fila." });
      setPanelOpen(false);
      await load();
    } catch {
      setPanelError("Erro de rede.");
    } finally {
      setProvisioning(false);
    }
  }

  const refresh = async () => {
    setRefreshing(true);
    try {
      await load();
    } finally {
      setRefreshing(false);
    }
  };

  if (!slug) return null;
  if (slug && permissionsData !== undefined && (!canManage || !copilotModuleOn)) {
    return null;
  }

  return (
    <div className="flex flex-col gap-4 p-6">
      <div className="rounded-xl border border-[#E2E8F0] bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[#F1F5F9] text-[#475569]">
              <Bot className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-[#1E293B]">Copiloto</h1>
              <p className="mt-0.5 text-sm text-[#64748B]">
                Total:{" "}
                <span className="font-medium tabular-nums text-[#1E293B]">{filteredAgents.length}</span> agente
                {filteredAgents.length !== 1 ? "s" : ""}
                {search.trim() ? (
                  <>
                    {" "}
                    de <span className="font-medium tabular-nums text-[#1E293B]">{agents.length}</span>
                  </>
                ) : null}
                . Na conversa vale a regra mais específica (conexão/fila).
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative w-[260px] max-w-full">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#94A3B8]" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Pesquisar agentes…"
                className="h-9 w-full rounded-lg border border-[#E2E8F0] bg-white pl-9 pr-3 text-sm text-[#1E293B] placeholder:text-[#94A3B8] focus:border-clicvend-orange focus:outline-none focus:ring-1 focus:ring-clicvend-orange"
              />
            </div>
            <button
              type="button"
              onClick={() => void refresh()}
              className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#F1F5F9] text-[#64748B] transition-colors hover:bg-[#E2E8F0]"
              aria-label="Atualizar"
            >
              <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
            </button>
            <button
              type="button"
              onClick={openNew}
              className="inline-flex items-center gap-1.5 rounded-lg bg-clicvend-orange px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-clicvend-orange-dark"
            >
              <Plus className="h-4 w-4" />
              Novo agente
            </button>
          </div>
        </div>
      </div>

      {feedback ? (
        <div
          className={`rounded-lg border px-3 py-2 text-sm ${
            feedback.type === "success"
              ? "border-emerald-200 bg-emerald-50 text-emerald-700"
              : "border-red-200 bg-red-50 text-red-700"
          }`}
        >
          {feedback.message}
        </div>
      ) : null}

      {loadError ? <p className="text-sm text-red-600">{loadError}</p> : null}
      {schemaMigrationHint ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          <p className="font-medium">Tabela ainda não existe no banco</p>
          <p className="mt-1 text-amber-800">
            Aplique as migrações do Copiloto: <code className="rounded bg-amber-100 px-1">npx supabase db push</code> ou
            cole no SQL Editor o arquivo{" "}
            <code className="rounded bg-amber-100 px-1">supabase/copilot_aplicar_manual.sql</code> (inclui tabela, coluna
            JSON e permissões).
          </p>
        </div>
      ) : null}

      {loading ? (
        <div className="flex justify-center py-12">
          <div className="flex flex-col items-center gap-3">
            <Loader2 className="h-8 w-8 animate-spin text-clicvend-orange" />
            <span className="text-sm text-[#64748B]">Carregando…</span>
          </div>
        </div>
      ) : agents.length === 0 && !loadError ? (
        <div className="rounded-xl border border-[#E2E8F0] bg-white p-8 text-center shadow-sm">
          <Bot className="mx-auto h-12 w-12 text-[#94A3B8]" />
          <p className="mt-2 text-[#64748B]">Nenhum agente cadastrado.</p>
          <p className="mt-1 text-xs text-[#94A3B8]">
            Crie pelo botão Novo agente — o id no provedor é gerado automaticamente ao vincular.
          </p>
          <button
            type="button"
            onClick={openNew}
            className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-clicvend-orange px-4 py-2 text-sm font-medium text-white hover:bg-clicvend-orange-dark"
          >
            <Plus className="h-4 w-4" />
            Novo agente
          </button>
        </div>
      ) : (
        <div className="rounded-xl border border-[#E2E8F0] bg-white shadow-sm overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[#E2E8F0] bg-[#F8FAFC] px-4 py-3">
            <p className="text-sm text-[#64748B]">
              <span className="font-medium text-[#1E293B]">{filteredAgents.length}</span> agente
              {filteredAgents.length !== 1 ? "s" : ""}
              {search.trim() ? (
                <>
                  {" "}
                  de <span className="font-medium text-[#1E293B]">{agents.length}</span>
                </>
              ) : null}
            </p>
          </div>

          <div className="max-h-[min(70vh,640px)] overflow-auto">
            <table className="w-full min-w-[1280px]">
              <thead>
                <tr className="border-b border-[#E2E8F0] bg-[#F8FAFC]">
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-[#64748B]">
                    Nome
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-[#64748B]">
                    Onde vale
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-[#64748B]">
                    Agente (id)
                  </th>
                  <th className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-wider text-[#64748B]">
                    v
                  </th>
                  <th className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-wider text-[#64748B]">
                    Ativo
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-[#64748B]">
                    Ações
                  </th>
                </tr>
              </thead>
              <tbody>
                {pagedAgents.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-sm text-[#64748B]">
                      {agents.length === 0
                        ? loadError
                          ? "Não foi possível carregar a lista. Verifique o aviso acima ou a conexão."
                          : "Nenhum agente."
                        : "Nenhum resultado na busca."}
                    </td>
                  </tr>
                ) : (
                  pagedAgents.map((a) => (
                    <tr
                      key={a.id}
                      className="border-b border-[#E2E8F0] last:border-0 transition-colors hover:bg-[#F8FAFC]"
                    >
                      <td className="px-4 py-3 align-top">
                        <p className="font-medium text-[#1E293B]">{a.name}</p>
                      </td>
                      <td className="px-4 py-3 align-top">
                        <div className="flex flex-col gap-0.5 text-sm text-[#475569]">
                          <span className="text-[#334155]">{channelLabel(a.channel_id)}</span>
                          <span className="text-xs text-[#64748B]">{queueLabel(a.queue_id)}</span>
                        </div>
                      </td>
                      <td className="max-w-[28rem] px-4 py-3 align-top">
                        <code className="block max-w-full overflow-x-auto whitespace-nowrap text-xs font-mono text-[#334155] [scrollbar-width:thin]">
                          {a.external_agent_id}
                        </code>
                      </td>
                      <td className="px-4 py-3 text-center tabular-nums text-sm text-[#475569] align-top">
                        {a.agent_version}
                      </td>
                      <td className="px-4 py-3 text-center align-top">
                        <span
                          className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                            a.is_active ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"
                          }`}
                        >
                          {a.is_active ? "Sim" : "Não"}
                        </span>
                      </td>
                      <td className="px-4 py-3 align-top">
                        <div className="flex justify-end gap-1">
                          <button
                            type="button"
                            onClick={() => openEdit(a)}
                            className="rounded-lg p-2 text-[#64748B] hover:bg-[#F1F5F9] hover:text-[#334155]"
                            title="Editar"
                          >
                            <Pencil className="h-4 w-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => setDeleteTarget(a)}
                            className="rounded-lg p-2 text-[#64748B] hover:bg-red-50 hover:text-red-600"
                            title="Remover"
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
              Página <span className="font-medium text-[#1E293B] tabular-nums">{safePageIndex + 1}</span> de{" "}
              <span className="font-medium text-[#1E293B] tabular-nums">{pageCount}</span> (
              {filteredAgents.length} agente{filteredAgents.length !== 1 ? "s" : ""})
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

      <SideOver
        open={panelOpen}
        onClose={() => setPanelOpen(false)}
        title={editingId ? "Editar agente" : "Novo agente"}
        width={520}
      >
        <div className="flex flex-col gap-4">
          {panelError ? <p className="text-sm text-red-600">{panelError}</p> : null}

          {editingId ? (
            <>
              <label className="block text-xs font-medium text-[#475569]">
                Nome (interno)
                <input
                  value={draft.name}
                  onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
                  className="mt-1 w-full rounded-lg border border-[#E2E8F0] px-3 py-2 text-sm"
                />
              </label>
              <label className="block text-xs font-medium text-[#475569]">
                ID do agente no provedor
                <input
                  value={draft.external_agent_id}
                  onChange={(e) => setDraft((d) => ({ ...d, external_agent_id: e.target.value }))}
                  placeholder="ag_…"
                  className="mt-1 w-full rounded-lg border border-[#E2E8F0] px-3 py-2 text-sm font-mono"
                />
              </label>
              <label className="block text-xs font-medium text-[#475569]">
                Versão
                <input
                  type="number"
                  min={0}
                  value={draft.agent_version}
                  onChange={(e) =>
                    setDraft((d) => ({ ...d, agent_version: parseInt(e.target.value, 10) || 0 }))
                  }
                  className="mt-1 w-full rounded-lg border border-[#E2E8F0] px-3 py-2 text-sm"
                />
              </label>
            </>
          ) : (
            <>
              <p className="text-xs text-[#64748B]">
                Preencha nome, descrição e instruções; escolha conexão/fila. Um clique cria o agente no provedor e já
                grava a regra na lista — sem copiar <code className="font-mono text-[#475569]">ag_…</code> no painel
                externo.
              </p>
              <label className="block text-xs font-medium text-[#475569]">
                Nome (lista e provedor)
                <input
                  value={draft.name}
                  onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
                  className="mt-1 w-full rounded-lg border border-[#E2E8F0] px-3 py-2 text-sm"
                />
              </label>
              <label className="block text-xs font-medium text-[#475569]">
                Descrição (obrigatória na API do provedor)
                <input
                  value={createDescription}
                  onChange={(e) => setCreateDescription(e.target.value)}
                  placeholder="Ex.: Assistente interno para atendentes"
                  className="mt-1 w-full rounded-lg border border-[#E2E8F0] px-3 py-2 text-sm"
                />
              </label>
              <label className="block text-xs font-medium text-[#475569]">
                Instruções do agente (system)
                <textarea
                  value={createInstructions}
                  onChange={(e) => setCreateInstructions(e.target.value)}
                  rows={4}
                  className="mt-1 w-full rounded-lg border border-[#E2E8F0] px-3 py-2 text-sm"
                />
              </label>
              <label className="block text-xs font-medium text-[#475569]">
                Modelo
                <input
                  value={createModel}
                  onChange={(e) => setCreateModel(e.target.value)}
                  placeholder="mistral-medium-latest"
                  className="mt-1 w-full rounded-lg border border-[#E2E8F0] px-3 py-2 text-sm font-mono"
                />
              </label>
            </>
          )}

          <label className="block text-xs font-medium text-[#475569]">
            Conexão
            <select
              value={draft.channel_id ?? ""}
              onChange={(e) =>
                setDraft((d) => ({ ...d, channel_id: e.target.value ? e.target.value : null }))
              }
              className="mt-1 w-full rounded-lg border border-[#E2E8F0] px-3 py-2 text-sm"
            >
              <option value="">Qualquer</option>
              {channels.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-xs font-medium text-[#475569]">
            Fila
            <select
              value={draft.queue_id ?? ""}
              onChange={(e) =>
                setDraft((d) => ({ ...d, queue_id: e.target.value ? e.target.value : null }))
              }
              className="mt-1 w-full rounded-lg border border-[#E2E8F0] px-3 py-2 text-sm"
            >
              <option value="">Qualquer</option>
              {queues.map((q) => (
                <option key={q.id} value={q.id}>
                  {q.name}
                </option>
              ))}
            </select>
          </label>
          <p className="text-[11px] text-[#64748B]">
            A regra mais específica vence: preencha conexão e/ou fila para limitar onde este agente entra no chat
            interno da conversa.
          </p>
          <label className="flex items-center gap-2 text-sm text-[#334155]">
            <input
              type="checkbox"
              checked={draft.is_active}
              onChange={(e) => setDraft((d) => ({ ...d, is_active: e.target.checked }))}
              className="h-4 w-4 rounded border-[#E2E8F0] text-clicvend-orange focus:ring-clicvend-orange"
            />
            Agente ativo
          </label>
          <label className="block text-xs font-medium text-[#475569]">
            Instruções extras (primeira mensagem do fio)
            <textarea
              value={draft.prompt_extra}
              onChange={(e) => setDraft((d) => ({ ...d, prompt_extra: e.target.value }))}
              rows={4}
              className="mt-1 w-full rounded-lg border border-[#E2E8F0] px-3 py-2 text-sm"
            />
          </label>

          {!editingId ? (
            <button
              type="button"
              onClick={() => void provisionAndBind()}
              disabled={provisioning || !draft.name.trim() || !createDescription.trim()}
              className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-clicvend-orange px-4 py-2.5 text-sm font-medium text-white hover:bg-clicvend-orange-dark disabled:opacity-50"
            >
              {provisioning ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
              Criar no provedor e vincular
            </button>
          ) : null}

          <div className="mt-2 flex gap-2 border-t border-[#E2E8F0] pt-4">
            <button
              type="button"
              onClick={() => setPanelOpen(false)}
              className="rounded-lg border border-[#E2E8F0] bg-white px-4 py-2 text-sm font-medium text-[#475569] hover:bg-[#F8FAFC]"
            >
              Cancelar
            </button>
            {editingId ? (
              <button
                type="button"
                onClick={() => void savePanel()}
                disabled={panelSaving}
                className="inline-flex flex-1 items-center justify-center gap-2 rounded-lg bg-clicvend-orange px-4 py-2 text-sm font-medium text-white hover:bg-clicvend-orange-dark disabled:opacity-50"
              >
                {panelSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                Salvar
              </button>
            ) : null}
          </div>
        </div>
      </SideOver>

      <ConfirmDialog
        open={deleteTarget !== null}
        onClose={() => setDeleteTarget(null)}
        title="Remover agente"
        message={
          deleteTarget
            ? `Remover "${deleteTarget.name}" da lista? A conversa deixará de usar este agente para o escopo configurado.`
            : ""
        }
        confirmLabel="Remover"
        variant="danger"
        onCancel={() => setDeleteTarget(null)}
        onConfirm={() => void confirmDelete()}
      />
    </div>
  );
}
