"use client";

import { useState, useEffect, useCallback } from "react";
import { SideOver } from "@/components/SideOver";
import { Loader2, Settings, Users, Clock, Calendar } from "lucide-react";

export type Queue = { id: string; name: string; slug: string; created_at?: string; business_hours?: BusinessHoursItem[]; special_dates?: SpecialDateItem[] };
type BusinessHoursItem = { day: number; open: string; close: string };
export type SpecialDateItem = { date: string; closed?: boolean } | { date: string; open: string; close: string };

const DAY_NAMES = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];

type TabId = "configuracoes" | "atribuicoes" | "programacoes";
const TAB_LABELS: Record<TabId, string> = {
  configuracoes: "Configurações",
  atribuicoes: "Atribuições",
  programacoes: "Programações",
};

type QueueConfigSideOverProps = {
  open: boolean;
  onClose: () => void;
  queue: Queue | null;
  companySlug: string;
  onSaved: (updated: Partial<Queue>) => void;
};

export function QueueConfigSideOver({
  open,
  onClose,
  queue,
  companySlug,
  onSaved,
}: QueueConfigSideOverProps) {
  const [activeTab, setActiveTab] = useState<TabId>("configuracoes");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");

  const [businessHours, setBusinessHours] = useState<BusinessHoursItem[]>([]);
  const [specialDates, setSpecialDates] = useState<SpecialDateItem[]>([]);
  const [queueLoading, setQueueLoading] = useState(false);

  const [companyUsers, setCompanyUsers] = useState<{ user_id: string; full_name?: string; email?: string }[]>([]);
  const [assignedUserIds, setAssignedUserIds] = useState<Set<string>>(new Set());
  const [assignmentsLoading, setAssignmentsLoading] = useState(false);
  const [assignmentsSaving, setAssignmentsSaving] = useState(false);
  const [assignmentsError, setAssignmentsError] = useState("");

  const apiHeaders = companySlug ? { "X-Company-Slug": companySlug } : undefined;

  const fetchQueue = useCallback(async () => {
    if (!queue?.id) return;
    setQueueLoading(true);
    try {
      const r = await fetch(`/api/queues/${encodeURIComponent(queue.id)}`, {
        credentials: "include",
        headers: apiHeaders,
      });
      const data = await r.json();
      if (r.ok) {
        setName(data.name ?? "");
        setSlug(data.slug ?? "");
        setBusinessHours(Array.isArray(data.business_hours) ? data.business_hours : []);
        setSpecialDates(Array.isArray(data.special_dates) ? data.special_dates : []);
      } else {
        setError(data?.error ?? "Não foi possível carregar a fila.");
      }
    } catch {
      setError("Erro de rede.");
    } finally {
      setQueueLoading(false);
    }
  }, [queue?.id, companySlug]);

  useEffect(() => {
    if (open && queue?.id) {
      setError("");
      setActiveTab("configuracoes");
      fetchQueue();
    }
  }, [open, queue?.id, fetchQueue]);

  const fetchAssignments = useCallback(async () => {
    if (!queue?.id || !companySlug) return;
    setAssignmentsLoading(true);
    setAssignmentsError("");
    const headers = { "X-Company-Slug": companySlug };
    try {
      const r = await fetch(`/api/queues/${encodeURIComponent(queue.id)}/assignments`, { credentials: "include", headers });
      const data = await r.json().catch(() => ({}));
      if (r.ok) {
        if (Array.isArray(data?.all_users)) {
          setCompanyUsers(data.all_users.map((u: { user_id: string; full_name?: string; email?: string }) => ({ user_id: u.user_id, full_name: u.full_name, email: u.email })));
        } else {
          setCompanyUsers([]);
        }
        setAssignedUserIds(new Set(Array.isArray(data?.user_ids) ? data.user_ids : []));
      } else {
        setCompanyUsers([]);
        setAssignedUserIds(new Set());
        setAssignmentsError(data?.error ?? "Falha ao carregar atribuições");
      }
    } catch {
      setCompanyUsers([]);
      setAssignedUserIds(new Set());
      setAssignmentsError("Erro de rede. Tente novamente.");
    } finally {
      setAssignmentsLoading(false);
    }
  }, [queue?.id, companySlug]);

  useEffect(() => {
    if (open && queue?.id && activeTab === "atribuicoes") fetchAssignments();
  }, [open, queue?.id, activeTab, fetchAssignments]);

  const toggleAssignment = (userId: string) => {
    setAssignedUserIds((prev) => {
      const next = new Set(prev);
      if (next.has(userId)) next.delete(userId);
      else next.add(userId);
      return next;
    });
  };

  const saveAssignments = async () => {
    if (!queue?.id) return;
    setError("");
    setAssignmentsSaving(true);
    try {
      const r = await fetch(`/api/queues/${encodeURIComponent(queue.id)}/assignments`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", ...apiHeaders },
        body: JSON.stringify({ user_ids: Array.from(assignedUserIds) }),
        credentials: "include",
      });
      if (!r.ok) {
        const data = await r.json().catch(() => ({}));
        setError(data?.error ?? "Falha ao salvar atribuições");
      }
    } catch {
      setError("Erro de rede.");
    } finally {
      setAssignmentsSaving(false);
    }
  };

  const saveConfig = async () => {
    if (!queue?.id) return;
    setError("");
    setSaving(true);
    try {
      const r = await fetch(`/api/queues/${encodeURIComponent(queue.id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...apiHeaders },
        body: JSON.stringify({ name: name.trim(), slug: slug.trim().toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "") }),
        credentials: "include",
      });
      const data = await r.json();
      if (r.ok) {
        onSaved({ name: data.name, slug: data.slug });
      } else {
        setError(data?.error ?? "Falha ao salvar");
      }
    } catch {
      setError("Erro de rede.");
    }
    setSaving(false);
  };

  const saveProgramacoes = async () => {
    if (!queue?.id) return;
    setError("");
    setSaving(true);
    try {
      const r = await fetch(`/api/queues/${encodeURIComponent(queue.id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...apiHeaders },
        body: JSON.stringify({ business_hours: businessHours, special_dates: specialDates }),
        credentials: "include",
      });
      if (r.ok) {
        onSaved({ business_hours: businessHours, special_dates: specialDates });
      } else {
        const data = await r.json();
        setError(data?.error ?? "Falha ao salvar horários");
      }
    } catch {
      setError("Erro de rede.");
    }
    setSaving(false);
  };

  const addBusinessHour = () => {
    setBusinessHours((prev) => [...prev, { day: 1, open: "09:00", close: "18:00" }]);
  };

  const updateBusinessHour = (index: number, field: keyof BusinessHoursItem, value: number | string) => {
    setBusinessHours((prev) => {
      const next = [...prev];
      next[index] = { ...next[index]!, [field]: value };
      return next;
    });
  };

  const removeBusinessHour = (index: number) => {
    setBusinessHours((prev) => prev.filter((_, i) => i !== index));
  };

  const addSpecialDate = (date: string, closed: boolean, openTime = "09:00", closeTime = "18:00") => {
    if (!date) return;
    const exists = specialDates.some((s) => s.date === date);
    if (exists) return;
    if (closed) {
      setSpecialDates((prev) => [...prev, { date, closed: true }].sort((a, b) => a.date.localeCompare(b.date)));
    } else {
      setSpecialDates((prev) => [...prev, { date, open: openTime, close: closeTime }].sort((a, b) => a.date.localeCompare(b.date)));
    }
  };

  const updateSpecialDate = (index: number, upd: Partial<SpecialDateItem> & { open?: string; close?: string }) => {
    setSpecialDates((prev) => {
      const next = [...prev];
      const cur = next[index]!;
      if ("closed" in upd && upd.closed) {
        next[index] = { date: cur.date, closed: true };
      } else if (upd.open != null && upd.close != null) {
        next[index] = { date: cur.date, open: upd.open, close: upd.close };
      } else if (upd.open != null && "open" in cur) {
        next[index] = { date: cur.date, open: upd.open, close: (cur as { close: string }).close };
      } else if (upd.close != null && "close" in cur) {
        next[index] = { date: cur.date, open: (cur as { open: string }).open, close: upd.close };
      } else {
        next[index] = { ...cur, ...upd } as SpecialDateItem;
      }
      return next.sort((a, b) => a.date.localeCompare(b.date));
    });
  };

  const removeSpecialDate = (index: number) => {
    setSpecialDates((prev) => prev.filter((_, i) => i !== index));
  };

  const [newDateValue, setNewDateValue] = useState("");
  const [newDateClosed, setNewDateClosed] = useState(false);
  const [newDateOpen, setNewDateOpen] = useState("09:00");
  const [newDateClose, setNewDateClose] = useState("18:00");

  const tabs: { id: TabId; icon: React.ReactNode }[] = [
    { id: "configuracoes", icon: <Settings className="h-4 w-4" /> },
    { id: "atribuicoes", icon: <Users className="h-4 w-4" /> },
    { id: "programacoes", icon: <Clock className="h-4 w-4" /> },
  ];

  return (
    <SideOver
      open={open}
      onClose={onClose}
      title={queue ? `Caixa: ${queue.name}` : "Configurar caixa"}
      width={560}
    >
      <div className="flex flex-col gap-4">
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

        {error && (
          <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>
        )}

        {queueLoading ? (
          <div className="flex flex-col items-center justify-center py-12">
            <Loader2 className="h-10 w-10 animate-spin text-clicvend-orange" />
            <span className="mt-3 text-sm text-[#64748B]">Carregando…</span>
          </div>
        ) : (
          <>
            {/* Aba Configurações */}
            {activeTab === "configuracoes" && (
              <div className="space-y-4">
                <div>
                  <label className="mb-1 block text-sm font-medium text-[#334155]">Nome da fila</label>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="w-full rounded-lg border border-[#E2E8F0] px-3 py-2 text-[#1E293B] focus:border-clicvend-orange focus:outline-none focus:ring-1 focus:ring-clicvend-orange"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-[#334155]">Slug</label>
                  <input
                    type="text"
                    value={slug}
                    onChange={(e) => setSlug(e.target.value)}
                    placeholder="ex: comercial"
                    className="w-full rounded-lg border border-[#E2E8F0] px-3 py-2 font-mono text-sm text-[#1E293B] focus:border-clicvend-orange focus:outline-none focus:ring-1 focus:ring-clicvend-orange"
                  />
                  <p className="mt-1 text-xs text-[#64748B]">Somente letras minúsculas, números e hífens.</p>
                </div>
                <div className="flex justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={onClose}
                    className="rounded-lg border border-[#E2E8F0] px-4 py-2 text-sm font-medium text-[#64748B] hover:bg-[#F8FAFC]"
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    onClick={saveConfig}
                    disabled={saving || !name.trim()}
                    className="inline-flex items-center gap-2 rounded-lg bg-clicvend-orange px-4 py-2 text-sm font-medium text-white hover:bg-clicvend-orange-dark disabled:opacity-60"
                  >
                    {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                    Salvar
                  </button>
                </div>
              </div>
            )}

            {/* Aba Atribuições */}
            {activeTab === "atribuicoes" && (
              <div className="space-y-4">
                <p className="text-sm text-[#64748B]">
                  Atendentes atribuídos a esta caixa poderão ver e atender as conversas (incluindo grupos, se for a caixa Grupos).
                </p>
                {assignmentsError && (
                  <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                    {assignmentsError}
                  </div>
                )}
                {assignmentsLoading ? (
                  <div className="flex items-center justify-center gap-2 py-8 text-[#64748B]">
                    <Loader2 className="h-5 w-5 animate-spin" />
                    Carregando…
                  </div>
                ) : companyUsers.length === 0 && !assignmentsError ? (
                  <div className="rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] p-6 text-center">
                    <Users className="mx-auto h-10 w-10 text-[#94A3B8]" />
                    <p className="mt-2 text-sm text-[#64748B]">Nenhum usuário cadastrado na empresa.</p>
                    <p className="mt-1 text-xs text-[#94A3B8]">Cadastre atendentes em Cargos e usuários.</p>
                  </div>
                ) : (
                  <>
                    <ul className="space-y-2 rounded-lg border border-[#E2E8F0] bg-white divide-y divide-[#E2E8F0]">
                      {companyUsers.map((u) => (
                        <li key={u.user_id} className="flex items-center gap-3 px-3 py-2.5">
                          <input
                            type="checkbox"
                            id={`assign-${u.user_id}`}
                            checked={assignedUserIds.has(u.user_id)}
                            onChange={() => toggleAssignment(u.user_id)}
                            className="h-4 w-4 rounded border-[#E2E8F0] text-clicvend-orange focus:ring-clicvend-orange"
                          />
                          <label htmlFor={`assign-${u.user_id}`} className="flex-1 cursor-pointer text-sm">
                            <span className="font-medium text-[#1E293B]">{u.full_name || u.email || u.user_id}</span>
                            {u.email && u.full_name && <span className="ml-1 text-[#64748B]">({u.email})</span>}
                          </label>
                        </li>
                      ))}
                    </ul>
                    {error && <p className="text-sm text-red-600">{error}</p>}
                    <div className="flex justify-end">
                      <button
                        type="button"
                        onClick={saveAssignments}
                        disabled={assignmentsSaving}
                        className="inline-flex items-center gap-2 rounded-lg bg-clicvend-orange px-4 py-2 text-sm font-medium text-white hover:bg-clicvend-orange-dark disabled:opacity-60"
                      >
                        {assignmentsSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                        Salvar atribuições
                      </button>
                    </div>
                  </>
                )}
              </div>
            )}

            {/* Aba Programações (horários + datas específicas) */}
            {activeTab === "programacoes" && (
              <div className="space-y-6">
                <p className="text-sm text-[#64748B]">
                  Horários por dia da semana e datas específicas (feriados, exceções). Deixe horários semanais vazios para 24h.
                </p>

                <div>
                  <h3 className="text-sm font-semibold text-[#334155] flex items-center gap-2 mb-2">
                    <Clock className="h-4 w-4" />
                    Por dia da semana
                  </h3>
                {businessHours.length === 0 ? (
                  <div className="rounded-lg border border-dashed border-[#E2E8F0] bg-[#F8FAFC] p-6 text-center">
                    <Clock className="mx-auto h-10 w-10 text-[#94A3B8]" />
                    <p className="mt-2 text-sm text-[#64748B]">Nenhum horário definido (24h)</p>
                    <button
                      type="button"
                      onClick={addBusinessHour}
                      className="mt-3 inline-flex items-center gap-2 rounded-lg bg-clicvend-orange px-3 py-2 text-sm font-medium text-white hover:bg-clicvend-orange-dark"
                    >
                      Adicionar horário
                    </button>
                  </div>
                ) : (
                  <>
                    <ul className="space-y-3">
                      {businessHours.map((item, index) => (
                        <li
                          key={index}
                          className="flex flex-wrap items-center gap-2 rounded-lg border border-[#E2E8F0] bg-white p-3"
                        >
                          <select
                            value={item.day}
                            onChange={(e) => updateBusinessHour(index, "day", parseInt(e.target.value, 10))}
                            className="rounded-lg border border-[#E2E8F0] px-2 py-1.5 text-sm text-[#1E293B] focus:border-clicvend-orange focus:outline-none focus:ring-1 focus:ring-clicvend-orange"
                          >
                            {DAY_NAMES.map((label, d) => (
                              <option key={d} value={d}>
                                {label}
                              </option>
                            ))}
                          </select>
                          <input
                            type="time"
                            value={item.open}
                            onChange={(e) => updateBusinessHour(index, "open", e.target.value)}
                            className="rounded-lg border border-[#E2E8F0] px-2 py-1.5 text-sm focus:border-clicvend-orange focus:outline-none focus:ring-1 focus:ring-clicvend-orange"
                          />
                          <span className="text-[#64748B]">até</span>
                          <input
                            type="time"
                            value={item.close}
                            onChange={(e) => updateBusinessHour(index, "close", e.target.value)}
                            className="rounded-lg border border-[#E2E8F0] px-2 py-1.5 text-sm focus:border-clicvend-orange focus:outline-none focus:ring-1 focus:ring-clicvend-orange"
                          />
                          <button
                            type="button"
                            onClick={() => removeBusinessHour(index)}
                            className="ml-auto rounded p-1.5 text-[#64748B] hover:bg-red-50 hover:text-red-600"
                            title="Remover"
                          >
                            ×
                          </button>
                        </li>
                      ))}
                    </ul>
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={addBusinessHour}
                        disabled={businessHours.length >= 7}
                        className="inline-flex items-center gap-2 rounded-lg border border-dashed border-[#E2E8F0] px-3 py-2 text-sm font-medium text-[#64748B] hover:border-clicvend-orange hover:text-clicvend-orange disabled:opacity-50"
                      >
                        + Adicionar horário
                      </button>
                      <button
                        type="button"
                        onClick={saveProgramacoes}
                        disabled={saving}
                        className="inline-flex items-center gap-2 rounded-lg bg-clicvend-orange px-4 py-2 text-sm font-medium text-white hover:bg-clicvend-orange-dark disabled:opacity-60"
                      >
                        {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                        Salvar horários
                      </button>
                    </div>
                  </>
                )}
                </div>

                <div>
                  <h3 className="text-sm font-semibold text-[#334155] flex items-center gap-2 mb-2">
                    <Calendar className="h-4 w-4" />
                    Datas específicas
                  </h3>
                  <p className="text-xs text-[#64748B] mb-3">
                    Feriados, folgas ou horários diferentes em um dia (ex.: 25/12 fechado, 01/01 10h–14h).
                  </p>
                  <div className="flex flex-wrap items-end gap-2 rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] p-3 mb-3">
                    <div className="flex-1 min-w-[140px]">
                      <label className="block text-xs font-medium text-[#64748B] mb-1">Data</label>
                      <input
                        type="date"
                        value={newDateValue}
                        onChange={(e) => setNewDateValue(e.target.value)}
                        className="w-full rounded-lg border border-[#E2E8F0] px-2 py-1.5 text-sm text-[#1E293B] focus:border-clicvend-orange focus:outline-none focus:ring-1 focus:ring-clicvend-orange"
                      />
                    </div>
                    <label className="flex items-center gap-2 text-sm text-[#334155]">
                      <input
                        type="checkbox"
                        checked={newDateClosed}
                        onChange={(e) => setNewDateClosed(e.target.checked)}
                        className="rounded border-[#E2E8F0] text-clicvend-orange focus:ring-clicvend-orange"
                      />
                      Fechado
                    </label>
                    {!newDateClosed && (
                      <>
                        <input
                          type="time"
                          value={newDateOpen}
                          onChange={(e) => setNewDateOpen(e.target.value)}
                          className="rounded-lg border border-[#E2E8F0] px-2 py-1.5 text-sm w-24 focus:border-clicvend-orange focus:outline-none focus:ring-1 focus:ring-clicvend-orange"
                        />
                        <span className="text-[#64748B] text-sm">até</span>
                        <input
                          type="time"
                          value={newDateClose}
                          onChange={(e) => setNewDateClose(e.target.value)}
                          className="rounded-lg border border-[#E2E8F0] px-2 py-1.5 text-sm w-24 focus:border-clicvend-orange focus:outline-none focus:ring-1 focus:ring-clicvend-orange"
                        />
                      </>
                    )}
                    <button
                      type="button"
                      onClick={() => {
                        if (newDateValue) {
                          addSpecialDate(newDateValue, newDateClosed, newDateOpen, newDateClose);
                          setNewDateValue("");
                        }
                      }}
                      disabled={!newDateValue}
                      className="rounded-lg bg-clicvend-orange px-3 py-1.5 text-sm font-medium text-white hover:bg-clicvend-orange-dark disabled:opacity-50"
                    >
                      Adicionar
                    </button>
                  </div>
                  {specialDates.length > 0 ? (
                    <ul className="space-y-2">
                      {specialDates.map((item, index) => (
                        <li
                          key={`${item.date}-${index}`}
                          className="flex flex-wrap items-center gap-2 rounded-lg border border-[#E2E8F0] bg-white p-2 text-sm"
                        >
                          <span className="font-medium text-[#1E293B]">{item.date}</span>
                          {"closed" in item && item.closed ? (
                            <span className="text-red-600">Fechado</span>
                          ) : (
                            <>
                              <input
                                type="time"
                                value={"open" in item ? item.open : "09:00"}
                                onChange={(e) => updateSpecialDate(index, { open: e.target.value, close: "close" in item ? (item as { close: string }).close : "18:00" })}
                                className="rounded border border-[#E2E8F0] px-1.5 py-1 text-xs w-20 focus:border-clicvend-orange focus:outline-none"
                              />
                              <span className="text-[#64748B]">até</span>
                              <input
                                type="time"
                                value={"close" in item ? (item as { close: string }).close : "18:00"}
                                onChange={(e) => updateSpecialDate(index, { open: "open" in item ? (item as { open: string }).open : "09:00", close: e.target.value })}
                                className="rounded border border-[#E2E8F0] px-1.5 py-1 text-xs w-20 focus:border-clicvend-orange focus:outline-none"
                              />
                            </>
                          )}
                          <button
                            type="button"
                            onClick={() => removeSpecialDate(index)}
                            className="ml-auto rounded p-1 text-[#64748B] hover:bg-red-50 hover:text-red-600"
                            title="Remover"
                          >
                            ×
                          </button>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-xs text-[#94A3B8]">Nenhuma data específica. Use o calendário acima para adicionar.</p>
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-[#E2E8F0]">
                  <button
                    type="button"
                    onClick={saveProgramacoes}
                    disabled={saving}
                    className="inline-flex items-center gap-2 rounded-lg bg-clicvend-orange px-4 py-2 text-sm font-medium text-white hover:bg-clicvend-orange-dark disabled:opacity-60"
                  >
                    {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                    Salvar programações
                  </button>
                </div>
              </div>
            )}
          </>
        )}

      </div>
    </SideOver>
  );
}
