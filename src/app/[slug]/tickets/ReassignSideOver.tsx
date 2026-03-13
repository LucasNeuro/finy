"use client";

import { useState, useEffect, useCallback } from "react";
import { SideOver } from "@/components/SideOver";
import { Loader2, UserPlus } from "lucide-react";

type Agent = { id: string; user_id: string; full_name: string; email?: string };

type ReassignSideOverProps = {
  open: boolean;
  onClose: () => void;
  ticketId: string;
  queueId?: string | null;
  ticketCustomerName: string | null;
  currentAssignedToName: string | null;
  companySlug: string;
  onReassigned: (ticketId: string, newAssigneeId: string, newAssigneeName: string) => void;
};

export function ReassignSideOver({
  open,
  onClose,
  ticketId,
  queueId,
  ticketCustomerName,
  currentAssignedToName,
  companySlug,
  onReassigned,
}: ReassignSideOverProps) {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [selectedUserId, setSelectedUserId] = useState<string>("");

  const apiHeaders = companySlug ? { "X-Company-Slug": companySlug } : undefined;

  const fetchAgents = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const allAgents: Agent[] = [];
      const seen = new Set<string>();

      if (queueId) {
        try {
          const q = await fetch(`/api/queues/${encodeURIComponent(queueId)}/assignments`, { credentials: "include", headers: apiHeaders });
          const qData = await q.json().catch(() => ({}));
          const queueUsers = (Array.isArray(qData?.users) ? qData.users : Array.isArray(qData?.all_users) ? qData.all_users : []) as {
            user_id: string;
            full_name?: string | null;
            email?: string | null;
          }[];
          queueUsers.forEach((u) => {
            if (!u?.user_id || seen.has(u.user_id)) return;
            seen.add(u.user_id);
            allAgents.push({
              id: u.user_id,
              user_id: u.user_id,
              full_name: u.full_name?.trim() || u.email?.trim() || "Sem nome",
              email: u.email ?? undefined,
            });
          });
        } catch {
          // ignore fallback
        }
      }

      const r = await fetch("/api/company/agents", { credentials: "include", headers: apiHeaders });
      const data = await r.json().catch(() => []);
      if (r.ok && Array.isArray(data)) {
        (data as Agent[]).forEach((a) => {
          if (!a?.user_id || seen.has(a.user_id)) return;
          seen.add(a.user_id);
          allAgents.push(a);
        });
      } else if (allAgents.length === 0) {
        setError((data as { error?: string })?.error ?? "Falha ao carregar agentes");
      }

      setAgents(allAgents);
      if (allAgents.length === 0) {
        setError("Nenhum agente disponível para reatribuição.");
      }
    } catch {
      setError("Erro de rede");
    } finally {
      setLoading(false);
    }
  }, [apiHeaders, queueId]);

  useEffect(() => {
    if (open) {
      setError("");
      setSelectedUserId("");
      fetchAgents();
    }
  }, [open, fetchAgents]);

  const handleReassign = async () => {
    if (!selectedUserId) return;
    const agent = agents.find((a) => a.user_id === selectedUserId);
    if (!agent) return;
    setSaving(true);
    setError("");
    try {
      const r = await fetch(`/api/conversations/${ticketId}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json", ...apiHeaders },
        body: JSON.stringify({ assigned_to: selectedUserId }),
      });
      if (r.ok) {
        onReassigned(ticketId, selectedUserId, agent.full_name);
        onClose();
      } else {
        const d = await r.json().catch(() => ({}));
        setError(d?.error ?? "Falha ao reatribuir");
      }
    } catch {
      setError("Erro de rede");
    } finally {
      setSaving(false);
    }
  };

  const handleUnassign = async () => {
    setSaving(true);
    setError("");
    try {
      const r = await fetch(`/api/conversations/${ticketId}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json", ...apiHeaders },
        body: JSON.stringify({ assigned_to: null }),
      });
      if (r.ok) {
        onReassigned(ticketId, "", "");
        onClose();
      } else {
        const d = await r.json().catch(() => ({}));
        setError(d?.error ?? "Falha ao desatribuir");
      }
    } catch {
      setError("Erro de rede");
    } finally {
      setSaving(false);
    }
  };

  return (
    <SideOver open={open} onClose={onClose} title="Reatribuir ticket" width={560}>
      <div className="flex flex-col gap-4">
        <div className="rounded-lg bg-[#F8FAFC] p-3 text-sm">
          <p className="font-medium text-[#1E293B]">
            {ticketCustomerName || "Ticket"}
          </p>
          {currentAssignedToName && (
            <p className="mt-1 text-[#64748B]">
              Atual: {currentAssignedToName}
            </p>
          )}
        </div>

        {error && (
          <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
        )}

        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-8 w-8 animate-spin text-clicvend-orange" />
          </div>
        ) : (
          <>
            <div>
              <label className="mb-2 block text-sm font-medium text-[#334155]">
                Atribuir a
              </label>
              <select
                value={selectedUserId}
                onChange={(e) => setSelectedUserId(e.target.value)}
                className="w-full rounded-lg border border-[#E2E8F0] px-3 py-2 text-sm text-[#1E293B]"
              >
                <option value="">Selecione um agente</option>
                {agents.map((a) => (
                  <option key={a.user_id} value={a.user_id}>
                    {a.full_name}
                    {a.email ? ` (${a.email})` : ""}
                  </option>
                ))}
              </select>
              {agents.length === 0 && (
                <p className="mt-2 text-xs text-[#94A3B8]">
                  Não há agentes listados para esta fila/empresa no momento.
                </p>
              )}
            </div>

            <div className="flex gap-2">
              <button
                type="button"
                onClick={handleUnassign}
                disabled={saving}
                className="flex-1 rounded-lg border border-[#E2E8F0] px-3 py-2 text-sm font-medium text-[#64748B] hover:bg-[#F1F5F9] disabled:opacity-60"
              >
                Desatribuir
              </button>
              <button
                type="button"
                onClick={handleReassign}
                disabled={saving || !selectedUserId}
                className="inline-flex flex-1 items-center justify-center gap-2 rounded-lg bg-clicvend-orange px-3 py-2 text-sm font-medium text-white hover:bg-clicvend-orange/90 disabled:opacity-60"
              >
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
                Reatribuir
              </button>
            </div>
          </>
        )}
      </div>
    </SideOver>
  );
}
