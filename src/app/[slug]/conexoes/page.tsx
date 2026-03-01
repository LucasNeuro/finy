"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { Filter, RefreshCw, MoreVertical, Smartphone, Plus, X, Loader2, Settings, Wifi, WifiOff, Link2, Trash2 } from "lucide-react";
import { SideOver } from "@/components/SideOver";
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

const POLL_INTERVAL_MS = 2500;
const POLL_TIMEOUT_MS = 120000;
const MAX_CHANNELS_PER_COMPANY = 3;

export default function ConexoesPage() {
  const [channels, setChannels] = useState<Channel[]>([]);
  const [queues, setQueues] = useState<Queue[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [sideOverOpen, setSideOverOpen] = useState(false);
  const [step, setStep] = useState<1 | 2>(1);
  const [name, setName] = useState("");
  const [queueId, setQueueId] = useState("");
  const [channelId, setChannelId] = useState<string | null>(null);
  const [qrcode, setQrcode] = useState<string | null>(null);
  const [paircode, setPaircode] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [connectError, setConnectError] = useState("");
  const [webhookDone, setWebhookDone] = useState(false);

  const [configSideOverOpen, setConfigSideOverOpen] = useState(false);
  const [configChannelId, setConfigChannelId] = useState<string | null>(null);
  const [configChannelName, setConfigChannelName] = useState("");
  const [menuOpen, setMenuOpen] = useState<string | null>(null);
  const [channelStatuses, setChannelStatuses] = useState<Record<string, ChannelStatus>>({});
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const canAddChannel = channels.length < MAX_CHANNELS_PER_COMPANY;

  const perPage = 15;
  const total = channels.length;
  const start = (page - 1) * perPage;
  const end = Math.min(start + perPage, total);
  const pageItems = channels.slice(start, end);

  const fetchChannels = useCallback(() => {
    setLoading(true);
    fetch("/api/channels")
      .then((r) => r.json())
      .then((data) => setChannels(Array.isArray(data) ? data : []))
      .catch(() => setChannels([]))
      .finally(() => setLoading(false));
  }, []);

  const fetchStatus = useCallback(async (chId: string) => {
    try {
      const r = await fetch(`/api/uazapi/instance/status?channel_id=${encodeURIComponent(chId)}`);
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
  }, []);

  useEffect(() => {
    fetchChannels();
  }, [fetchChannels]);

  useEffect(() => {
    const ids = channels.slice((page - 1) * perPage, page * perPage).map((c) => c.id);
    ids.forEach((id) => fetchStatus(id));
  }, [page, channels, perPage, fetchStatus]);

  useEffect(() => {
    if (sideOverOpen) {
      fetch("/api/queues")
        .then((r) => r.json())
        .then((data) => setQueues(Array.isArray(data) ? data : []))
        .catch(() => setQueues([]));
    }
  }, [sideOverOpen]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(null);
      }
    };
    document.addEventListener("click", handleClickOutside);
    return () => document.removeEventListener("click", handleClickOutside);
  }, []);

  useEffect(() => {
    if (step !== 2 || !channelId || connecting) return;
    let cancelled = false;
    const deadline = Date.now() + POLL_TIMEOUT_MS;

    const poll = async () => {
      if (cancelled || Date.now() > deadline) return;
      try {
        const r = await fetch(`/api/uazapi/instance/status?channel_id=${encodeURIComponent(channelId)}`);
        const data = await r.json();
        if (cancelled) return;
        if (data.qrcode) setQrcode(data.qrcode);
        if (data.paircode) setPaircode(data.paircode);
        if (data.connected || data.loggedIn) {
          setConnecting(false);
          setWebhookDone(true);
          fetchChannels();
          return;
        }
      } catch {
        // ignore
      }
      setTimeout(poll, POLL_INTERVAL_MS);
    };

    poll();
    return () => {
      cancelled = true;
    };
  }, [step, channelId, connecting, fetchChannels]);

  const openSideOver = () => {
    if (!canAddChannel) return;
    setStep(1);
    setName("");
    setQueueId("");
    setChannelId(null);
    setQrcode(null);
    setPaircode(null);
    setConnectError("");
    setWebhookDone(false);
    setSideOverOpen(true);
  };

  const closeSideOver = () => {
    setSideOverOpen(false);
    setConnecting(false);
    fetchChannels();
  };

  const openConfig = (ch: Channel) => {
    setMenuOpen(null);
    setConfigChannelId(ch.id);
    setConfigChannelName(ch.name);
    setConfigSideOverOpen(true);
  };

  const closeConfig = () => {
    setConfigSideOverOpen(false);
    setConfigChannelId(null);
    setConfigChannelName("");
    fetchChannels();
  };

  const createAndConnect = async () => {
    const n = name.trim();
    if (!n) {
      setConnectError("Informe o nome da conexão.");
      return;
    }
    setConnectError("");
    setConnecting(true);
    try {
      const createRes = await fetch("/api/uazapi/instance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: n,
          createChannel: true,
          queue_id: queueId.trim() || undefined,
        }),
      });
      const createData = await createRes.json();
      if (!createRes.ok) {
        setConnectError(createData?.error ?? "Falha ao criar instância");
        setConnecting(false);
        return;
      }
      const cid = createData.channel?.id;
      if (!cid) {
        setConnectError("Canal não foi criado. Tente novamente.");
        setConnecting(false);
        return;
      }
      setChannelId(cid);

      const connectRes = await fetch("/api/uazapi/instance/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ channel_id: cid }),
      });
      const connectData = await connectRes.json();
      if (!connectRes.ok) {
        setConnectError(connectData?.error ?? "Falha ao iniciar conexão");
        setConnecting(false);
        return;
      }
      setQrcode(connectData.qrcode ?? null);
      setPaircode(connectData.paircode ?? null);
      if (connectData.connected) {
        setWebhookDone(true);
        setConnecting(false);
        return;
      }
      setStep(2);
    } catch (e) {
      setConnectError("Erro de rede. Tente novamente.");
      setConnecting(false);
    }
  };

  const handleConnect = async (ch: Channel) => {
    setMenuOpen(null);
    setActionLoading(ch.id);
    try {
      const r = await fetch("/api/uazapi/instance/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ channel_id: ch.id }),
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
    setMenuOpen(null);
    setActionLoading(ch.id);
    try {
      const r = await fetch("/api/uazapi/instance/disconnect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ channel_id: ch.id }),
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

  const handleDelete = async (ch: Channel) => {
    setMenuOpen(null);
    if (!confirm(`Excluir a conexão "${ch.name}"? Esta ação não pode ser desfeita.`)) return;
    setActionLoading(ch.id);
    try {
      const r = await fetch(`/api/uazapi/instance/delete?channel_id=${encodeURIComponent(ch.id)}`, { method: "DELETE" });
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
            className="inline-flex items-center gap-1.5 rounded-lg border border-[#E2E8F0] bg-white px-4 py-2 text-sm font-medium text-[#64748B] hover:bg-[#F8FAFC] transition-colors"
          >
            <Filter className="h-4 w-4" />
            Exibir Filtros
          </button>
          <button
            type="button"
            onClick={fetchChannels}
            className="flex h-10 w-10 items-center justify-center rounded-full bg-[#F1F5F9] text-[#64748B] hover:bg-[#E2E8F0] transition-colors"
            aria-label="Atualizar"
          >
            <RefreshCw className="h-4 w-4" />
          </button>
        </div>
      </div>

      {loading ? (
        <p className="text-[#64748B]">Carregando…</p>
      ) : pageItems.length === 0 ? (
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
        <>
          <p className="text-sm text-[#64748B]">
            {channels.length} de {MAX_CHANNELS_PER_COMPANY} números conectados
          </p>
          <div className="grid gap-4 sm:grid-cols-2">
            {pageItems.map((ch) => {
              const status = channelStatuses[ch.id] ?? null;
              const loading = actionLoading === ch.id;
              return (
                <div
                  key={ch.id}
                  className="flex items-center gap-4 rounded-xl border border-[#E2E8F0] bg-white p-4 shadow-sm"
                >
                  <span className={`flex h-12 w-12 items-center justify-center rounded-full ${getStatusColor(status)}`}>
                    {status === "connected" ? (
                      <Wifi className="h-6 w-6 text-[#16A34A]" />
                    ) : status === "connecting" ? (
                      <Loader2 className="h-6 w-6 animate-spin text-[#CA8A04]" />
                    ) : (
                      <WifiOff className="h-6 w-6 text-[#DC2626]" />
                    )}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-[#1E293B]">{ch.name}</p>
                    <p className={`text-sm font-medium ${getStatusColor(status).split(" ")[0]}`}>
                      {getStatusLabel(status)}
                    </p>
                    <p className="text-xs text-[#64748B]">{ch.uazapi_instance_id}</p>
                  </div>
                  <div className="relative" ref={menuRef}>
                    <button
                      type="button"
                      onClick={() => setMenuOpen(menuOpen === ch.id ? null : ch.id)}
                      disabled={loading}
                      className="rounded-lg p-2 text-[#64748B] hover:bg-[#F1F5F9] hover:text-[#1E293B] disabled:opacity-50"
                      aria-label="Menu"
                    >
                      {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : <MoreVertical className="h-5 w-5" />}
                    </button>
                    {menuOpen === ch.id && (
                      <div className="absolute right-0 top-full z-10 mt-1 w-48 rounded-lg border border-[#E2E8F0] bg-white py-1 shadow-lg">
                        {status !== "connected" && (
                          <button
                            type="button"
                            onClick={() => handleConnect(ch)}
                            className="flex w-full items-center gap-2 px-4 py-2 text-left text-sm text-[#334155] hover:bg-[#F8FAFC]"
                          >
                            <Link2 className="h-4 w-4" />
                            Conectar
                          </button>
                        )}
                        {status === "connected" && (
                          <button
                            type="button"
                            onClick={() => handleDisconnect(ch)}
                            className="flex w-full items-center gap-2 px-4 py-2 text-left text-sm text-[#334155] hover:bg-[#F8FAFC]"
                          >
                            <WifiOff className="h-4 w-4" />
                            Desconectar
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => openConfig(ch)}
                          className="flex w-full items-center gap-2 px-4 py-2 text-left text-sm text-[#334155] hover:bg-[#F8FAFC]"
                        >
                          <Settings className="h-4 w-4" />
                          Configurar
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDelete(ch)}
                          className="flex w-full items-center gap-2 px-4 py-2 text-left text-sm text-red-600 hover:bg-red-50"
                        >
                          <Trash2 className="h-4 w-4" />
                          Excluir
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="flex items-center justify-between border-t border-[#E2E8F0] pt-4 text-sm text-[#64748B]">
            <span>
              Mostrando {total === 0 ? 0 : start + 1}-{end} de {total} resultados
            </span>
            <select
              value={perPage}
              className="rounded border border-[#E2E8F0] bg-white px-2 py-1 text-[#1E293B]"
            >
              <option value={15}>15 por página</option>
            </select>
          </div>
        </>
      )}

      {/* SideOver Nova conexão */}
      <SideOver open={sideOverOpen} onClose={closeSideOver} title={step === 1 ? "Nova conexão WhatsApp" : "Conectar WhatsApp"} width={440}>
        {step === 1 && (
          <>
            <label className="mb-1 block text-sm font-medium text-[#334155]">Nome da conexão</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ex: Atendimento"
              className="mb-4 w-full rounded-lg border border-[#E2E8F0] px-3 py-2 text-[#1E293B] placeholder:text-[#94A3B8] focus:border-clicvend-orange focus:outline-none focus:ring-1 focus:ring-clicvend-orange"
            />
            <label className="mb-1 block text-sm font-medium text-[#334155]">Fila (opcional)</label>
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
            {connectError && <p className="mb-3 text-sm text-red-600">{connectError}</p>}
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
                onClick={createAndConnect}
                disabled={connecting}
                className="inline-flex items-center gap-2 rounded-lg bg-clicvend-orange px-4 py-2 text-sm font-medium text-white hover:bg-clicvend-orange-dark disabled:opacity-60"
              >
                {connecting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Criando…
                  </>
                ) : (
                  "Criar e conectar"
                )}
              </button>
            </div>
          </>
        )}

        {step === 2 && (
          <>
            {webhookDone ? (
              <div className="py-4 text-center">
                <p className="font-medium text-clicvend-orange">Conectado com sucesso!</p>
                <p className="mt-1 text-sm text-[#64748B]">Você já pode receber e enviar mensagens.</p>
                <button
                  type="button"
                  onClick={closeSideOver}
                  className="mt-4 rounded-lg bg-clicvend-orange px-4 py-2 text-sm font-medium text-white hover:bg-clicvend-orange-dark"
                >
                  Fechar
                </button>
              </div>
            ) : (
              <>
                <p className="mb-4 text-sm text-[#64748B]">
                  Abra o WhatsApp no celular, vá em <strong>Aparelhos conectados</strong> e escaneie o QR Code abaixo ou use o código de pareamento.
                </p>
                {qrcode && (
                  <div className="mb-4 flex justify-center">
                    <img
                      src={qrcode}
                      alt="QR Code WhatsApp"
                      className="max-h-64 w-auto rounded-lg border border-[#E2E8F0]"
                    />
                  </div>
                )}
                {paircode && (
                  <p className="mb-4 text-center text-lg font-mono font-semibold text-[#1E293B]">
                    {paircode}
                  </p>
                )}
                {!qrcode && !paircode && connecting && (
                  <div className="flex justify-center py-8">
                    <Loader2 className="h-8 w-8 animate-spin text-clicvend-orange" />
                  </div>
                )}
                <p className="text-center text-sm text-[#64748B]">Aguardando leitura do QR code…</p>
                <div className="mt-4 flex justify-end">
                  <button
                    type="button"
                    onClick={closeSideOver}
                    className="rounded-lg border border-[#E2E8F0] px-4 py-2 text-sm font-medium text-[#64748B] hover:bg-[#F8FAFC]"
                  >
                    Fechar
                  </button>
                </div>
              </>
            )}
          </>
        )}
      </SideOver>

      {/* SideOver Configuração do canal */}
      {configChannelId && (
        <ChannelConfigSideOver
          open={configSideOverOpen}
          onClose={closeConfig}
          channelId={configChannelId}
          channelName={configChannelName}
          onSaved={() => {
            fetchChannels();
          }}
        />
      )}
    </div>
  );
}
