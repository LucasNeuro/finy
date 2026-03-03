"use client";

import { useState, useEffect, useCallback } from "react";
import { Inbox, Plus, Loader2, Plug, Link2, Star, Trash2 } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { SideOver } from "@/components/SideOver";
import { ConfirmDialog } from "@/components/ConfirmDialog";

type Queue = { id: string; name: string; slug: string; created_at?: string };
type Channel = { id: string; name: string; queue_id?: string | null };
type LinkedChannel = { channel_id: string; channel_name: string; is_default: boolean };

export default function FilasPage() {
  const pathname = usePathname();
  const slug = pathname?.split("/").filter(Boolean)[0] ?? "";
  const apiHeaders = slug ? { "X-Company-Slug": slug } : undefined;

  const [queues, setQueues] = useState<Queue[]>([]);
  const [channels, setChannels] = useState<Channel[]>([]);
  const [queueChannelCount, setQueueChannelCount] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);

  const [newQueueOpen, setNewQueueOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");

  const [linkSideOverQueue, setLinkSideOverQueue] = useState<Queue | null>(null);
  const [linkedChannels, setLinkedChannels] = useState<LinkedChannel[]>([]);
  const [linkLoading, setLinkLoading] = useState(false);
  const [linkError, setLinkError] = useState("");
  const [linkActionLoading, setLinkActionLoading] = useState<string | null>(null);
  const [removeConfirm, setRemoveConfirm] = useState<{ channelId: string; channelName: string } | null>(null);

  const fetchQueues = useCallback(() => {
    return fetch("/api/queues", { credentials: "include", headers: apiHeaders })
      .then((r) => r.json())
      .then((data) => setQueues(Array.isArray(data) ? data : []))
      .catch(() => setQueues([]));
  }, [slug]);

  const fetchChannels = useCallback(() => {
    return fetch("/api/channels", { credentials: "include", headers: apiHeaders })
      .then(async (r) => {
        const data = await r.json();
        if (!r.ok) {
          if (r.status === 401) setLinkError("Sessão inválida ou empresa não encontrada. Faça login novamente ou acesse pela URL da empresa.");
          return;
        }
        setChannels(Array.isArray(data) ? data : []);
        setLinkError("");
      })
      .catch(() => setChannels([]));
  }, [slug]);

  const fetchQueueLinked = useCallback(
    async (queueId: string) => {
      const r = await fetch(`/api/queues/${encodeURIComponent(queueId)}/channels`, {
        credentials: "include",
        headers: apiHeaders,
      });
      const data = await r.json();
      if (!r.ok) {
        if (r.status === 401) setLinkError("Sessão inválida ou empresa não encontrada. Faça login novamente.");
        return [];
      }
      if (Array.isArray(data?.linked)) return data.linked as LinkedChannel[];
      return [];
    },
    [slug]
  );

  useEffect(() => {
    setLoading(true);
    Promise.all([fetchQueues(), fetchChannels()]).finally(() => setLoading(false));
  }, [fetchQueues, fetchChannels]);

  useEffect(() => {
    if (queues.length === 0) {
      setQueueChannelCount({});
      return;
    }
    let cancelled = false;
    Promise.all(
      queues.map((q) =>
        fetchQueueLinked(q.id).then((linked) => (cancelled ? null : { id: q.id, count: linked.length }))
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
  }, [queues, fetchQueueLinked]);

  useEffect(() => {
    if (!linkSideOverQueue) return;
    setLinkError("");
    setLinkLoading(true);
    Promise.all([
      fetchQueueLinked(linkSideOverQueue.id),
      fetchChannels(),
    ])
      .then(([linked]) => setLinkedChannels(linked ?? []))
      .catch(() => setLinkedChannels([]))
      .finally(() => setLinkLoading(false));
  }, [linkSideOverQueue?.id, fetchChannels, fetchQueueLinked]);

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

  const addQueueToChannel = async (channelId: string) => {
    if (!linkSideOverQueue) return;
    setLinkError("");
    setLinkActionLoading(channelId);
    try {
      const r = await fetch(`/api/channels/${encodeURIComponent(channelId)}/queues`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...apiHeaders },
        body: JSON.stringify({
          queue_id: linkSideOverQueue.id,
          is_default: linkedChannels.length === 0,
        }),
        credentials: "include",
      });
      const data = await r.json();
      if (r.ok) {
        const next = await fetchQueueLinked(linkSideOverQueue.id);
        setLinkedChannels(next);
        setQueueChannelCount((prev) => ({
          ...prev,
          [linkSideOverQueue.id]: next.length,
        }));
      } else {
        setLinkError(data?.error ?? "Falha ao adicionar caixa");
      }
    } catch {
      setLinkError("Erro de rede.");
    }
    setLinkActionLoading(null);
  };

  const setDefaultQueueOnChannel = async (channelId: string) => {
    if (!linkSideOverQueue) return;
    setLinkError("");
    setLinkActionLoading(channelId);
    try {
      const r = await fetch(`/api/channels/${encodeURIComponent(channelId)}/queues`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...apiHeaders },
        body: JSON.stringify({ queue_id: linkSideOverQueue.id, is_default: true }),
        credentials: "include",
      });
      if (r.ok) {
        const next = await fetchQueueLinked(linkSideOverQueue.id);
        setLinkedChannels(next);
      } else {
        const data = await r.json();
        setLinkError(data?.error ?? "Falha ao definir padrão");
      }
    } catch {
      setLinkError("Erro de rede.");
    }
    setLinkActionLoading(null);
  };

  const removeQueueFromChannel = async (channelId: string) => {
    if (!linkSideOverQueue) return;
    setRemoveConfirm(null);
    setLinkError("");
    setLinkActionLoading(channelId);
    try {
      const r = await fetch(`/api/channels/${encodeURIComponent(channelId)}/queues`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json", ...apiHeaders },
        body: JSON.stringify({ queue_id: linkSideOverQueue.id }),
        credentials: "include",
      });
      if (r.ok) {
        const next = await fetchQueueLinked(linkSideOverQueue.id);
        setLinkedChannels(next);
        setQueueChannelCount((prev) => ({
          ...prev,
          [linkSideOverQueue.id]: next.length,
        }));
      } else {
        const data = await r.json();
        setLinkError(data?.error ?? "Falha ao remover");
      }
    } catch {
      setLinkError("Erro de rede.");
    }
    setLinkActionLoading(null);
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
        Crie filas para organizar conversas por setor (ex.: Comercial, Suporte). Vincule cada fila aos números
        abaixo; cada número pode ter até 8 caixas e uma caixa padrão.
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
          <p className="mt-1 text-xs text-[#94A3B8]">Crie uma fila e vincule aos números.</p>
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
            <table className="w-full min-w-[520px]">
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
                    Ação
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
                    <td className="px-4 py-3 text-right">
                      <button
                        type="button"
                        onClick={() => setLinkSideOverQueue(q)}
                        className="inline-flex items-center gap-1.5 text-sm font-medium text-clicvend-orange hover:underline"
                      >
                        <Link2 className="h-4 w-4" />
                        Vincular a números
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* SideOver Nova fila */}
      <SideOver
        open={newQueueOpen}
        onClose={() => setNewQueueOpen(false)}
        title="Nova fila"
      >
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

      {/* SideOver Vincular a números */}
      <SideOver
        open={!!linkSideOverQueue}
        onClose={() => { setLinkSideOverQueue(null); setLinkError(""); }}
        title={linkSideOverQueue ? `Caixa: ${linkSideOverQueue.name} – Vincular a números` : "Vincular a números"}
        width={520}
      >
        <div className="space-y-6">
          <p className="text-sm text-[#64748B]">
            Cada <strong>número (instância WhatsApp)</strong> pode ter até <strong>8 caixas</strong> e uma caixa padrão.
            Abaixo: números que já usam esta caixa e números aos quais você pode vincular.
          </p>
          {linkError && (
            <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
              {linkError}
            </div>
          )}
          {linkLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin text-clicvend-orange" />
            </div>
          ) : (
            <>
              {/* Seção: Números que já usam esta caixa */}
              <div>
                <h3 className="mb-2 text-sm font-semibold text-[#1E293B]">
                  Números que já usam esta caixa
                </h3>
                {linkedChannels.length > 0 ? (
                  <ul className="space-y-2">
                    {linkedChannels.map((link) => {
                      const loadingThis = linkActionLoading === link.channel_id;
                      return (
                        <li
                          key={link.channel_id}
                          className="flex items-center justify-between gap-2 rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] px-3 py-2"
                        >
                          <span className="text-sm font-medium text-[#1E293B]">{link.channel_name}</span>
                          <div className="flex items-center gap-1">
                            {link.is_default ? (
                              <span className="inline-flex items-center gap-1 rounded bg-clicvend-orange/15 px-1.5 py-0.5 text-xs font-medium text-clicvend-orange">
                                <Star className="h-3 w-3 fill-current" /> Padrão
                              </span>
                            ) : (
                              <button
                                type="button"
                                onClick={() => setDefaultQueueOnChannel(link.channel_id)}
                                disabled={!!linkActionLoading}
                                className="rounded p-1.5 text-[#64748B] hover:bg-[#E2E8F0] hover:text-clicvend-orange disabled:opacity-50"
                                title="Definir como padrão"
                              >
                                {loadingThis ? <Loader2 className="h-4 w-4 animate-spin" /> : <Star className="h-4 w-4" />}
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => setRemoveConfirm({ channelId: link.channel_id, channelName: link.channel_name })}
                              disabled={!!linkActionLoading}
                              className="rounded p-1.5 text-[#64748B] hover:bg-red-50 hover:text-red-600 disabled:opacity-50"
                              title="Remover caixa deste número"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                ) : (
                  <p className="rounded-lg border border-dashed border-[#E2E8F0] bg-[#F8FAFC] px-3 py-4 text-center text-sm text-[#94A3B8]">
                    Nenhum número vinculado ainda. Use a seção abaixo para vincular.
                  </p>
                )}
              </div>

              {/* Seção: Vincular esta caixa a um número */}
              <div>
                <h3 className="mb-2 text-sm font-semibold text-[#1E293B]">
                  Vincular esta caixa a um número
                </h3>
                <p className="mb-3 text-xs text-[#64748B]">
                  Escolha um número (instância) abaixo e clique em <strong>Vincular</strong> para que esta caixa passe a receber conversas desse número.
                </p>
                {channels.filter((ch) => !linkedChannels.some((c) => c.channel_id === ch.id)).length === 0 ? (
                  <div className="rounded-lg border border-dashed border-[#E2E8F0] bg-[#F8FAFC] px-3 py-4 text-center text-sm text-[#94A3B8]">
                    {channels.length === 0 ? (
                      <>
                        Nenhuma instância cadastrada.{" "}
                        <Link href={slug ? `/${slug}/conexoes` : "/conexoes"} className="font-medium text-clicvend-orange hover:underline">
                          Crie um número em Conexões
                        </Link>{" "}
                        primeiro.
                      </>
                    ) : (
                      "Todos os números já têm esta caixa vinculada."
                    )}
                  </div>
                ) : (
                  <ul className="space-y-2">
                    {channels
                      .filter((ch) => !linkedChannels.some((c) => c.channel_id === ch.id))
                      .map((ch) => {
                        const loadingThis = linkActionLoading === ch.id;
                        return (
                          <li
                            key={ch.id}
                            className="flex items-center justify-between gap-2 rounded-lg border border-[#E2E8F0] bg-white px-3 py-2.5 shadow-sm"
                          >
                            <span className="text-sm font-medium text-[#1E293B]">{ch.name}</span>
                            <button
                              type="button"
                              onClick={() => addQueueToChannel(ch.id)}
                              disabled={!!linkActionLoading}
                              className="inline-flex items-center gap-2 rounded-lg bg-clicvend-orange px-3 py-2 text-sm font-medium text-white hover:bg-clicvend-orange-dark disabled:opacity-50"
                            >
                              {loadingThis ? <Loader2 className="h-4 w-4 animate-spin" /> : <Link2 className="h-4 w-4" />}
                              Vincular
                            </button>
                          </li>
                        );
                      })}
                  </ul>
                )}
              </div>
            </>
          )}
        </div>
      </SideOver>

      <ConfirmDialog
        open={!!removeConfirm}
        onClose={() => setRemoveConfirm(null)}
        onConfirm={() => removeConfirm && removeQueueFromChannel(removeConfirm.channelId)}
        title="Remover caixa do número?"
        message={
          removeConfirm
            ? `Remover a caixa "${linkSideOverQueue?.name}" do número "${removeConfirm.channelName}"?`
            : ""
        }
        confirmLabel="Remover"
        variant="danger"
      />
    </div>
  );
}
