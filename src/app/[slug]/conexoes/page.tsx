"use client";

import { useState, useEffect, useCallback } from "react";
import { RefreshCw, Smartphone, Plus, Loader2, Settings, Wifi, WifiOff, Link2, Trash2, MessageSquare, Users } from "lucide-react";
import { usePathname } from "next/navigation";
import { SideOver } from "@/components/SideOver";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { ChannelConfigSideOver } from "./ChannelConfigSideOver";

type Channel = {
  id: string;
  name: string;
  uazapi_instance_id: string;
  queue_id: string | null;
  is_active: boolean;
  created_at: string;
};

type Queue = { id: string; name: string; slug: string };

type ChannelStatus = "connected" | "connecting" | "disconnected" | null;

const MAX_CHANNELS_PER_COMPANY = 3;

export default function ConexoesPage() {
  const pathname = usePathname();
  const slug = pathname?.split("/").filter(Boolean)[0] ?? "";
  const [channels, setChannels] = useState<Channel[]>([]);
  const [queues, setQueues] = useState<Queue[]>([]);
  const [loading, setLoading] = useState(true);
  const [sideOverOpen, setSideOverOpen] = useState(false);
  const [name, setName] = useState("");
  const [queueId, setQueueId] = useState("");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState("");

  const [configSideOverOpen, setConfigSideOverOpen] = useState(false);
  const [configChannelId, setConfigChannelId] = useState<string | null>(null);
  const [configChannelName, setConfigChannelName] = useState("");
  const [configChannelQueueId, setConfigChannelQueueId] = useState<string | null>(null);
  const [channelStatuses, setChannelStatuses] = useState<Record<string, ChannelStatus>>({});
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [channelStats, setChannelStats] = useState<Record<string, { conversations_count: number; messages_count: number; open_conversations: number }>>({});

  const [deleteConfirmChannel, setDeleteConfirmChannel] = useState<Channel | null>(null);
  const canAddChannel = channels.length < MAX_CHANNELS_PER_COMPANY;

  const fetchChannels = useCallback(() => {
    setLoading(true);
    return fetch("/api/channels", { credentials: "include", headers: slug ? { "X-Company-Slug": slug } : undefined })
      .then((r) => r.json())
      .then((data) => setChannels(Array.isArray(data) ? data : []))
      .catch(() => setChannels([]))
      .finally(() => setLoading(false));
  }, [slug]);

  const fetchStatus = useCallback(async (chId: string) => {
    try {
      const r = await fetch(`/api/uazapi/instance/status?channel_id=${encodeURIComponent(chId)}`, { credentials: "include", headers: slug ? { "X-Company-Slug": slug } : undefined });
      const data = await r.json();
      if (r.ok) {
        const s: ChannelStatus = data.connected || data.loggedIn ? "connected" : data.qrcode || data.paircode ? "connecting" : "disconnected";
        setChannelStatuses((prev) => ({ ...prev, [chId]: s }));
        return data;
      }
    } catch {
      setChannelStatuses((prev) => ({ ...prev, [chId]: "disconnected" }));
    }
    return null;
  }, [slug]);

  const fetchStats = useCallback(() => {
    fetch("/api/channels/stats", { credentials: "include", headers: slug ? { "X-Company-Slug": slug } : undefined })
      .then((r) => r.json())
      .then((data: Array<{ channel_id: string; conversations_count: number; messages_count: number; open_conversations: number }>) => {
        const map: Record<string, { conversations_count: number; messages_count: number; open_conversations: number }> = {};
        (data ?? []).forEach((s) => {
          map[s.channel_id] = {
            conversations_count: s.conversations_count ?? 0,
            messages_count: s.messages_count ?? 0,
            open_conversations: s.open_conversations ?? 0,
          };
        });
        setChannelStats(map);
      })
      .catch(() => setChannelStats({}));
  }, [slug]);

  useEffect(() => {
    fetchChannels();
  }, [fetchChannels]);

  useEffect(() => {
    if (channels.length === 0) return;
    channels.forEach((c) => fetchStatus(c.id));
  }, [channels, fetchStatus]);

  useEffect(() => {
    fetch("/api/queues", { credentials: "include", headers: slug ? { "X-Company-Slug": slug } : undefined })
      .then((r) => r.json())
      .then((data) => setQueues(Array.isArray(data) ? data : []))
      .catch(() => setQueues([]));
  }, [slug]);

  useEffect(() => {
    if (sideOverOpen) {
      fetch("/api/queues", { credentials: "include", headers: slug ? { "X-Company-Slug": slug } : undefined })
        .then((r) => r.json())
        .then((data) => setQueues(Array.isArray(data) ? data : []))
        .catch(() => setQueues([]));
    }
  }, [sideOverOpen, slug]);

  const openSideOver = () => {
    if (!canAddChannel) return;
    setName("");
    setQueueId("");
    setCreateError("");
    setSideOverOpen(true);
  };

  const closeSideOver = () => {
    setSideOverOpen(false);
    setCreating(false);
    fetchChannels();
  };

  const openConfig = (ch: Channel) => {
    setConfigChannelId(ch.id);
    setConfigChannelName(ch.name);
    setConfigChannelQueueId(ch.queue_id);
    setConfigSideOverOpen(true);
  };

  const closeConfig = () => {
    setConfigSideOverOpen(false);
    setConfigChannelId(null);
    setConfigChannelName("");
    setConfigChannelQueueId(null);
    fetchChannels();
  };

  const createInstance = async () => {
    const n = name.trim();
    if (!n) {
      setCreateError("Informe o nome da conexão.");
      return;
    }
    setCreateError("");
    setCreating(true);
    try {
      const createRes = await fetch("/api/uazapi/instance", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(slug ? { "X-Company-Slug": slug } : {}) },
        body: JSON.stringify({
          name: n,
          createChannel: true,
          queue_id: queueId.trim() || undefined,
        }),
        credentials: "include",
      });
      const createData = await createRes.json();
      if (!createRes.ok) {
        setCreateError(createData?.error ?? "Falha ao criar instância");
        setCreating(false);
        return;
      }
      if (!createData.channel?.id) {
        setCreateError("Canal não foi criado. Tente novamente.");
        setCreating(false);
        return;
      }
      fetchChannels().then(() => {
        fetchStats();
        fetchStatus(createData.channel.id);
        setSideOverOpen(false);
      });
    } catch {
      setCreateError("Erro de rede. Tente novamente.");
    } finally {
      setCreating(false);
    }
  };

  const handleConnect = async (ch: Channel) => {
    setActionLoading(ch.id);
    try {
      const r = await fetch("/api/uazapi/instance/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(slug ? { "X-Company-Slug": slug } : {}) },
        body: JSON.stringify({ channel_id: ch.id }),
        credentials: "include",
      });
      const data = await r.json();
      if (r.ok) {
        setChannelStatuses((prev) => ({ ...prev, [ch.id]: "connecting" }));
        if (data.connected) fetchChannels();
      }
    } catch {
      // ignore
    } finally {
      setActionLoading(null);
    }
  };

  const handleDisconnect = async (ch: Channel) => {
    setActionLoading(ch.id);
    try {
      const r = await fetch("/api/uazapi/instance/disconnect", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(slug ? { "X-Company-Slug": slug } : {}) },
        body: JSON.stringify({ channel_id: ch.id }),
        credentials: "include",
      });
      if (r.ok) {
        setChannelStatuses((prev) => ({ ...prev, [ch.id]: "disconnected" }));
        fetchChannels();
      }
    } catch {
      // ignore
    } finally {
      setActionLoading(null);
    }
  };

  const handleDelete = (ch: Channel) => {
    setDeleteConfirmChannel(ch);
  };

  const doDeleteChannel = async () => {
    const ch = deleteConfirmChannel;
    if (!ch) return;
    setDeleteConfirmChannel(null);
    setActionLoading(ch.id);
    try {
      const r = await fetch(`/api/uazapi/instance/delete?channel_id=${encodeURIComponent(ch.id)}`, { method: "DELETE", credentials: "include", headers: slug ? { "X-Company-Slug": slug } : undefined });
      if (r.ok) {
        setChannels((prev) => prev.filter((c) => c.id !== ch.id));
        setChannelStatuses((prev) => {
          const next = { ...prev };
          delete next[ch.id];
          return next;
        });
      }
    } catch {
      // ignore
    } finally {
      setActionLoading(null);
    }
  };

  const getStatusLabel = (status: ChannelStatus) => {
    const map: Record<string, string> = {
      connected: "Conectado",
      connecting: "Conectando…",
      disconnected: "Desconectado",
    };
    return status ? map[status] ?? "—" : "—";
  };

  const getStatusColor = (status: ChannelStatus) => {
    const map: Record<string, string> = {
      connected: "text-[#16A34A] bg-[#DCFCE7]",
      connecting: "text-[#CA8A04] bg-[#FEF9C3]",
      disconnected: "text-[#DC2626] bg-[#FEE2E2]",
    };
    return status ? map[status] ?? "text-[#64748B] bg-[#F1F5F9]" : "text-[#64748B] bg-[#F1F5F9]";
  };

  return (
    <div className="flex flex-col gap-4 p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-[#1E293B]">Conexões</h1>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={openSideOver}
            disabled={!canAddChannel}
            className="inline-flex items-center gap-1.5 rounded-lg bg-clicvend-orange px-4 py-2 text-sm font-medium text-white hover:bg-clicvend-orange-dark disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            title={!canAddChannel ? "Limite de 3 números por empresa" : undefined}
          >
            <Plus className="h-4 w-4" />
            Nova conexão WhatsApp
          </button>
          <button
            type="button"
            onClick={() => { fetchChannels(); fetchStats(); channels.forEach((c) => fetchStatus(c.id)); }}
            className="flex h-10 w-10 items-center justify-center rounded-full bg-[#F1F5F9] text-[#64748B] hover:bg-[#E2E8F0] transition-colors"
            aria-label="Atualizar"
          >
            <RefreshCw className="h-4 w-4" />
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <div className="flex flex-col items-center gap-3">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-clicvend-orange border-t-transparent" />
            <span className="text-sm text-[#64748B]">Carregando…</span>
          </div>
        </div>
      ) : channels.length === 0 ? (
        <div className="rounded-xl border border-[#E2E8F0] bg-white p-8 text-center">
          <Smartphone className="mx-auto h-12 w-12 text-[#94A3B8]" />
          <p className="mt-2 text-[#64748B]">Nenhum canal cadastrado.</p>
          <p className="mt-1 text-xs text-[#94A3B8]">Cada empresa pode conectar até {MAX_CHANNELS_PER_COMPANY} números.</p>
          <button
            type="button"
            onClick={openSideOver}
            disabled={!canAddChannel}
            className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-clicvend-orange px-4 py-2 text-sm font-medium text-white hover:bg-clicvend-orange-dark disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <Plus className="h-4 w-4" />
            Nova conexão WhatsApp
          </button>
        </div>
      ) : (
        <div className="rounded-xl border border-[#E2E8F0] bg-white shadow-sm overflow-hidden">
          {/* Resumo total */}
          <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[#E2E8F0] bg-[#F8FAFC] px-4 py-3">
            <p className="text-sm text-[#64748B]">
              {channels.length} de {MAX_CHANNELS_PER_COMPANY} números conectados
            </p>
            <div className="flex items-center gap-4 text-sm">
              <span className="flex items-center gap-1.5 text-[#64748B]">
                <Users className="h-4 w-4 text-clicvend-orange" />
                Total: <strong className="text-[#1E293B]">{channels.reduce((s, c) => s + (channelStats[c.id]?.conversations_count ?? 0), 0)}</strong> conversas
              </span>
              <span className="flex items-center gap-1.5 text-[#64748B]">
                <MessageSquare className="h-4 w-4 text-clicvend-blue" />
                <strong className="text-[#1E293B]">{channels.reduce((s, c) => s + (channelStats[c.id]?.messages_count ?? 0), 0)}</strong> mensagens
              </span>
            </div>
          </div>

          {/* Tabela */}
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px]">
              <thead>
                <tr className="border-b border-[#E2E8F0] bg-[#F8FAFC]">
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-[#64748B]">Nome</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-[#64748B]">Caixa de entrada</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-[#64748B]">Status</th>
                  <th className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-wider text-[#64748B]">Conversas</th>
                  <th className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-wider text-[#64748B]">Mensagens</th>
                  <th className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-wider text-[#64748B]">Abertas</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-[#64748B]">Ações</th>
                </tr>
              </thead>
              <tbody>
                {channels.map((ch) => {
                  const status = channelStatuses[ch.id] ?? null;
                  const loading = actionLoading === ch.id;
                  const stats = channelStats[ch.id];
                  const conv = stats?.conversations_count ?? 0;
                  const msgs = stats?.messages_count ?? 0;
                  const open = stats?.open_conversations ?? 0;
                  return (
                    <tr
                      key={ch.id}
                      className="border-b border-[#E2E8F0] transition-colors hover:bg-[#F8FAFC]"
                    >
                      <td className="px-4 py-3">
                        <div>
                          <p className="font-semibold text-[#1E293B]">{ch.name}</p>
                          <p className="font-mono text-xs text-[#94A3B8]" title={ch.uazapi_instance_id}>
                            {ch.uazapi_instance_id.length > 16 ? `${ch.uazapi_instance_id.slice(0, 12)}…` : ch.uazapi_instance_id}
                          </p>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-sm text-[#64748B]">
                        {ch.queue_id ? (queues.find((q) => q.id === ch.queue_id)?.name ?? "—") : "—"}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ${getStatusColor(status)}`}>
                          {status === "connected" ? (
                            <Wifi className="h-3.5 w-3.5" />
                          ) : status === "connecting" ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <WifiOff className="h-3.5 w-3.5" />
                          )}
                          {getStatusLabel(status)}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center font-medium text-[#1E293B]">{conv}</td>
                      <td className="px-4 py-3 text-center font-medium text-[#1E293B]">{msgs}</td>
                      <td className="px-4 py-3 text-center">
                        <span className="text-sm font-medium text-[#16A34A]">{open}</span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-1">
                          {loading ? (
                            <span className="rounded-lg p-2 text-[#64748B]">
                              <Loader2 className="h-5 w-5 animate-spin" />
                            </span>
                          ) : (
                            <>
                              {status !== "connected" && (
                                <button
                                  type="button"
                                  onClick={() => handleConnect(ch)}
                                  title="Conectar"
                                  className="rounded-lg p-2 text-[#64748B] hover:bg-[#F1F5F9] hover:text-clicvend-blue transition-colors"
                                >
                                  <Link2 className="h-5 w-5" />
                                </button>
                              )}
                              {status === "connected" && (
                                <button
                                  type="button"
                                  onClick={() => handleDisconnect(ch)}
                                  title="Desconectar"
                                  className="rounded-lg p-2 text-[#64748B] hover:bg-[#F1F5F9] hover:text-amber-600 transition-colors"
                                >
                                  <WifiOff className="h-5 w-5" />
                                </button>
                              )}
                              <button
                                type="button"
                                onClick={() => openConfig(ch)}
                                title="Configurar"
                                className="rounded-lg p-2 text-[#64748B] hover:bg-[#F1F5F9] hover:text-[#1E293B] transition-colors"
                              >
                                <Settings className="h-5 w-5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDelete(ch)}
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
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* SideOver Nova conexão - apenas cria a instância; conectar via Config */}
      <SideOver open={sideOverOpen} onClose={closeSideOver} title="Nova conexão WhatsApp" width={440}>
        <p className="mb-4 text-sm text-[#64748B]">
          Crie a instância primeiro. Depois, clique em <strong>Configurar</strong> na tabela para gerar o QR Code e conectar o WhatsApp.
        </p>
        <label className="mb-1 block text-sm font-medium text-[#334155]">Nome da conexão</label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Ex: Atendimento"
          className="mb-4 w-full rounded-lg border border-[#E2E8F0] px-3 py-2 text-[#1E293B] placeholder:text-[#94A3B8] focus:border-clicvend-orange focus:outline-none focus:ring-1 focus:ring-clicvend-orange"
        />
        <label className="mb-1 block text-sm font-medium text-[#334155]">Caixa de entrada</label>
        <select
          value={queueId}
          onChange={(e) => setQueueId(e.target.value)}
          className="mb-4 w-full rounded-lg border border-[#E2E8F0] px-3 py-2 text-[#1E293B] focus:border-clicvend-orange focus:outline-none focus:ring-1 focus:ring-clicvend-orange"
        >
          <option value="">Nenhuma</option>
          {queues.map((q) => (
            <option key={q.id} value={q.id}>{q.name}</option>
          ))}
        </select>
        <p className="mb-4 text-xs text-[#64748B]">
          As conversas deste número serão agrupadas nesta caixa. Para criar novas caixas, vá em{" "}
          <strong>Filas</strong> no topo da tela.
        </p>
        {createError && <p className="mb-3 text-sm text-red-600">{createError}</p>}
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={closeSideOver}
            className="rounded-lg border border-[#E2E8F0] px-4 py-2 text-sm font-medium text-[#64748B] hover:bg-[#F8FAFC]"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={createInstance}
            disabled={creating}
            className="inline-flex items-center gap-2 rounded-lg bg-clicvend-orange px-4 py-2 text-sm font-medium text-white hover:bg-clicvend-orange-dark disabled:opacity-60"
          >
            {creating ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Criando…
              </>
            ) : (
              "Criar"
            )}
          </button>
        </div>
      </SideOver>

      {/* SideOver Configuração do canal */}
      {configChannelId && (
        <ChannelConfigSideOver
          open={configSideOverOpen}
          onClose={closeConfig}
          channelId={configChannelId}
          channelName={configChannelName}
          channelQueueId={configChannelQueueId}
          queues={queues}
          companySlug={slug}
          onSaved={() => {
            fetchChannels();
            fetchStats();
            if (configChannelId) fetchStatus(configChannelId);
          }}
        />
      )}

      {/* Modal de confirmação de exclusão de conexão */}
      <ConfirmDialog
        open={!!deleteConfirmChannel}
        onClose={() => setDeleteConfirmChannel(null)}
        title="Excluir conexão"
        message={deleteConfirmChannel ? `Excluir a conexão "${deleteConfirmChannel.name}"? Esta ação não pode ser desfeita.` : ""}
        confirmLabel="Excluir"
        cancelLabel="Cancelar"
        variant="danger"
        onConfirm={doDeleteChannel}
        onCancel={() => setDeleteConfirmChannel(null)}
      />
    </div>
  );
}
