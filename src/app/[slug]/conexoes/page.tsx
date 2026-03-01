"use client";

import { useState, useEffect, useCallback } from "react";
import { Filter, RefreshCw, MoreVertical, Smartphone, Plus, X, Loader2 } from "lucide-react";

type Channel = {
  id: string;
  name: string;
  uazapi_instance_id: string;
  queue_id: string | null;
  is_active: boolean;
  created_at: string;
};

type Queue = { id: string; name: string; slug: string };

const POLL_INTERVAL_MS = 2500;
const POLL_TIMEOUT_MS = 120000; // 2 min

export default function ConexoesPage() {
  const [channels, setChannels] = useState<Channel[]>([]);
  const [queues, setQueues] = useState<Queue[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [modalOpen, setModalOpen] = useState(false);
  const [step, setStep] = useState<1 | 2>(1);
  const [name, setName] = useState("");
  const [queueId, setQueueId] = useState("");
  const [channelId, setChannelId] = useState<string | null>(null);
  const [qrcode, setQrcode] = useState<string | null>(null);
  const [paircode, setPaircode] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [connectError, setConnectError] = useState("");
  const [webhookDone, setWebhookDone] = useState(false);
  const [globalWebhookLoading, setGlobalWebhookLoading] = useState(false);
  const [globalWebhookMessage, setGlobalWebhookMessage] = useState("");

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

  useEffect(() => {
    fetchChannels();
  }, [fetchChannels]);

  useEffect(() => {
    if (modalOpen) {
      fetch("/api/queues")
        .then((r) => r.json())
        .then((data) => setQueues(Array.isArray(data) ? data : []))
        .catch(() => setQueues([]));
    }
  }, [modalOpen]);

  // Poll status when on step 2 and we have channel_id
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
          // Configurar webhook e finalizar
          const wh = await fetch("/api/uazapi/webhook", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ channel_id: channelId }),
          });
          if (wh.ok) setWebhookDone(true);
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
  }, [step, channelId, connecting]);

  const openModal = () => {
    setStep(1);
    setName("");
    setQueueId("");
    setChannelId(null);
    setQrcode(null);
    setPaircode(null);
    setConnectError("");
    setWebhookDone(false);
    setModalOpen(true);
  };

  const closeModal = () => {
    setModalOpen(false);
    setConnecting(false);
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
        const wh = await fetch("/api/uazapi/webhook", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ channel_id: cid }),
        });
        if (wh.ok) setWebhookDone(true);
        setConnecting(false);
        return;
      }
      setStep(2);
    } catch (e) {
      setConnectError("Erro de rede. Tente novamente.");
      setConnecting(false);
    }
  };

  const configureGlobalWebhook = async () => {
    setGlobalWebhookMessage("");
    setGlobalWebhookLoading(true);
    try {
      const r = await fetch("/api/uazapi/global-webhook", { method: "POST" });
      const data = await r.json();
      if (r.ok) {
        setGlobalWebhookMessage("Webhook global configurado. Novas conexões usarão essa URL automaticamente.");
      } else {
        setGlobalWebhookMessage(data?.error ?? "Falha ao configurar webhook global.");
      }
    } catch {
      setGlobalWebhookMessage("Erro de rede.");
    } finally {
      setGlobalWebhookLoading(false);
    }
  };
  return (
    <div className="flex flex-col gap-4 p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-[#1E293B]">Conexões</h1>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={configureGlobalWebhook}
            disabled={globalWebhookLoading}
            className="inline-flex items-center gap-1.5 rounded-lg border border-[#E2E8F0] bg-white px-4 py-2 text-sm font-medium text-[#64748B] hover:bg-[#F8FAFC] transition-colors disabled:opacity-60"
            title="Configure uma vez; todas as instâncias enviarão eventos para essa URL (recomendado com Edge Function)."
          >
            {globalWebhookLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Webhook global
          </button>
          <button
            type="button"
            onClick={openModal}
            className="inline-flex items-center gap-1.5 rounded-lg bg-clicvend-orange px-4 py-2 text-sm font-medium text-white hover:bg-clicvend-orange-dark transition-colors"
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

      {globalWebhookMessage && (
        <p className={`text-sm ${globalWebhookMessage.startsWith("Webhook global") ? "text-clicvend-orange-dark" : "text-[#DC2626]"}`}>
          {globalWebhookMessage}
        </p>
      )}

      {loading ? (
        <p className="text-[#64748B]">Carregando…</p>
      ) : pageItems.length === 0 ? (
        <div className="rounded-xl border border-[#E2E8F0] bg-white p-8 text-center">
          <Smartphone className="mx-auto h-12 w-12 text-[#94A3B8]" />
          <p className="mt-2 text-[#64748B]">Nenhum canal cadastrado.</p>
          <button
            type="button"
            onClick={openModal}
            className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-clicvend-orange px-4 py-2 text-sm font-medium text-white hover:bg-clicvend-orange-dark transition-colors"
          >
            <Plus className="h-4 w-4" />
            Nova conexão WhatsApp
          </button>
        </div>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2">
            {pageItems.map((ch) => (
              <div
                key={ch.id}
                className="flex items-center gap-4 rounded-xl border border-[#E2E8F0] bg-white p-4 shadow-sm"
              >
                <span className="flex h-12 w-12 items-center justify-center rounded-full bg-[#DCFCE7]">
                  <Smartphone className="h-6 w-6 text-clicvend-orange" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-[#1E293B]">{ch.name}</p>
                  <p className="text-sm text-clicvend-orange">Conectado</p>
                  <p className="text-xs text-[#64748B]">{ch.uazapi_instance_id}</p>
                </div>
                <button
                  type="button"
                  className="text-[#64748B] hover:text-[#1E293B] transition-colors"
                  aria-label="Menu"
                >
                  <MoreVertical className="h-5 w-5" />
                </button>
              </div>
            ))}
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

      {/* Modal Nova conexão */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-xl border border-[#E2E8F0] bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-[#E2E8F0] p-4">
              <h2 className="text-lg font-semibold text-[#1E293B]">
                {step === 1 ? "Nova conexão WhatsApp" : "Conectar WhatsApp"}
              </h2>
              <button
                type="button"
                onClick={closeModal}
                className="rounded-lg p-1 text-[#64748B] hover:bg-[#F1F5F9] hover:text-[#1E293B]"
                aria-label="Fechar"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="p-4">
              {step === 1 && (
                <>
                  <label className="block text-sm font-medium text-[#334155] mb-1">Nome da conexão</label>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Ex: Atendimento"
                    className="mb-4 w-full rounded-lg border border-[#E2E8F0] px-3 py-2 text-[#1E293B] placeholder:text-[#94A3B8] focus:border-clicvend-orange focus:outline-none focus:ring-1 focus:ring-clicvend-orange"
                  />
                  <label className="block text-sm font-medium text-[#334155] mb-1">Fila (opcional)</label>
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
                  {connectError && (
                    <p className="mb-3 text-sm text-red-600">{connectError}</p>
                  )}
                  <div className="flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={closeModal}
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
                      <p className="text-clicvend-orange font-medium">Conectado com sucesso!</p>
                      <p className="mt-1 text-sm text-[#64748B]">Webhook configurado. Você já pode receber e enviar mensagens.</p>
                      <button
                        type="button"
                        onClick={closeModal}
                        className="mt-4 rounded-lg bg-clicvend-orange px-4 py-2 text-sm font-medium text-white hover:bg-clicvend-orange-dark"
                      >
                        Fechar
                      </button>
                    </div>
                  ) : (
                    <>
                      <p className="text-sm text-[#64748B] mb-4">
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
                      <p className="text-center text-sm text-[#64748B]">
                        Aguardando leitura do QR code…
                      </p>
                      <div className="mt-4 flex justify-end">
                        <button
                          type="button"
                          onClick={closeModal}
                          className="rounded-lg border border-[#E2E8F0] px-4 py-2 text-sm font-medium text-[#64748B] hover:bg-[#F8FAFC]"
                        >
                          Fechar
                        </button>
                      </div>
                    </>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
