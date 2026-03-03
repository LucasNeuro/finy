"use client";

import { useState, useEffect, useCallback } from "react";
import { Inbox, Plus, Loader2, Plug, Pencil, Trash2 } from "lucide-react";
import { usePathname } from "next/navigation";
import { SideOver } from "@/components/SideOver";
import { ConfirmDialog } from "@/components/ConfirmDialog";

type Queue = { id: string; name: string; slug: string; created_at?: string };

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
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");

  const [editQueue, setEditQueue] = useState<Queue | null>(null);
  const [editName, setEditName] = useState("");
  const [editSlug, setEditSlug] = useState("");
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState("");

  const [deleteConfirmQueue, setDeleteConfirmQueue] = useState<Queue | null>(null);

  const fetchQueues = useCallback(() => {
    return fetch("/api/queues", { credentials: "include", headers: apiHeaders })
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
    if (editQueue) {
      setEditName(editQueue.name);
      setEditSlug(editQueue.slug);
      setEditError("");
    }
  }, [editQueue]);

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
        body: JSON.stringify({ name: n, slug: slugVal }),
        credentials: "include",
      });
      const data = await r.json();
      if (!r.ok) {
        setError(data?.error ?? "Falha ao criar fila");
        setCreating(false);
        return;
      }
      setQueues((prev) => [...prev, { id: data.id, name: data.name, slug: data.slug }]);
      setQueueChannelCount((prev) => ({ ...prev, [data.id]: 0 }));
      setNewName("");
      setNewQueueOpen(false);
    } catch {
      setError("Erro de rede.");
    }
    setCreating(false);
  };

  const updateQueue = async () => {
    if (!editQueue) return;
    const name = editName.trim();
    const slugVal = editSlug.trim().toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "") || editQueue.slug;
    if (!name) {
      setEditError("Informe o nome.");
      return;
    }
    setEditError("");
    setEditSaving(true);
    try {
      const r = await fetch(`/api/queues/${encodeURIComponent(editQueue.id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...apiHeaders },
        body: JSON.stringify({ name, slug: slugVal }),
        credentials: "include",
      });
      const data = await r.json();
      if (!r.ok) {
        setEditError(data?.error ?? "Falha ao atualizar");
        setEditSaving(false);
        return;
      }
      setQueues((prev) =>
        prev.map((q) => (q.id === editQueue.id ? { ...q, name: data.name, slug: data.slug } : q))
      );
      setEditQueue(null);
    } catch {
      setEditError("Erro de rede.");
    }
    setEditSaving(false);
  };

  const deleteQueue = async () => {
    const q = deleteConfirmQueue;
    if (!q) return;
    setDeleteConfirmQueue(null);
    try {
      const r = await fetch(`/api/queues/${encodeURIComponent(q.id)}`, {
        method: "DELETE",
        credentials: "include",
        headers: apiHeaders,
      });
      if (r.ok) {
        setQueues((prev) => prev.filter((x) => x.id !== q.id));
        setQueueChannelCount((prev) => {
          const next = { ...prev };
          delete next[q.id];
          return next;
        });
      }
    } catch {
      // ignore
    }
  };

  return (
    <div className="flex flex-col gap-4 p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-[#1E293B]">Filas (Caixas de entrada)</h1>
        <button
          type="button"
          onClick={() => {
            setNewQueueOpen(true);
            setError("");
            setNewName("");
          }}
          className="inline-flex items-center gap-1.5 rounded-lg bg-clicvend-orange px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-clicvend-orange-dark"
        >
          <Plus className="h-4 w-4" />
          Nova fila
        </button>
      </div>

      <p className="text-sm text-[#64748B]">
        Crie e edite filas para organizar conversas por setor (ex.: Comercial, Suporte). Para vincular cada fila aos
        números (até 8 caixas por número), use <strong>Conexões</strong> e abra <strong>Configurar</strong> no número.
      </p>

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
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px]">
              <thead>
                <tr className="border-b border-[#E2E8F0] bg-[#F8FAFC]">
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-[#64748B]">
                    Nome
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-[#64748B]">
                    Slug
                  </th>
                  <th className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-wider text-[#64748B]">
                    Números vinculados
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-[#64748B]">
                    Ações
                  </th>
                </tr>
              </thead>
              <tbody>
                {queues.map((q) => (
                  <tr key={q.id} className="border-b border-[#E2E8F0] transition-colors hover:bg-[#F8FAFC]">
                    <td className="px-4 py-3 font-medium text-[#1E293B]">{q.name}</td>
                    <td className="px-4 py-3 font-mono text-sm text-[#64748B]">{q.slug}</td>
                    <td className="px-4 py-3 text-center">
                      <span className="inline-flex items-center gap-1.5 text-sm text-[#64748B]">
                        <Plug className="h-4 w-4 text-clicvend-orange" />
                        <strong className="text-[#1E293B]">{queueChannelCount[q.id] ?? "—"}</strong>
                        {queueChannelCount[q.id] === 1 ? " número" : " números"}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-1">
                        <button
                          type="button"
                          onClick={() => setEditQueue(q)}
                          className="rounded-lg p-2 text-[#64748B] hover:bg-[#F1F5F9] hover:text-[#1E293B]"
                          title="Editar"
                        >
                          <Pencil className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setDeleteConfirmQueue(q)}
                          className="rounded-lg p-2 text-[#64748B] hover:bg-red-50 hover:text-red-600"
                          title="Excluir"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
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

      {/* SideOver Editar fila */}
      <SideOver
        open={!!editQueue}
        onClose={() => setEditQueue(null)}
        title={editQueue ? `Editar: ${editQueue.name}` : "Editar fila"}
      >
        <div className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-[#334155]">Nome</label>
            <input
              type="text"
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              className="w-full rounded-lg border border-[#E2E8F0] px-3 py-2 text-[#1E293B] focus:border-clicvend-orange focus:outline-none focus:ring-1 focus:ring-clicvend-orange"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-[#334155]">Slug</label>
            <input
              type="text"
              value={editSlug}
              onChange={(e) => setEditSlug(e.target.value)}
              placeholder="ex: comercial"
              className="w-full rounded-lg border border-[#E2E8F0] px-3 py-2 font-mono text-sm text-[#1E293B] focus:border-clicvend-orange focus:outline-none focus:ring-1 focus:ring-clicvend-orange"
            />
            <p className="mt-1 text-xs text-[#64748B]">Somente letras minúsculas, números e hífens.</p>
          </div>
          {editError && <p className="text-sm text-red-600">{editError}</p>}
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setEditQueue(null)}
              className="rounded-lg border border-[#E2E8F0] px-4 py-2 text-sm font-medium text-[#64748B] hover:bg-[#F8FAFC]"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={updateQueue}
              disabled={editSaving}
              className="inline-flex items-center gap-2 rounded-lg bg-clicvend-orange px-4 py-2 text-sm font-medium text-white hover:bg-clicvend-orange-dark disabled:opacity-60"
            >
              {editSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Salvar
            </button>
          </div>
        </div>
      </SideOver>

      <ConfirmDialog
        open={!!deleteConfirmQueue}
        onClose={() => setDeleteConfirmQueue(null)}
        onConfirm={deleteQueue}
        title="Excluir fila?"
        message={
          deleteConfirmQueue
            ? `Excluir a fila "${deleteConfirmQueue.name}"? Ela será desvinculada de todos os números. Esta ação não pode ser desfeita.`
            : ""
        }
        confirmLabel="Excluir"
        variant="danger"
      />
    </div>
  );
}
