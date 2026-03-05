"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Loader2, UserPlus, ArrowRightLeft, GripVertical } from "lucide-react";

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
};

type Queue = { id: string; name: string };

type Agent = { user_id: string; full_name: string; email?: string };

const STATUS_COLUMNS: { key: string; title: string }[] = [
  { key: "open", title: "Abertos" },
  { key: "in_progress", title: "Em atendimento" },
  { key: "waiting", title: "Aguardando" },
  { key: "closed", title: "Fechados" },
];

function normalizeStatus(raw: string): string {
  const s = (raw || "").toLowerCase();
  if (s === "closed" || s === "fechado" || s === "resolvido") return "closed";
  if (s === "waiting" || s === "pendente" || s === "pending") return "waiting";
  if (s === "in_progress" || s === "atendimento" || s === "ongoing") return "in_progress";
  return "open";
}

export default function TicketsPage() {
  const pathname = usePathname();
  const segments = pathname?.split("/").filter(Boolean) ?? [];
  const slug = segments[0];
  const apiHeaders = slug ? { "X-Company-Slug": slug } : undefined;

  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [queues, setQueues] = useState<Queue[]>([]);
  const [queueId, setQueueId] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [permissions, setPermissions] = useState<string[]>([]);
  const [agents, setAgents] = useState<Agent[]>([]);

  const canManageTickets = permissions.includes("inbox.manage_tickets") || permissions.includes("inbox.see_all");

  useEffect(() => {
    if (!slug) return;
    fetch("/api/auth/permissions", { credentials: "include", headers: apiHeaders })
      .then((r) => r.json())
      .then((d) => setPermissions(Array.isArray(d?.permissions) ? d.permissions : []))
      .catch(() => setPermissions([]));
  }, [slug]);

  useEffect(() => {
    if (!slug) return;
    fetch("/api/queues?for_inbox=1", { credentials: "include", headers: apiHeaders })
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data)) {
          setQueues(
            data.map((q: { id: string; name: string }) => ({ id: q.id, name: q.name ?? "(sem nome)" }))
          );
        } else {
          setQueues([]);
        }
      })
      .catch(() => setQueues([]));
  }, [slug]);

  const fetchTickets = useCallback(() => {
    if (!slug) return;
    setLoading(true);
    setError(null);
    const params = new URLSearchParams();
    params.set("only_assigned_to_me", "1");
    if (queueId) params.set("queue_id", queueId);
    fetch(`/api/conversations?${params}`, { credentials: "include", headers: apiHeaders })
      .then(async (r) => {
        if (!r.ok) {
          const body = await r.json().catch(() => ({}));
          throw new Error(body?.error || "Falha ao carregar tickets");
        }
        return r.json();
      })
      .then((res) => {
        setTickets(Array.isArray(res?.data) ? res.data : []);
      })
      .catch((e: unknown) => {
        setError(e instanceof Error ? e.message : "Erro ao carregar tickets");
        setTickets([]);
      })
      .finally(() => setLoading(false));
  }, [slug, queueId]);

  useEffect(() => {
    fetchTickets();
  }, [fetchTickets]);

  useEffect(() => {
    if (canManageTickets && slug) {
      fetch("/api/company/agents", { credentials: "include", headers: apiHeaders })
        .then((r) => r.json())
        .then((data) => setAgents(Array.isArray(data) ? data : []))
        .catch(() => setAgents([]));
    }
  }, [canManageTickets, slug]);

  const [statusModal, setStatusModal] = useState<{ ticket: Ticket } | null>(null);
  const [assignModal, setAssignModal] = useState<{ ticket: Ticket } | null>(null);
  const [saving, setSaving] = useState(false);
  const [dragOverColumn, setDragOverColumn] = useState<string | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);

  const updateTicketStatus = useCallback(async (ticketId: string, newStatus: string) => {
    setSaving(true);
    try {
      const r = await fetch(`/api/conversations/${ticketId}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json", ...apiHeaders },
        body: JSON.stringify({ status: newStatus }),
      });
      if (r.ok) {
        setTickets((prev) => prev.map((t) => (t.id === ticketId ? { ...t, status: newStatus } : t)));
        setStatusModal(null);
      } else {
        const d = await r.json().catch(() => ({}));
        alert(d?.error ?? "Falha ao atualizar status");
      }
    } catch {
      alert("Erro de rede");
    } finally {
      setSaving(false);
    }
  }, [apiHeaders]);

  const updateTicketAssign = async (ticketId: string, userId: string | null) => {
    setSaving(true);
    try {
      const r = await fetch(`/api/conversations/${ticketId}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json", ...apiHeaders },
        body: JSON.stringify({ assigned_to: userId || null }),
      });
      if (r.ok) {
        const agent = agents.find((a) => a.user_id === userId);
        setTickets((prev) =>
          prev.map((t) =>
            t.id === ticketId
              ? { ...t, assigned_to: userId, assigned_to_name: agent?.full_name ?? null }
              : t
          )
        );
        setAssignModal(null);
      } else {
        const d = await r.json().catch(() => ({}));
        alert(d?.error ?? "Falha ao reatribuir");
      }
    } catch {
      alert("Erro de rede");
    } finally {
      setSaving(false);
    }
  };

  const queueById = useMemo(() => {
    const map = new Map<string, string>();
    queues.forEach((q) => map.set(q.id, q.name));
    return map;
  }, [queues]);

  const columns = useMemo(() => {
    const grouped: Record<string, Ticket[]> = {};
    STATUS_COLUMNS.forEach((c) => {
      grouped[c.key] = [];
    });
    for (const t of tickets) {
      const key = normalizeStatus(t.status);
      if (!grouped[key]) grouped[key] = [];
      grouped[key].push(t);
    }
    return STATUS_COLUMNS.map((c) => ({
      ...c,
      items: grouped[c.key] ?? [],
    }));
  }, [tickets]);

  return (
    <div className="flex h-full flex-col gap-4 bg-[#F1F5F9] p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-[#0F172A]">Tickets</h1>
          <p className="text-sm text-[#64748B]">
            Visão em quadro dos atendimentos por status. {canManageTickets ? "Você vê todos os tickets e pode reatribuir e mudar status." : "Você vê apenas seus tickets."}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <label className="text-sm text-[#64748B]">
            Fila:&nbsp;
            <select
              value={queueId}
              onChange={(e) => setQueueId(e.target.value)}
              className="rounded border border-[#E2E8F0] bg-white px-2 py-1.5 text-sm text-[#1E293B]"
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
        <div className="flex flex-1 items-center justify-center text-sm text-[#64748B]">
          Carregando tickets…
        </div>
      ) : tickets.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center rounded-xl border-2 border-dashed border-[#E2E8F0] bg-white/80 p-8 text-center">
          <p className="text-base font-medium text-[#1E293B]">Nenhum ticket nesta fila</p>
          <p className="mt-2 max-w-md text-sm text-[#64748B]">
            Ao conectar o número em <Link href={slug ? `/${slug}/conexoes` : "#"} className="text-clicvend-orange hover:underline">Conexões</Link>, o histórico é sincronizado automaticamente. Tente a fila <strong>Todas</strong> no filtro acima.
          </p>
          {!canManageTickets && <p className="mt-2 text-xs text-[#94A3B8]">Você vê apenas tickets atribuídos a você. Pegue chamados no Chat para que apareçam aqui.</p>}
        </div>
      ) : (
        <div className="flex flex-1 gap-4 overflow-x-auto pb-2">
          {columns.map((col) => (
            <div
              key={col.key}
              className={`flex min-w-[280px] max-w-[320px] flex-1 flex-col rounded-xl border-2 bg-[#F8FAFC] p-3 transition-colors ${
                dragOverColumn === col.key ? "border-clicvend-orange bg-clicvend-orange/5" : "border-transparent"
              }`}
              onDragOver={(e) => {
                e.preventDefault();
                e.dataTransfer.dropEffect = "move";
                setDragOverColumn(col.key);
              }}
              onDragLeave={() => setDragOverColumn(null)}
              onDrop={(e) => {
                e.preventDefault();
                setDragOverColumn(null);
                const ticketId = e.dataTransfer.getData("ticketId");
                const fromStatus = e.dataTransfer.getData("fromStatus");
                if (ticketId && fromStatus !== col.key) {
                  updateTicketStatus(ticketId, col.key);
                }
              }}
            >
              <div className="mb-3 flex items-center justify-between gap-2">
                <h2 className="text-sm font-semibold text-[#334155]">{col.title}</h2>
                <span className="rounded-full bg-[#E2E8F0] px-2.5 py-0.5 text-xs font-medium text-[#64748B]">
                  {col.items.length}
                </span>
              </div>
              <div className="flex min-h-[120px] flex-1 flex-col gap-2 overflow-y-auto rounded-lg">
                {col.items.map((t) => (
                  <div
                    key={t.id}
                    draggable={canManageTickets}
                    onDragStart={(e) => {
                      setDraggingId(t.id);
                      e.dataTransfer.setData("ticketId", t.id);
                      e.dataTransfer.setData("fromStatus", normalizeStatus(t.status));
                      e.dataTransfer.effectAllowed = "move";
                    }}
                    onDragEnd={() => setDraggingId(null)}
                    className={`group relative rounded-xl border border-[#E2E8F0] bg-white p-3 text-sm shadow-sm transition-all ${
                      canManageTickets ? "cursor-grab active:cursor-grabbing" : ""
                    } ${draggingId === t.id ? "opacity-60 shadow-lg" : "hover:shadow-md hover:border-[#CBD5E1]"}`}
                  >
                    {canManageTickets && (
                      <span className="absolute left-2 top-2.5 text-[#94A3B8] opacity-0 group-hover:opacity-100">
                        <GripVertical className="h-4 w-4" />
                      </span>
                    )}
                    <a
                      href={slug ? `/${slug}/conversas/${t.id}` : "#"}
                      className={`block ${canManageTickets ? "pl-6 pr-8" : "pr-2"}`}
                    >
                      <div className="mb-1 flex items-center justify-between gap-2">
                        <p className="max-w-[160px] truncate font-medium text-[#0F172A]">
                          {t.customer_name || t.customer_phone}
                        </p>
                        <span
                          className={`inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${
                            t.assigned_to
                              ? "bg-clicvend-green/15 text-clicvend-green"
                              : "bg-amber-100 text-amber-800"
                          }`}
                        >
                          {t.assigned_to ? "Em atendimento" : "Na fila"}
                        </span>
                      </div>
                      <div className="flex flex-col gap-0.5 text-[11px] text-[#64748B]">
                        <span className="truncate">
                          {t.queue_id ? queueById.get(t.queue_id) ?? "Fila" : "Sem fila"}
                        </span>
                        {canManageTickets && t.assigned_to_name && (
                          <span>Atendente: {t.assigned_to_name}</span>
                        )}
                        <span>
                          Entrou:{" "}
                          {new Date(t.created_at).toLocaleDateString("pt-BR", {
                            day: "2-digit",
                            month: "2-digit",
                            year: "2-digit",
                          })}
                        </span>
                      </div>
                    </a>
                    {canManageTickets && (
                      <div className="absolute right-2 top-2 flex gap-1 opacity-0 group-hover:opacity-100 transition">
                        <button
                          type="button"
                          onClick={(e) => { e.preventDefault(); setStatusModal({ ticket: t }); }}
                          className="rounded p-1.5 text-[#64748B] hover:bg-[#F1F5F9] hover:text-[#0F172A]"
                          title="Mudar status"
                        >
                          <ArrowRightLeft className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          onClick={(e) => { e.preventDefault(); setAssignModal({ ticket: t }); }}
                          className="rounded p-1.5 text-[#64748B] hover:bg-[#F1F5F9] hover:text-[#0F172A]"
                          title="Reatribuir"
                        >
                          <UserPlus className="h-4 w-4" />
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal Mudar status */}
      {statusModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => !saving && setStatusModal(null)}>
          <div className="w-full max-w-sm rounded-xl bg-white p-4 shadow-lg" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-semibold text-[#0F172A]">Mudar status</h3>
            <p className="mt-1 text-sm text-[#64748B]">{statusModal.ticket.customer_name || statusModal.ticket.customer_phone}</p>
            <div className="mt-4 flex flex-wrap gap-2">
              {STATUS_COLUMNS.map((c) => (
                <button
                  key={c.key}
                  type="button"
                  disabled={saving}
                  onClick={() => updateTicketStatus(statusModal.ticket.id, c.key)}
                  className="rounded-lg border border-[#E2E8F0] bg-white px-3 py-2 text-sm font-medium text-[#334155] hover:bg-[#F8FAFC] disabled:opacity-60"
                >
                  {c.title}
                </button>
              ))}
            </div>
            <div className="mt-4 flex justify-end">
              <button type="button" onClick={() => setStatusModal(null)} className="rounded-lg px-3 py-1.5 text-sm text-[#64748B] hover:bg-[#F1F5F9]">
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Reatribuir */}
      {assignModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => !saving && setAssignModal(null)}>
          <div className="w-full max-w-sm rounded-xl bg-white p-4 shadow-lg" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-semibold text-[#0F172A]">Reatribuir atendimento</h3>
            <p className="mt-1 text-sm text-[#64748B]">{assignModal.ticket.customer_name || assignModal.ticket.customer_phone}</p>
            <select
              className="mt-4 w-full rounded-lg border border-[#E2E8F0] bg-white px-3 py-2 text-sm text-[#1E293B]"
              defaultValue={assignModal.ticket.assigned_to ?? ""}
              onChange={(e) => {
                const v = e.target.value;
                updateTicketAssign(assignModal.ticket.id, v || null);
              }}
              disabled={saving}
            >
              <option value="">— Sem atribuição —</option>
              {agents.map((a) => (
                <option key={a.user_id} value={a.user_id}>
                  {a.full_name} {a.email ? `(${a.email})` : ""}
                </option>
              ))}
            </select>
            <div className="mt-4 flex justify-end">
              <button type="button" onClick={() => setAssignModal(null)} className="rounded-lg px-3 py-1.5 text-sm text-[#64748B] hover:bg-[#F1F5F9]">
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
