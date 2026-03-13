"use client";

import { useState, useEffect, useCallback } from "react";
import { SideOver } from "@/components/SideOver";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { Loader2, Plus, Pencil, Trash2, GripVertical, ListOrdered } from "lucide-react";

export type TicketStatus = {
  id: string;
  name: string;
  slug: string;
  color_hex: string;
  sort_order: number;
  is_closed: boolean;
};

type Queue = { id: string; name: string };

type TabId = "statuses" | "por-fila";
const TAB_LABELS: Record<TabId, string> = {
  statuses: "Padrões da empresa",
  "por-fila": "Por fila",
};

const MAX_QUEUE_EXCLUSIVE_STATUSES = 9;
const DEFAULT_STATUS_SLUGS = ["open", "in_queue", "in_progress", "closed"];
const DEFAULT_STATUS_PRESETS = [
  { name: "Novo", slug: "open", color_hex: "#22C55E", sort_order: 0, is_closed: false },
  { name: "Em atendimento", slug: "in_progress", color_hex: "#8B5CF6", sort_order: 1, is_closed: false },
  { name: "Encerrado", slug: "closed", color_hex: "#64748B", sort_order: 2, is_closed: true },
];

type StatusConfigSideOverProps = {
  open: boolean;
  onClose: () => void;
  companySlug: string;
  queues: Queue[];
  onSaved?: () => void;
};

export function StatusConfigSideOver({
  open,
  onClose,
  companySlug,
  queues = [],
  onSaved,
}: StatusConfigSideOverProps) {
  const [activeTab, setActiveTab] = useState<TabId>("por-fila");
  const [statuses, setStatuses] = useState<TicketStatus[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editColor, setEditColor] = useState("#64748B");
  const [editIsClosed, setEditIsClosed] = useState(false);

  const [newName, setNewName] = useState("");
  const [newColor, setNewColor] = useState("#64748B");
  const [newIsClosed, setNewIsClosed] = useState(false);
  const [creating, setCreating] = useState(false);

  const [deleteConfirm, setDeleteConfirm] = useState<TicketStatus | null>(null);

  const [selectedQueueId, setSelectedQueueId] = useState<string>("");
  const [queueStatuses, setQueueStatuses] = useState<TicketStatus[]>([]);
  const [queueStatusesLoading, setQueueStatusesLoading] = useState(false);
  const [queueStatusesSaving, setQueueStatusesSaving] = useState(false);
  const [reorderSaving, setReorderSaving] = useState(false);

  const [creatingQueueExclusive, setCreatingQueueExclusive] = useState(false);
  const [newQueueName, setNewQueueName] = useState("");
  const [newQueueColor, setNewQueueColor] = useState("#64748B");
  const [newQueueIsClosed, setNewQueueIsClosed] = useState(false);

  const apiHeaders = companySlug ? { "X-Company-Slug": companySlug } : undefined;

  const fetchStatuses = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const r = await fetch("/api/ticket-statuses", { credentials: "include", headers: apiHeaders });
      const data = await r.json();
      if (r.ok && Array.isArray(data)) {
        setStatuses(data);
      } else {
        setError(data?.error ?? "Falha ao carregar status");
      }
    } catch {
      setError("Erro de rede");
    } finally {
      setLoading(false);
    }
  }, [companySlug]);

  const restoreCompanyDefaults = async () => {
    setSaving(true);
    setError("");
    try {
      for (const preset of DEFAULT_STATUS_PRESETS) {
        const r = await fetch("/api/ticket-statuses", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json", ...apiHeaders },
          body: JSON.stringify(preset),
        });
        if (!r.ok && r.status !== 409) {
          const data = await r.json().catch(() => ({}));
          throw new Error(data?.error ?? "Falha ao restaurar padrões");
        }
      }
      await fetchStatuses();
      onSaved?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro de rede");
    } finally {
      setSaving(false);
    }
  };

  const fetchQueueStatuses = useCallback(async () => {
    if (!selectedQueueId) {
      setQueueStatuses([]);
      return;
    }
    setQueueStatusesLoading(true);
    try {
      const r = await fetch(`/api/queues/${encodeURIComponent(selectedQueueId)}/ticket-statuses`, {
        credentials: "include",
        headers: apiHeaders,
      });
      const data = await r.json();
      if (r.ok && Array.isArray(data)) {
        setQueueStatuses(data);
      } else {
        setQueueStatuses([]);
      }
    } catch {
      setQueueStatuses([]);
    } finally {
      setQueueStatusesLoading(false);
    }
  }, [selectedQueueId, companySlug]);

  useEffect(() => {
    if (open) {
      setActiveTab("por-fila");
      setError("");
      setEditingId(null);
      setNewName("");
      fetchStatuses();
    }
  }, [open, fetchStatuses]);

  useEffect(() => {
    if (open && activeTab === "por-fila") {
      if (!selectedQueueId && queues.length > 0) {
        setSelectedQueueId(queues[0].id);
      }
      fetchQueueStatuses();
    }
  }, [open, activeTab, selectedQueueId, fetchQueueStatuses, queues]);

  const createStatus = async () => {
    const name = newName.trim();
    if (!name) return;
    setSaving(true);
    setError("");
    try {
      const slug = name.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, "-");
      const r = await fetch("/api/ticket-statuses", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json", ...apiHeaders },
        body: JSON.stringify({
          name,
          slug,
          color_hex: newColor,
          sort_order: statuses.length,
          is_closed: newIsClosed,
        }),
      });
      const data = await r.json();
      if (r.ok) {
        setStatuses((prev) => [...prev, data].sort((a, b) => a.sort_order - b.sort_order));
        setNewName("");
        setNewColor("#64748B");
        setNewIsClosed(false);
        setCreating(false);
        onSaved?.();
      } else {
        setError(data?.error ?? "Falha ao criar status");
      }
    } catch {
      setError("Erro de rede");
    } finally {
      setSaving(false);
    }
  };

  const createQueueExclusiveStatus = async () => {
    const name = newQueueName.trim();
    if (!name || !selectedQueueId) return;
    setSaving(true);
    setError("");
    try {
      const slug = name.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, "-");
      const r = await fetch("/api/ticket-statuses", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json", ...apiHeaders },
        body: JSON.stringify({
          name,
          slug,
          color_hex: newQueueColor,
          sort_order: queueStatuses.length,
          is_closed: newQueueIsClosed,
          queue_id: selectedQueueId,
        }),
      });
      const data = await r.json();
      if (r.ok) {
        const newStatus: TicketStatus = {
          id: data.id,
          name: data.name,
          slug: data.slug,
          color_hex: data.color_hex ?? "#64748B",
          sort_order: queueStatuses.length,
          is_closed: !!data.is_closed,
        };
        const updatedList = [...queueStatuses, newStatus];
        setQueueStatuses(updatedList);
        setNewQueueName("");
        setNewQueueColor("#64748B");
        setNewQueueIsClosed(false);
        setCreatingQueueExclusive(false);
        const putRes = await fetch(`/api/queues/${encodeURIComponent(selectedQueueId)}/ticket-statuses`, {
          method: "PUT",
          credentials: "include",
          headers: { "Content-Type": "application/json", ...apiHeaders },
          body: JSON.stringify({ ticket_status_ids: updatedList.map((s) => s.id) }),
        });
        if (putRes.ok) onSaved?.();
      } else {
        setError(data?.error ?? "Falha ao criar status");
      }
    } catch {
      setError("Erro de rede");
    } finally {
      setSaving(false);
    }
  };

  const updateStatus = async (id: string) => {
    setSaving(true);
    setError("");
    try {
      const r = await fetch(`/api/ticket-statuses/${encodeURIComponent(id)}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json", ...apiHeaders },
        body: JSON.stringify({
          name: editName.trim(),
          color_hex: editColor,
          is_closed: editIsClosed,
        }),
      });
      const data = await r.json();
      if (r.ok) {
        setStatuses((prev) =>
          prev.map((s) => (s.id === id ? { ...s, name: data.name, color_hex: data.color_hex, is_closed: data.is_closed } : s))
        );
        setQueueStatuses((prev) =>
          prev.map((s) => (s.id === id ? { ...s, name: data.name, color_hex: data.color_hex, is_closed: data.is_closed } : s))
        );
        setEditingId(null);
        onSaved?.();
      } else {
        setError(data?.error ?? "Falha ao atualizar");
      }
    } catch {
      setError("Erro de rede");
    } finally {
      setSaving(false);
    }
  };

  const deleteStatus = async (s: TicketStatus) => {
    setSaving(true);
    setError("");
    try {
      const r = await fetch(`/api/ticket-statuses/${encodeURIComponent(s.id)}`, {
        method: "DELETE",
        credentials: "include",
        headers: apiHeaders,
      });
      if (r.ok) {
        setStatuses((prev) => prev.filter((x) => x.id !== s.id));
        setDeleteConfirm(null);
        onSaved?.();
      } else {
        const data = await r.json();
        setError(data?.error ?? "Falha ao excluir");
      }
    } catch {
      setError("Erro de rede");
    } finally {
      setSaving(false);
    }
  };

  const saveQueueStatuses = async () => {
    if (!selectedQueueId) return;
    setQueueStatusesSaving(true);
    setError("");
    try {
      const globalIdsSet = new Set(statuses.map((s) => s.id));
      const globalOrder = queueStatuses.filter((s) => globalIdsSet.has(s.id)).map((s) => s.id);
      if (globalOrder.length > 0) {
        const reorderRes = await fetch("/api/ticket-statuses/reorder", {
          method: "PUT",
          credentials: "include",
          headers: { "Content-Type": "application/json", ...apiHeaders },
          body: JSON.stringify({ order: globalOrder }),
        });
        if (!reorderRes.ok) {
          const data = await reorderRes.json().catch(() => ({}));
          setError(data?.error ?? "Falha ao reordenar padrões");
          setQueueStatusesSaving(false);
          return;
        }
      }
      const r = await fetch(`/api/queues/${encodeURIComponent(selectedQueueId)}/ticket-statuses`, {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json", ...apiHeaders },
        body: JSON.stringify({ ticket_status_ids: queueStatuses.map((s) => s.id) }),
      });
      if (r.ok) {
        onSaved?.();
      } else {
        const data = await r.json();
        setError(data?.error ?? "Falha ao salvar");
      }
    } catch {
      setError("Erro de rede");
    } finally {
      setQueueStatusesSaving(false);
    }
  };

  const moveQueueStatus = (index: number, direction: "up" | "down") => {
    const next = [...queueStatuses];
    const target = direction === "up" ? index - 1 : index + 1;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target]!, next[index]!];
    setQueueStatuses(next);
  };

  const moveCompanyStatus = async (index: number, direction: "up" | "down") => {
    const target = direction === "up" ? index - 1 : index + 1;
    if (target < 0 || target >= statuses.length) return;
    const next = [...statuses];
    [next[index], next[target]] = [next[target]!, next[index]!];
    const orderIds = next.map((s) => s.id);
    setReorderSaving(true);
    setError("");
    try {
      const r = await fetch("/api/ticket-statuses/reorder", {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json", ...apiHeaders },
        body: JSON.stringify({ order: orderIds }),
      });
      if (r.ok) {
        setStatuses(next);
        onSaved?.();
      } else {
        const data = await r.json();
        setError(data?.error ?? "Falha ao reordenar");
      }
    } catch {
      setError("Erro de rede");
    } finally {
      setReorderSaving(false);
    }
  };

  const addStatusToQueue = (status: TicketStatus) => {
    if (queueStatuses.some((s) => s.id === status.id)) return;
    setQueueStatuses((prev) => [...prev, status]);
  };

  const removeStatusFromQueue = (statusId: string) => {
    setQueueStatuses((prev) => prev.filter((s) => s.id !== statusId));
  };

  const tabs: { id: TabId; icon: React.ReactNode }[] = [
    { id: "por-fila", icon: <GripVertical className="h-4 w-4" /> },
  ];

  return (
    <>
      <SideOver open={open} onClose={onClose} title="Configurar status" width={680}>
        <div className="flex flex-col gap-4">
          {tabs.length > 1 && (
            <div className="flex gap-1 overflow-x-auto pb-2 -mx-1">
              {tabs.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setActiveTab(t.id)}
                  className={`flex items-center gap-1.5 shrink-0 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                    activeTab === t.id ? "bg-clicvend-orange/10 text-clicvend-orange" : "text-[#64748B] hover:bg-[#F1F5F9]"
                  }`}
                >
                  {t.icon}
                  {TAB_LABELS[t.id]}
                </button>
              ))}
            </div>
          )}

          {error && (
            <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>
          )}

          {loading && activeTab === "statuses" ? (
            <div className="flex flex-col items-center justify-center py-12">
              <Loader2 className="h-10 w-10 animate-spin text-clicvend-orange" />
              <span className="mt-3 text-sm text-[#64748B]">Carregando…</span>
            </div>
          ) : (
            <>
              {activeTab === "statuses" && (
                <div className="space-y-4">
                  <p className="text-sm text-[#64748B]">
                    Nesta versão, os status customizados devem ser configurados por fila.
                    Aqui ficam os padrões globais da empresa (base do sistema).
                  </p>
                  <div className="rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] p-3 flex items-center justify-between gap-2">
                    <span className="text-sm text-[#334155]">Restaurar/garantir padrões globais (Novo, Em atendimento, Encerrado).</span>
                    <button
                      type="button"
                      onClick={restoreCompanyDefaults}
                      disabled={saving}
                      className="inline-flex items-center gap-2 rounded-lg border border-[#E2E8F0] bg-white px-3 py-1.5 text-sm font-medium text-[#334155] hover:bg-[#F1F5F9] disabled:opacity-60"
                    >
                      {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                      Restaurar padrões
                    </button>
                  </div>

                  <div className="space-y-2">
                    {statuses.map((s, i) => (
                      <div
                        key={s.id}
                        className="flex items-center gap-2 rounded-lg border border-[#E2E8F0] bg-white p-3"
                      >
                        <div
                          className="h-4 w-8 shrink-0 rounded"
                          style={{ backgroundColor: s.color_hex }}
                        />
                        {editingId === s.id ? (
                          <>
                            <input
                              type="text"
                              value={editName}
                              onChange={(e) => setEditName(e.target.value)}
                              className="flex-1 rounded border border-[#E2E8F0] px-2 py-1 text-sm"
                            />
                            <input
                              type="color"
                              value={editColor}
                              onChange={(e) => setEditColor(e.target.value)}
                              className="h-6 w-8 cursor-pointer rounded border"
                            />
                            <label className="flex items-center gap-1 text-xs">
                              <input
                                type="checkbox"
                                checked={editIsClosed}
                                onChange={(e) => setEditIsClosed(e.target.checked)}
                              />
                              Fechado
                            </label>
                            <button
                              type="button"
                              onClick={() => updateStatus(s.id)}
                              disabled={saving}
                              className="rounded px-2 py-1 text-xs font-medium text-clicvend-orange hover:bg-clicvend-orange/10"
                            >
                              Salvar
                            </button>
                            <button
                              type="button"
                              onClick={() => setEditingId(null)}
                              className="rounded px-2 py-1 text-xs text-[#64748B] hover:bg-[#F1F5F9]"
                            >
                              Cancelar
                            </button>
                          </>
                        ) : (
                          <>
                            <span className="flex-1 font-medium text-[#1E293B]">{s.name}</span>
                            {s.is_closed && (
                              <span className="rounded bg-[#E2E8F0] px-1.5 py-0.5 text-[10px] text-[#64748B]">Fechado</span>
                            )}
                            <button
                              type="button"
                              onClick={() => moveCompanyStatus(i, "up")}
                              disabled={i === 0 || reorderSaving}
                              className="rounded p-1 text-[#64748B] hover:bg-[#F1F5F9] disabled:opacity-40"
                              title="Subir"
                            >
                              ↑
                            </button>
                            <button
                              type="button"
                              onClick={() => moveCompanyStatus(i, "down")}
                              disabled={i === statuses.length - 1 || reorderSaving}
                              className="rounded p-1 text-[#64748B] hover:bg-[#F1F5F9] disabled:opacity-40"
                              title="Descer"
                            >
                              ↓
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setEditingId(s.id);
                                setEditName(s.name);
                                setEditColor(s.color_hex);
                                setEditIsClosed(s.is_closed);
                              }}
                              className="rounded p-1.5 text-[#64748B] hover:bg-[#F1F5F9] hover:text-[#0F172A]"
                              title="Editar"
                            >
                              <Pencil className="h-4 w-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() => setDeleteConfirm(s)}
                              className="rounded p-1.5 text-[#64748B] hover:bg-red-50 hover:text-red-600"
                              title="Excluir"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {activeTab === "por-fila" && (
                <div className="space-y-4">
                  <p className="text-sm text-[#64748B]">
                    Defina quais status cada fila usa e em que ordem. Se vazio, a fila usa todos os status da empresa.
                  </p>

                  <div>
                    <label className="mb-1 block text-sm font-medium text-[#334155]">Fila</label>
                    <select
                      value={selectedQueueId}
                      onChange={(e) => setSelectedQueueId(e.target.value)}
                      className="w-full rounded-lg border border-[#E2E8F0] px-3 py-2 text-sm text-[#1E293B]"
                    >
                      <option value="">Selecione uma fila</option>
                      {queues.map((q) => (
                        <option key={q.id} value={q.id}>{q.name}</option>
                      ))}
                    </select>
                    {queues.length === 0 && (
                      <p className="mt-2 text-sm text-[#64748B]">Nenhuma fila cadastrada. Crie filas em Filas para atribuir status por fila.</p>
                    )}
                  </div>

                  {selectedQueueId && (
                    <>
                      {queueStatusesLoading ? (
                        <div className="flex items-center justify-center py-8">
                          <Loader2 className="h-8 w-8 animate-spin text-clicvend-orange" />
                        </div>
                      ) : (
                        <div className="space-y-3">
                          <div className="flex items-center justify-between">
                            <span className="text-sm font-medium text-[#334155]">Status desta fila (ordem)</span>
                            <button
                              type="button"
                              onClick={saveQueueStatuses}
                              disabled={queueStatusesSaving}
                              className="inline-flex items-center gap-2 rounded-lg bg-clicvend-orange px-3 py-1.5 text-sm font-medium text-white disabled:opacity-60"
                            >
                              {queueStatusesSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                              Salvar ordem
                            </button>
                          </div>

                          <div className="space-y-1 max-h-48 overflow-y-auto">
                            {queueStatuses.length === 0 && !queueStatusesLoading && (
                              <p className="rounded-lg border border-dashed border-[#E2E8F0] bg-[#F8FAFC] px-4 py-6 text-center text-sm text-[#64748B]">
                                Nenhum status nesta fila. Use os botões abaixo para adicionar.
                              </p>
                            )}
                            {queueStatuses.map((s, i) => (
                              <div
                                key={s.id}
                                className="flex items-center gap-2 rounded-lg border border-[#E2E8F0] bg-white px-3 py-2"
                              >
                                {editingId === s.id ? (
                                  <>
                                    <input
                                      type="text"
                                      value={editName}
                                      onChange={(e) => setEditName(e.target.value)}
                                      className="flex-1 rounded border border-[#E2E8F0] px-2 py-1 text-sm"
                                    />
                                    <input
                                      type="color"
                                      value={editColor}
                                      onChange={(e) => setEditColor(e.target.value)}
                                      className="h-6 w-8 cursor-pointer rounded border"
                                    />
                                    <label className="flex items-center gap-1 text-xs whitespace-nowrap">
                                      <input
                                        type="checkbox"
                                        checked={editIsClosed}
                                        onChange={(e) => setEditIsClosed(e.target.checked)}
                                      />
                                      Fechado
                                    </label>
                                    <button
                                      type="button"
                                      onClick={() => updateStatus(s.id)}
                                      disabled={saving}
                                      className="rounded px-2 py-1 text-xs font-medium text-clicvend-orange hover:bg-clicvend-orange/10"
                                    >
                                      Salvar
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => setEditingId(null)}
                                      className="rounded px-2 py-1 text-xs text-[#64748B] hover:bg-[#F1F5F9]"
                                    >
                                      Cancelar
                                    </button>
                                  </>
                                ) : (
                                  <>
                                    <div
                                      className="h-3 w-6 shrink-0 rounded"
                                      style={{ backgroundColor: s.color_hex }}
                                    />
                                    <span className="flex-1 text-sm font-medium">{s.name}</span>
                                    {s.is_closed && (
                                      <span className="rounded bg-[#E2E8F0] px-1.5 py-0.5 text-[10px] text-[#64748B]">Fechado</span>
                                    )}
                                    <button
                                      type="button"
                                      onClick={() => moveQueueStatus(i, "up")}
                                      disabled={i === 0}
                                      className="rounded p-1 text-[#64748B] hover:bg-[#F1F5F9] disabled:opacity-40"
                                      title="Subir"
                                    >
                                      ↑
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => moveQueueStatus(i, "down")}
                                      disabled={i === queueStatuses.length - 1}
                                      className="rounded p-1 text-[#64748B] hover:bg-[#F1F5F9] disabled:opacity-40"
                                      title="Descer"
                                    >
                                      ↓
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setEditingId(s.id);
                                        setEditName(s.name);
                                        setEditColor(s.color_hex);
                                        setEditIsClosed(s.is_closed);
                                      }}
                                      className="rounded p-1 text-[#64748B] hover:bg-[#F1F5F9] hover:text-[#0F172A]"
                                      title="Editar"
                                    >
                                      <Pencil className="h-4 w-4" />
                                    </button>
                                    {!DEFAULT_STATUS_SLUGS.includes(s.slug) && (
                                      <button
                                        type="button"
                                        onClick={() => removeStatusFromQueue(s.id)}
                                        className="rounded p-1 text-red-600 hover:bg-red-50"
                                        title="Remover da fila"
                                      >
                                        <Trash2 className="h-4 w-4" />
                                      </button>
                                    )}
                                  </>
                                )}
                              </div>
                            ))}
                          </div>

                          <div className="border-t border-[#E2E8F0] pt-3">
                            <span className="text-sm font-medium text-[#334155]">Adicionar status da empresa</span>
                            <div className="mt-2 flex flex-wrap gap-2">
                              {statuses
                                .filter((s) => !queueStatuses.some((qs) => qs.id === s.id))
                                .map((s) => (
                                  <button
                                    key={s.id}
                                    type="button"
                                    onClick={() => addStatusToQueue(s)}
                                    className="inline-flex items-center gap-1.5 rounded-full border border-[#E2E8F0] bg-white px-3 py-1.5 text-sm text-[#64748B] hover:border-clicvend-orange hover:text-clicvend-orange"
                                  >
                                    <span
                                      className="h-2 w-2 rounded-full"
                                      style={{ backgroundColor: s.color_hex }}
                                    />
                                    {s.name}
                                  </button>
                                ))}
                              {statuses.filter((s) => !queueStatuses.some((qs) => qs.id === s.id)).length === 0 && (
                                <span className="text-sm text-[#94A3B8]">Todos os status da empresa já estão na fila</span>
                              )}
                            </div>
                          </div>

                          <div className="border-t border-[#E2E8F0] pt-3">
                            <span className="text-sm font-medium text-[#334155]">Status exclusivo desta fila</span>
                            <p className="mt-1 text-xs text-[#64748B]">
                              Crie um status que só existe nesta fila. Máximo {MAX_QUEUE_EXCLUSIVE_STATUSES} exclusivos por fila
                              {(() => {
                                const exclusiveCount = queueStatuses.filter((qs) => !statuses.some((s) => s.id === qs.id)).length;
                                return exclusiveCount > 0 ? ` (${exclusiveCount}/${MAX_QUEUE_EXCLUSIVE_STATUSES})` : "";
                              })()}.
                            </p>
                            {!creatingQueueExclusive ? (
                              <button
                                type="button"
                                onClick={() => setCreatingQueueExclusive(true)}
                                disabled={queueStatuses.filter((qs) => !statuses.some((s) => s.id === qs.id)).length >= MAX_QUEUE_EXCLUSIVE_STATUSES}
                                className="mt-2 inline-flex items-center gap-2 rounded-lg border border-dashed border-[#CBD5E1] px-3 py-2 text-sm font-medium text-[#64748B] hover:border-clicvend-orange hover:text-clicvend-orange disabled:opacity-50 disabled:pointer-events-none"
                              >
                                <Plus className="h-4 w-4" />
                                Novo status exclusivo
                              </button>
                            ) : (
                              <div className="mt-2 rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] p-4 space-y-3">
                                <input
                                  type="text"
                                  value={newQueueName}
                                  onChange={(e) => setNewQueueName(e.target.value)}
                                  placeholder="Nome (ex: Em análise técnica)"
                                  className="w-full rounded-lg border border-[#E2E8F0] px-3 py-2 text-sm text-[#1E293B]"
                                />
                                <div className="flex items-center gap-3">
                                  <label className="text-sm text-[#64748B]">Cor:</label>
                                  <input
                                    type="color"
                                    value={newQueueColor}
                                    onChange={(e) => setNewQueueColor(e.target.value)}
                                    className="h-8 w-8 cursor-pointer rounded border border-[#E2E8F0]"
                                  />
                                  <label className="flex items-center gap-2 text-sm text-[#64748B]">
                                    <input
                                      type="checkbox"
                                      checked={newQueueIsClosed}
                                      onChange={(e) => setNewQueueIsClosed(e.target.checked)}
                                    />
                                    Status de fechamento
                                  </label>
                                </div>
                                <div className="flex gap-2">
                                  <button
                                    type="button"
                                    onClick={() => { setCreatingQueueExclusive(false); setNewQueueName(""); setNewQueueColor("#64748B"); setNewQueueIsClosed(false); }}
                                    className="rounded-lg px-3 py-1.5 text-sm text-[#64748B] hover:bg-[#E2E8F0]"
                                  >
                                    Cancelar
                                  </button>
                                  <button
                                    type="button"
                                    onClick={createQueueExclusiveStatus}
                                    disabled={saving || !newQueueName.trim()}
                                    className="inline-flex items-center gap-2 rounded-lg bg-clicvend-orange px-3 py-1.5 text-sm font-medium text-white disabled:opacity-60"
                                  >
                                    {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                                    Criar
                                  </button>
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </SideOver>

      <ConfirmDialog
        open={!!deleteConfirm}
        onClose={() => setDeleteConfirm(null)}
        onConfirm={deleteConfirm ? () => deleteStatus(deleteConfirm) : () => {}}
        title="Excluir status"
        message={deleteConfirm ? `Excluir o status "${deleteConfirm.name}"? Esta ação não pode ser desfeita.` : ""}
        confirmLabel="Excluir"
        variant="danger"
      />
    </>
  );
}
