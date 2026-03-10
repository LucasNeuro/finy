"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import {
  Loader2,
  MessageSquare,
  Plus,
  RefreshCw,
  Settings,
  Sparkles,
  Trash2,
} from "lucide-react";
import { SideOver } from "@/components/SideOver";
import { ConfirmDialog } from "@/components/ConfirmDialog";

type QuickReplyRow = {
  id: string;
  uazapiId: string;
  shortCut: string;
  type: string;
  text: string | null;
  file: string | null;
  docName: string | null;
  onWhatsApp: boolean;
  enabled: boolean;
  queueIds: string[];
  createdAt: string;
  updatedAt: string;
};

type Channel = { id: string; name: string };
type Queue = { id: string; name: string };

const EMPTY_FORM: QuickReplyFormState = {
  id: null,
  uazapiId: null,
  shortCut: "",
  type: "text",
  text: "",
  file: "",
  docName: "",
  channelId: "",
  queueIds: [],
};

type QuickReplyFormState = {
  id: string | null;
  uazapiId: string | null;
  shortCut: string;
  type: string;
  text: string;
  file: string;
  docName: string;
  channelId: string;
  queueIds: string[];
};

export default function RespostasRapidasPage() {
  const pathname = usePathname();
  const segments = pathname?.split("/").filter(Boolean) ?? [];
  const slug = segments[0];

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [rows, setRows] = useState<QuickReplyRow[]>([]);
  const [channels, setChannels] = useState<Channel[]>([]);
  const [queues, setQueues] = useState<Queue[]>([]);
  const [channelQueues, setChannelQueues] = useState<Queue[]>([]);
  const [channelQueuesLoading, setChannelQueuesLoading] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [sideOverTab, setSideOverTab] = useState<"form" | "ativas">("form");
  const [form, setForm] = useState<QuickReplyFormState>(EMPTY_FORM);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkActionLoading, setBulkActionLoading] = useState(false);
  const [deleteConfirmRow, setDeleteConfirmRow] = useState<QuickReplyRow | null>(null);
  const [bulkDeleteConfirm, setBulkDeleteConfirm] = useState(false);

  const apiHeaders = useMemo(
    () => (slug ? { "X-Company-Slug": slug } : undefined),
    [slug]
  );

  const fetchChannels = useCallback(() => {
    if (!slug) return;
    fetch("/api/channels", { credentials: "include", headers: apiHeaders })
      .then((r) => r.json())
      .then((data) => setChannels(Array.isArray(data) ? data : []))
      .catch(() => setChannels([]));
  }, [slug, apiHeaders]);

  const fetchQueues = useCallback(() => {
    if (!slug) return;
    fetch("/api/queues", { credentials: "include", headers: apiHeaders })
      .then((r) => r.json())
      .then((data) => setQueues(Array.isArray(data) ? data : []))
      .catch(() => setQueues([]));
  }, [slug, apiHeaders]);

  const fetchQueuesForChannel = useCallback(
    async (channelId: string) => {
      if (!channelId || !apiHeaders) {
        setChannelQueues([]);
        return;
      }
      setChannelQueuesLoading(true);
      try {
        const res = await fetch(`/api/channels/${channelId}/queues`, {
          credentials: "include",
          headers: apiHeaders,
        });
        const data = await res.json().catch(() => []);
        if (!res.ok) {
          setChannelQueues([]);
          return;
        }
        const list = Array.isArray(data) ? data : [];
        const items: Queue[] = list.map((item: { queue_id: string; queue?: { id: string; name: string } }) => ({
          id: item.queue_id,
          name: item.queue?.name ?? item.queue_id,
        }));
        setChannelQueues(items);
      } catch {
        setChannelQueues([]);
      } finally {
        setChannelQueuesLoading(false);
      }
    },
    [apiHeaders]
  );

  const fetchQuickReplies = useCallback(async () => {
    if (!slug) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/quick-replies", {
        credentials: "include",
        headers: apiHeaders,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data?.error ?? "Falha ao carregar respostas rápidas.");
        setRows([]);
        return;
      }
      setRows(Array.isArray(data?.data) ? (data.data as QuickReplyRow[]) : []);
    } catch {
      setError("Erro de rede ao carregar respostas rápidas.");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [slug, apiHeaders]);

  useEffect(() => {
    fetchChannels();
    fetchQueues();
  }, [fetchChannels, fetchQueues]);

  useEffect(() => {
    if (showForm && form.channelId) {
      fetchQueuesForChannel(form.channelId);
    } else {
      setChannelQueues([]);
    }
  }, [showForm, form.channelId, fetchQueuesForChannel]);

  useEffect(() => {
    fetchQuickReplies();
  }, [fetchQuickReplies]);

  const openNewForm = () => {
    setForm({
      ...EMPTY_FORM,
      channelId: channels.length > 0 ? channels[0].id : "",
    });
    setSideOverTab("form");
    setShowForm(true);
  };

  const openEditForm = (row: QuickReplyRow) => {
    setForm({
      id: row.id,
      uazapiId: row.uazapiId,
      shortCut: row.shortCut,
      type: row.type,
      text: row.text ?? "",
      file: row.file ?? "",
      docName: row.docName ?? "",
      channelId: channels.length > 0 ? channels[0].id : "",
      queueIds: row.queueIds ?? [],
    });
    setSideOverTab("form");
    setShowForm(true);
  };

  const handleChannelChange = (channelId: string) => {
    setForm((c) => ({ ...c, channelId, queueIds: [] }));
  };

  const closeForm = () => {
    setShowForm(false);
    setSideOverTab("form");
    setForm(EMPTY_FORM);
  };

  const handleToggleEnabled = async (row: QuickReplyRow) => {
    setError(null);
    try {
      const res = await fetch("/api/quick-replies", {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          ...(apiHeaders ?? {}),
        },
        body: JSON.stringify({
          quick_reply_id: row.id,
          enabled: !row.enabled,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data?.error ?? "Falha ao ativar/desativar.");
        return;
      }
      fetchQuickReplies();
    } catch {
      setError("Erro de rede ao atualizar status.");
    }
  };

  const handleGenerateWithAI = async () => {
    if (!slug) return;
    setSaving(true);
    setError(null);
    try {
      const queueNames = form.queueIds
        .map((qid) => channelQueues.find((q) => q.id === qid)?.name)
        .filter(Boolean);
      const contextParts: string[] = [];
      if (form.shortCut) contextParts.push(`Título/atalho: ${form.shortCut}`);
      if (queueNames.length > 0) contextParts.push(`Filas: ${queueNames.join(", ")}`);
      contextParts.push("Uso: mensagem curta e educada para atendimento no WhatsApp.");
      const res = await fetch("/api/ai/generate-description", {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          ...(apiHeaders ?? {}),
        },
        body: JSON.stringify({
          type: "quick_reply",
          field: "description",
          name: form.shortCut || "Resposta rápida",
          context: contextParts.join(". "),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.text) {
        setError(data?.error ?? "Falha ao gerar sugestão com IA.");
        return;
      }
      setForm((cur) => ({ ...cur, text: data.text as string }));
    } catch {
      setError("Erro de rede ao chamar IA.");
    } finally {
      setSaving(false);
    }
  };

  const handleSave = async () => {
    if (!slug) return;
    if (!form.shortCut.trim()) {
      setError("Preencha o atalho da resposta rápida.");
      return;
    }
    if (form.type === "text" && !form.text.trim()) {
      setError("Preencha o texto da resposta rápida.");
      return;
    }
    if (!form.channelId.trim()) {
      setError("Selecione uma conexão para salvar na UAZAPI.");
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/quick-replies", {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          ...(apiHeaders ?? {}),
        },
        body: JSON.stringify({
          channel_id: form.channelId,
          id: form.uazapiId ?? undefined,
          shortCut: form.shortCut.trim(),
          type: form.type,
          text: form.type === "text" ? form.text.trim() : undefined,
          file: form.type !== "text" ? form.file.trim() || undefined : undefined,
          docName: form.docName.trim() || undefined,
          queueIds: form.queueIds,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data?.error ?? "Falha ao salvar resposta rápida.");
        return;
      }
      closeForm();
      fetchQuickReplies();
    } catch {
      setError("Erro de rede ao salvar.");
    } finally {
      setSaving(false);
    }
  };

  const doDeleteOne = async (row: QuickReplyRow) => {
    if (!slug || !row.uazapiId) return;
    const channelId = form.channelId || channels[0]?.id;
    if (!channelId) {
      setError("Selecione uma conexão para excluir da UAZAPI.");
      setDeleteConfirmRow(null);
      return;
    }
    setDeleting(row.id);
    setError(null);
    setDeleteConfirmRow(null);
    try {
      const res = await fetch("/api/quick-replies", {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          ...(apiHeaders ?? {}),
        },
        body: JSON.stringify({
          channel_id: channelId,
          id: row.uazapiId,
          delete: true,
          shortCut: row.shortCut,
          type: row.type,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data?.error ?? "Falha ao excluir resposta rápida.");
        return;
      }
      fetchQuickReplies();
      setSelectedIds((prev) => {
        const next = new Set(prev);
        next.delete(row.id);
        return next;
      });
    } catch {
      setError("Erro de rede ao excluir.");
    } finally {
      setDeleting(null);
    }
  };

  const doBulkDelete = async () => {
    if (!slug || selectedIds.size === 0) return;
    const channelId = channels[0]?.id;
    if (!channelId) {
      setError("Cadastre uma conexão para excluir respostas rápidas da UAZAPI.");
      return;
    }
    const toDelete = rows.filter((r) => selectedIds.has(r.id) && r.uazapiId);
    setBulkActionLoading(true);
    setError(null);
    try {
      await Promise.all(
        toDelete.map((row) =>
          fetch("/api/quick-replies", {
            method: "POST",
            credentials: "include",
            headers: {
              "Content-Type": "application/json",
              ...(apiHeaders ?? {}),
            },
            body: JSON.stringify({
              channel_id: channelId,
              id: row.uazapiId,
              delete: true,
              shortCut: row.shortCut,
              type: row.type,
            }),
          })
        )
      );
      setSelectedIds(new Set());
      fetchQuickReplies();
    } catch {
      setError("Erro de rede ao excluir.");
    } finally {
      setBulkActionLoading(false);
    }
  };

  const toggleSelectAll = () => {
    if (rows.every((r) => selectedIds.has(r.id))) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(rows.map((r) => r.id)));
    }
  };

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const queueNames = (queueIds: string[]) =>
    queueIds
      .map((qid) => queues.find((q) => q.id === qid)?.name)
      .filter(Boolean)
      .join(", ") || "—";

  return (
    <div className="flex flex-col gap-4 p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-[#1E293B]">Respostas rápidas</h1>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => fetchQuickReplies()}
            className="flex h-10 w-10 items-center justify-center rounded-full bg-[#F1F5F9] text-[#64748B] hover:bg-[#E2E8F0] transition-colors"
            aria-label="Atualizar"
          >
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}
          </button>
          <button
            type="button"
            onClick={openNewForm}
            disabled={channels.length === 0}
            className="inline-flex items-center gap-1.5 rounded-lg bg-clicvend-orange px-4 py-2 text-sm font-medium text-white hover:bg-clicvend-orange-dark disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            title={channels.length === 0 ? "Cadastre uma conexão antes" : undefined}
          >
            <Plus className="h-4 w-4" />
            Nova resposta rápida
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      )}

      {loading && rows.length === 0 ? (
        <div className="rounded-xl border border-[#E2E8F0] bg-white p-8 text-center">
          <Loader2 className="mx-auto h-10 w-10 animate-spin text-[#94A3B8]" />
          <p className="mt-2 text-[#64748B]">Carregando respostas rápidas…</p>
        </div>
      ) : rows.length === 0 ? (
        <div className="rounded-xl border border-[#E2E8F0] bg-white p-8 text-center">
          <MessageSquare className="mx-auto h-12 w-12 text-[#94A3B8]" />
          <p className="mt-2 text-[#64748B]">Nenhuma resposta rápida cadastrada.</p>
          <p className="mt-1 text-xs text-[#94A3B8]">
            Cadastre uma conexão e crie templates para usar no chat.
          </p>
          <button
            type="button"
            onClick={openNewForm}
            disabled={channels.length === 0}
            className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-clicvend-orange px-4 py-2 text-sm font-medium text-white hover:bg-clicvend-orange-dark disabled:opacity-50"
          >
            <Plus className="h-4 w-4" />
            Nova resposta rápida
          </button>
        </div>
      ) : (
        <div className="rounded-xl border border-[#E2E8F0] bg-white shadow-sm overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[#E2E8F0] bg-[#F8FAFC] px-4 py-3">
            <p className="text-sm text-[#64748B]">
              <span className="font-medium text-[#1E293B]">{rows.length}</span> resposta(s) rápida(s)
            </p>
            <div className="flex items-center gap-4 text-sm">
              <span className="flex items-center gap-1.5 text-[#64748B]">
                <MessageSquare className="h-4 w-4 text-clicvend-orange" />
                <span className="uppercase text-[10px] font-medium tracking-wider text-[#64748B]">
                  Templates
                </span>
                <strong className="text-[#1E293B]">{rows.length}</strong>
              </span>
            </div>
          </div>

          {selectedIds.size > 0 && (
            <div className="flex flex-wrap items-center justify-between gap-4 px-4 py-3 bg-clicvend-orange/10 border-b border-[#E2E8F0]">
              <span className="text-sm font-medium text-[#1E293B]">
                {selectedIds.size} resposta(s) rápida(s) selecionada(s)
              </span>
              <div className="inline-flex flex-wrap rounded-lg border border-[#E2E8F0] bg-white overflow-hidden shadow-sm">
                <button
                  type="button"
                  disabled={bulkActionLoading}
                  onClick={() => setBulkDeleteConfirm(true)}
                  className="inline-flex items-center gap-1.5 border-r border-[#E2E8F0] bg-red-50 px-3 py-2 text-sm font-medium text-red-700 hover:bg-red-100 disabled:opacity-60"
                  title="Excluir as respostas rápidas selecionadas."
                >
                  {bulkActionLoading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Trash2 className="h-4 w-4" />
                  )}
                  Excluir
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedIds(new Set())}
                  disabled={bulkActionLoading}
                  className="inline-flex items-center gap-1.5 bg-white px-3 py-2 text-sm font-medium text-[#64748B] hover:bg-[#F1F5F9] disabled:opacity-60"
                  title="Desmarcar todas."
                >
                  Limpar seleção
                </button>
              </div>
            </div>
          )}

          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px]">
              <thead>
                <tr className="border-b border-[#E2E8F0] bg-[#F8FAFC]">
                  <th className="w-10 px-4 py-3 text-left">
                    <input
                      type="checkbox"
                      checked={rows.length > 0 && rows.every((r) => selectedIds.has(r.id))}
                      onChange={toggleSelectAll}
                      className="h-4 w-4 rounded border-[#E2E8F0] text-clicvend-orange focus:ring-clicvend-orange"
                      aria-label="Selecionar todas"
                    />
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-[#64748B]">
                    Atalho
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-[#64748B]">
                    Tipo
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-[#64748B]">
                    Texto
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-[#64748B]">
                    Status
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-[#64748B]">
                    Filas
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-[#64748B]">
                    Ações
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr
                    key={row.id}
                    className="border-b border-[#E2E8F0] transition-colors hover:bg-[#F8FAFC]"
                  >
                    <td className="w-10 px-4 py-3">
                      <input
                        type="checkbox"
                        checked={selectedIds.has(row.id)}
                        onChange={() => toggleSelect(row.id)}
                        className="h-4 w-4 rounded border-[#E2E8F0] text-clicvend-orange focus:ring-clicvend-orange"
                        aria-label={`Selecionar ${row.shortCut}`}
                      />
                    </td>
                    <td className="px-4 py-3">
                      <div>
                        <p className="font-semibold text-[#1E293B]">{row.shortCut}</p>
                        {row.uazapiId && (
                          <p
                            className="font-mono text-xs text-[#94A3B8]"
                            title={row.uazapiId}
                          >
                            {row.uazapiId.length > 16
                              ? `${row.uazapiId.slice(0, 12)}…`
                              : row.uazapiId}
                          </p>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm text-[#64748B]">{row.type}</td>
                    <td className="max-w-[200px] px-4 py-3 text-sm text-[#64748B] truncate">
                      {row.text
                        ? row.text.length > 50
                          ? `${row.text.slice(0, 50)}…`
                          : row.text
                        : "—"}
                    </td>
                    <td className="px-4 py-3">
                      {row.onWhatsApp ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-[#DCFCE7] px-2.5 py-0.5 text-xs font-medium text-[#16A34A]">
                          WhatsApp
                        </span>
                      ) : (
                        <span className="text-sm text-[#94A3B8]">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-sm text-[#64748B]">
                      {queueNames(row.queueIds)}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        {deleting === row.id ? (
                          <Loader2 className="h-5 w-5 animate-spin text-[#64748B]" />
                        ) : (
                          <>
                            <button
                              type="button"
                              onClick={() => openEditForm(row)}
                              title="Configurar"
                              className="rounded-lg p-2 text-[#64748B] hover:bg-[#F1F5F9] hover:text-[#1E293B] transition-colors"
                            >
                              <Settings className="h-5 w-5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => setDeleteConfirmRow(row)}
                              title="Excluir"
                              className="rounded-lg p-2 text-[#64748B] hover:bg-red-50 hover:text-red-600 transition-colors"
                            >
                              <Trash2 className="h-5 w-5" />
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <SideOver
        open={showForm}
        onClose={closeForm}
        title={form.id ? `Editar resposta rápida: ${form.shortCut || "…"}` : "Nova resposta rápida"}
        width={560}
      >
        <div className="mb-4 flex gap-2 border-b border-[#E2E8F0] pb-3">
          <button
            type="button"
            onClick={() => setSideOverTab("form")}
            className={`rounded-full px-3 py-1.5 text-sm font-medium transition-colors ${
              sideOverTab === "form"
                ? "bg-clicvend-orange/10 text-clicvend-orange"
                : "text-[#64748B] hover:bg-[#F1F5F9]"
            }`}
          >
            Configuração
          </button>
          <button
            type="button"
            onClick={() => setSideOverTab("ativas")}
            className={`rounded-full px-3 py-1.5 text-sm font-medium transition-colors ${
              sideOverTab === "ativas"
                ? "bg-clicvend-orange/10 text-clicvend-orange"
                : "text-[#64748B] hover:bg-[#F1F5F9]"
            }`}
          >
            Ativas
          </button>
        </div>

        {sideOverTab === "form" && (
          <>
            <p className="mb-4 text-sm text-[#64748B]">
              Escolha a conexão e as filas em que esta resposta rápida ficará disponível. O atalho e
              o texto são enviados à UAZAPI.
            </p>

            <label className="mb-1 block text-sm font-medium text-[#334155]">Conexão</label>
            <select
              value={form.channelId}
              onChange={(e) => handleChannelChange(e.target.value)}
              className="mb-4 w-full rounded-lg border border-[#E2E8F0] px-3 py-2 text-[#1E293B] focus:border-clicvend-orange focus:outline-none focus:ring-1 focus:ring-clicvend-orange"
            >
              <option value="">Selecionar conexão…</option>
              {channels.map((ch) => (
                <option key={ch.id} value={ch.id}>
                  {ch.name}
                </option>
              ))}
            </select>

            <label className="mb-1 block text-sm font-medium text-[#334155]">Filas (opcional)</label>
            <p className="mb-2 text-xs text-[#64748B]">
              Filas vinculadas a esta conexão. Respostas vinculadas a uma fila ficam disponíveis para
              agentes dessa fila no chat.
            </p>
            {!form.channelId ? (
              <p className="mb-4 rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] px-3 py-3 text-sm text-[#64748B]">
                Selecione uma conexão para ver as filas.
              </p>
            ) : channelQueuesLoading ? (
              <p className="mb-4 flex items-center gap-2 rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] px-3 py-3 text-sm text-[#64748B]">
                <Loader2 className="h-4 w-4 animate-spin" />
                Carregando filas…
              </p>
            ) : channelQueues.length === 0 ? (
              <p className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-3 text-sm text-amber-800">
                Nenhuma fila vinculada a esta conexão. Vincule filas em Configurar na tela de
                Conexões.
              </p>
            ) : (
              <select
                multiple
                value={form.queueIds}
                onChange={(e) => {
                  const selected = Array.from(e.target.selectedOptions, (o) => o.value);
                  setForm((c) => ({ ...c, queueIds: selected }));
                }}
                className="mb-4 h-24 w-full rounded-lg border border-[#E2E8F0] px-3 py-2 text-[#1E293B] focus:border-clicvend-orange focus:outline-none focus:ring-1 focus:ring-clicvend-orange"
              >
                {channelQueues.map((q) => (
                  <option key={q.id} value={q.id}>
                    {q.name}
                  </option>
                ))}
              </select>
            )}

            <label className="mb-1 block text-sm font-medium text-[#334155]">Atalho</label>
            <input
              type="text"
              value={form.shortCut}
              onChange={(e) => setForm((c) => ({ ...c, shortCut: e.target.value }))}
              placeholder="Ex: saudacao1"
              className="mb-4 w-full rounded-lg border border-[#E2E8F0] px-3 py-2 text-[#1E293B] placeholder:text-[#94A3B8] focus:border-clicvend-orange focus:outline-none focus:ring-1 focus:ring-clicvend-orange"
            />

            <label className="mb-1 block text-sm font-medium text-[#334155]">Texto</label>
            <textarea
              value={form.text}
              onChange={(e) => setForm((c) => ({ ...c, text: e.target.value }))}
              rows={4}
              placeholder="Ex: Olá! Como posso ajudar hoje?"
              className="mb-2 w-full resize-none rounded-lg border border-[#E2E8F0] px-3 py-2 text-[#1E293B] placeholder:text-[#94A3B8] focus:border-clicvend-orange focus:outline-none focus:ring-1 focus:ring-clicvend-orange"
            />
            <button
              type="button"
              disabled={saving}
              onClick={handleGenerateWithAI}
              className="mb-4 inline-flex items-center gap-1.5 rounded-full border border-emerald-500/60 bg-emerald-50 px-3 py-1.5 text-xs font-medium text-emerald-800 hover:bg-emerald-100 disabled:opacity-60"
            >
              {saving ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <Sparkles className="h-3 w-3" />
              )}
              Sugerir com IA
            </button>

            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={closeForm}
                className="rounded-lg border border-[#E2E8F0] px-4 py-2 text-sm font-medium text-[#64748B] hover:bg-[#F8FAFC]"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={saving}
                className="inline-flex items-center gap-2 rounded-lg bg-clicvend-orange px-4 py-2 text-sm font-medium text-white hover:bg-clicvend-orange-dark disabled:opacity-60"
              >
                {saving ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Salvando…
                  </>
                ) : (
                  "Salvar"
                )}
              </button>
            </div>
          </>
        )}

        {sideOverTab === "ativas" && (
          <div className="space-y-3">
            <p className="text-sm text-[#64748B]">
              Respostas ativas aparecem no chat para os agentes das filas vinculadas. Use o botão
              para ativar ou desativar.
            </p>
            {rows.length === 0 ? (
              <p className="py-4 text-center text-sm text-[#94A3B8]">
                Nenhuma resposta rápida cadastrada. Crie na aba Configuração.
              </p>
            ) : (
              rows.map((row) => (
                <div
                  key={row.id}
                  className="rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] p-3 flex items-start justify-between gap-3"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${
                          row.enabled
                            ? "bg-emerald-100 text-emerald-700"
                            : "bg-[#E2E8F0] text-[#64748B]"
                        }`}
                      >
                        {row.enabled ? "Ativa" : "Inativa"}
                      </span>
                      {row.onWhatsApp && (
                        <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-semibold text-blue-700 uppercase">
                          WhatsApp
                        </span>
                      )}
                    </div>
                    <p className="mt-1.5 font-semibold text-[#1E293B]">{row.shortCut}</p>
                    <p className="mt-0.5 line-clamp-2 text-xs text-[#64748B]">
                      {row.text || "Sem texto definido."}
                    </p>
                    <p className="mt-1 text-[11px] text-[#94A3B8]">
                      Filas: {queueNames(row.queueIds)}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleToggleEnabled(row)}
                    className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
                      row.enabled
                        ? "bg-amber-100 text-amber-800 hover:bg-amber-200"
                        : "bg-emerald-600 text-white hover:bg-emerald-700"
                    }`}
                  >
                    {row.enabled ? "Desativar" : "Ativar"}
                  </button>
                </div>
              ))
            )}
          </div>
        )}
      </SideOver>

      <ConfirmDialog
        open={!!deleteConfirmRow}
        onClose={() => setDeleteConfirmRow(null)}
        title="Excluir resposta rápida"
        message={
          deleteConfirmRow
            ? `Excluir a resposta rápida "${deleteConfirmRow.shortCut}"? Esta ação não pode ser desfeita.`
            : ""
        }
        confirmLabel="Excluir"
        cancelLabel="Cancelar"
        variant="danger"
        onConfirm={() => deleteConfirmRow && doDeleteOne(deleteConfirmRow)}
        onCancel={() => setDeleteConfirmRow(null)}
      />

      <ConfirmDialog
        open={bulkDeleteConfirm}
        onClose={() => setBulkDeleteConfirm(false)}
        title="Excluir respostas rápidas"
        message={`Excluir ${selectedIds.size} resposta(s) rápida(s) selecionada(s)? Esta ação não pode ser desfeita.`}
        confirmLabel="Excluir"
        cancelLabel="Cancelar"
        variant="danger"
        onConfirm={doBulkDelete}
        onCancel={() => setBulkDeleteConfirm(false)}
      />
    </div>
  );
}
