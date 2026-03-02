"use client";

import { useState, useEffect, useCallback } from "react";
import { SideOver } from "@/components/SideOver";
import { Loader2, User, Shield, Bot, Radio, Upload, ImageIcon, Link2 } from "lucide-react";

type TabId = "conectar" | "perfil" | "privacidade" | "chatbot" | "presenca";

const TAB_LABELS: Record<TabId, string> = {
  conectar: "Conectar",
  perfil: "Perfil",
  privacidade: "Privacidade",
  chatbot: "Respostas automáticas",
  presenca: "Presença",
};

type ChannelConfigSideOverProps = {
  open: boolean;
  onClose: () => void;
  channelId: string;
  channelName: string;
  onSaved?: () => void;
};

export function ChannelConfigSideOver({
  open,
  onClose,
  channelId,
  channelName,
  onSaved,
}: ChannelConfigSideOverProps) {
  const [activeTab, setActiveTab] = useState<TabId>("perfil");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  // Perfil
  const [profileName, setProfileName] = useState("");
  const [profileImage, setProfileImage] = useState("");

  // Privacidade
  const [privacy, setPrivacy] = useState<Record<string, string>>({});

  // Chatbot
  const [chatbotEnabled, setChatbotEnabled] = useState(false);
  const [chatbotIgnoreGroups, setChatbotIgnoreGroups] = useState(true);
  const [chatbotStopWord, setChatbotStopWord] = useState("");
  const [chatbotStopMinutes, setChatbotStopMinutes] = useState(30);
  const [chatbotStopWhenSend, setChatbotStopWhenSend] = useState(5);

  // Presença
  const [presence, setPresence] = useState<"available" | "unavailable">("available");

  // Conectar
  const [connectStatus, setConnectStatus] = useState<"connected" | "connecting" | "disconnected" | null>(null);
  const [qrcode, setQrcode] = useState<string | null>(null);
  const [paircode, setPaircode] = useState<string | null>(null);
  const [connectLoading, setConnectLoading] = useState(false);

  const fetchConnectStatus = useCallback(async () => {
    try {
      const r = await fetch(`/api/uazapi/instance/status?channel_id=${encodeURIComponent(channelId)}`);
      const data = await r.json();
      if (r.ok) {
        const s: "connected" | "connecting" | "disconnected" =
          data.connected || data.loggedIn ? "connected" : data.qrcode || data.paircode ? "connecting" : "disconnected";
        setConnectStatus(s);
        if (data.qrcode) setQrcode(data.qrcode);
        if (data.paircode) setPaircode(data.paircode);
        return data;
      }
    } catch {
      setConnectStatus("disconnected");
    }
    return null;
  }, [channelId]);

  useEffect(() => {
    if (!open || !channelId) return;
    setError("");
    setActiveTab("conectar");
    setQrcode(null);
    setPaircode(null);
    fetchConnectStatus();
    fetchPrivacy();
  }, [open, channelId, fetchConnectStatus]);

  useEffect(() => {
    if (!open || activeTab !== "conectar" || connectStatus !== "connecting" || !channelId) return;
    let cancelled = false;
    const deadline = Date.now() + 120000;
    const poll = async () => {
      if (cancelled || Date.now() > deadline) return;
      const data = await fetchConnectStatus();
      if (cancelled) return;
      if (data?.connected || data?.loggedIn) {
        setConnectStatus("connected");
        onSaved?.();
        onClose();
        return;
      }
      setTimeout(poll, 2500);
    };
    const t = setTimeout(poll, 2500);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [open, activeTab, connectStatus, channelId, fetchConnectStatus, onSaved, onClose]);

  const fetchPrivacy = async () => {
    try {
      const r = await fetch(`/api/uazapi/instance/privacy?channel_id=${encodeURIComponent(channelId)}`);
      const data = await r.json();
      if (r.ok && typeof data === "object") setPrivacy(data);
    } catch {
      // ignore
    }
  };

  const saveProfile = async () => {
    setSaving(true);
    setError("");
    try {
      const body: Record<string, string> = { channel_id: channelId };
      if (profileName.trim()) body.name = profileName.trim().slice(0, 25);
      if (profileImage) body.image = profileImage;
      if (Object.keys(body).length <= 1) {
        setError("Informe nome ou imagem para atualizar.");
        setSaving(false);
        return;
      }
      const r = await fetch("/api/uazapi/instance/profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await r.json();
      if (!r.ok) {
        setError(data?.error ?? "Falha ao salvar");
        setSaving(false);
        return;
      }
      onSaved?.();
    } catch {
      setError("Erro de rede");
    }
    setSaving(false);
  };

  const savePrivacy = async () => {
    setSaving(true);
    setError("");
    try {
      const r = await fetch("/api/uazapi/instance/privacy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ channel_id: channelId, ...privacy }),
      });
      const data = await r.json();
      if (!r.ok) {
        setError(data?.error ?? "Falha ao salvar");
        setSaving(false);
        return;
      }
      onSaved?.();
    } catch {
      setError("Erro de rede");
    }
    setSaving(false);
  };

  const saveChatbot = async () => {
    setSaving(true);
    setError("");
    try {
      const r = await fetch("/api/uazapi/instance/chatbot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          channel_id: channelId,
          chatbot_enabled: chatbotEnabled,
          chatbot_ignoreGroups: chatbotIgnoreGroups,
          chatbot_stopConversation: chatbotStopWord || undefined,
          chatbot_stopMinutes: chatbotStopMinutes,
          chatbot_stopWhenYouSendMsg: chatbotStopWhenSend,
        }),
      });
      const data = await r.json();
      if (!r.ok) {
        setError(data?.error ?? "Falha ao salvar");
        setSaving(false);
        return;
      }
      onSaved?.();
    } catch {
      setError("Erro de rede");
    }
    setSaving(false);
  };

  const savePresence = async () => {
    setSaving(true);
    setError("");
    try {
      const r = await fetch("/api/uazapi/instance/presence", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ channel_id: channelId, presence }),
      });
      const data = await r.json();
      if (!r.ok) {
        setError(data?.error ?? "Falha ao salvar");
        setSaving(false);
        return;
      }
      onSaved?.();
    } catch {
      setError("Erro de rede");
    }
    setSaving(false);
  };

  const handleConnect = async () => {
    setConnectLoading(true);
    setError("");
    try {
      const r = await fetch("/api/uazapi/instance/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ channel_id: channelId }),
      });
      const data = await r.json();
      if (!r.ok) {
        setError(data?.error ?? "Falha ao iniciar conexão");
        setConnectLoading(false);
        return;
      }
      setQrcode(data.qrcode ?? null);
      setPaircode(data.paircode ?? null);
      setConnectStatus(data.connected ? "connected" : "connecting");
      if (data.connected) {
        onSaved?.();
        onClose();
      }
    } catch {
      setError("Erro de rede");
    }
    setConnectLoading(false);
  };

  const handleSave = () => {
    switch (activeTab) {
      case "perfil":
        saveProfile();
        break;
      case "privacidade":
        savePrivacy();
        break;
      case "chatbot":
        saveChatbot();
        break;
      case "presenca":
        savePresence();
        break;
    }
  };

  const [uploadingImage, setUploadingImage] = useState(false);
  const handleImageUpload = useCallback(async (file: File) => {
    const formData = new FormData();
    formData.append("file", file);
    setUploadingImage(true);
    try {
      const r = await fetch("/api/upload/channel-profile-image", { method: "POST", body: formData });
      const data = await r.json();
      if (r.ok && data?.url) {
        setProfileImage(data.url);
      } else {
        setError(data?.error ?? "Falha ao enviar imagem");
      }
    } catch {
      setError("Erro ao enviar imagem");
    } finally {
      setUploadingImage(false);
    }
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      const file = e.dataTransfer.files[0];
      if (file?.type?.startsWith("image/")) handleImageUpload(file);
    },
    [handleImageUpload]
  );
  const handleDragOver = useCallback((e: React.DragEvent) => e.preventDefault(), []);

  const tabs: { id: TabId; icon: React.ReactNode }[] = [
    { id: "conectar", icon: <Link2 className="h-4 w-4" /> },
    { id: "perfil", icon: <User className="h-4 w-4" /> },
    { id: "privacidade", icon: <Shield className="h-4 w-4" /> },
    { id: "chatbot", icon: <Bot className="h-4 w-4" /> },
    { id: "presenca", icon: <Radio className="h-4 w-4" /> },
  ];

  const PRIVACY_OPTIONS: { key: string; label: string; options: { value: string; label: string }[] }[] = [
    { key: "groupadd", label: "Quem pode adicionar aos grupos", options: [
      { value: "all", label: "Todos" }, { value: "contacts", label: "Contatos" },
      { value: "contact_blacklist", label: "Lista de bloqueio" }, { value: "none", label: "Ninguém" },
    ]},
    { key: "last", label: "Quem pode ver visto por último", options: [
      { value: "all", label: "Todos" }, { value: "contacts", label: "Contatos" },
      { value: "contact_blacklist", label: "Lista de bloqueio" }, { value: "none", label: "Ninguém" },
    ]},
    { key: "status", label: "Quem pode ver status", options: [
      { value: "all", label: "Todos" }, { value: "contacts", label: "Contatos" },
      { value: "contact_blacklist", label: "Lista de bloqueio" }, { value: "none", label: "Ninguém" },
    ]},
    { key: "profile", label: "Quem pode ver foto de perfil", options: [
      { value: "all", label: "Todos" }, { value: "contacts", label: "Contatos" },
      { value: "contact_blacklist", label: "Lista de bloqueio" }, { value: "none", label: "Ninguém" },
    ]},
    { key: "readreceipts", label: "Confirmação de leitura", options: [
      { value: "all", label: "Todos" }, { value: "none", label: "Ninguém" },
    ]},
    { key: "online", label: "Status online", options: [
      { value: "all", label: "Todos" }, { value: "match_last_seen", label: "Igual ao último visto" },
    ]},
    { key: "calladd", label: "Quem pode fazer chamadas", options: [
      { value: "all", label: "Todos" }, { value: "known", label: "Conhecidos" },
    ]},
  ];

  return (
    <SideOver
      open={open}
      onClose={onClose}
      title={`Configurar: ${channelName}`}
      width={720}
    >
      <div className="flex flex-col gap-4">
        <div className="flex gap-1 overflow-x-auto pb-2 -mx-1">
          {tabs.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setActiveTab(t.id)}
              className={`flex items-center gap-1.5 shrink-0 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                activeTab === t.id
                  ? "bg-clicvend-orange/10 text-clicvend-orange"
                  : "text-[#64748B] hover:bg-[#F1F5F9]"
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

        {/* Conectar */}
        {activeTab === "conectar" && (
          <div className="space-y-4">
            {connectStatus === "connected" ? (
              <div className="rounded-lg bg-[#DCFCE7] p-4 text-center">
                <p className="font-medium text-[#16A34A]">WhatsApp conectado</p>
                <p className="mt-1 text-sm text-[#64748B]">Este número já está vinculado e pronto para receber mensagens.</p>
              </div>
            ) : connectStatus === "connecting" || qrcode || paircode ? (
              <>
                <p className="text-sm text-[#64748B]">
                  Abra o WhatsApp no celular, vá em <strong>Aparelhos conectados</strong> e escaneie o QR Code ou use o código de pareamento.
                </p>
                {qrcode && (
                  <div className="flex justify-center">
                    <img src={qrcode} alt="QR Code WhatsApp" className="max-h-64 w-auto rounded-lg border border-[#E2E8F0]" />
                  </div>
                )}
                {paircode && (
                  <p className="text-center text-lg font-mono font-semibold text-[#1E293B]">{paircode}</p>
                )}
                {!qrcode && !paircode && connectLoading && (
                  <div className="flex justify-center py-8">
                    <Loader2 className="h-8 w-8 animate-spin text-clicvend-orange" />
                  </div>
                )}
                <p className="text-center text-sm font-medium text-clicvend-orange">Conectando…</p>
              </>
            ) : (
              <>
                <p className="text-sm text-[#64748B]">
                  Conecte este número ao WhatsApp escaneando o QR Code. O número aparecerá na tabela assim que a conexão for estabelecida.
                </p>
                <button
                  type="button"
                  onClick={handleConnect}
                  disabled={connectLoading}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-clicvend-orange px-4 py-3 font-medium text-white hover:bg-clicvend-orange-dark disabled:opacity-60"
                >
                  {connectLoading ? (
                    <>
                      <Loader2 className="h-5 w-5 animate-spin" />
                      Gerando QR Code…
                    </>
                  ) : (
                    <>
                      <Link2 className="h-5 w-5" />
                      Conectar WhatsApp
                    </>
                  )}
                </button>
              </>
            )}
          </div>
        )}

        {/* Perfil */}
        {activeTab === "perfil" && (
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-[#334155] mb-1">Nome do perfil WhatsApp (máx. 25 caracteres)</label>
              <input
                type="text"
                value={profileName}
                onChange={(e) => setProfileName(e.target.value)}
                placeholder="Nome exibido no WhatsApp"
                maxLength={25}
                className="w-full rounded-lg border border-[#E2E8F0] px-3 py-2 text-[#1E293B] focus:border-clicvend-orange focus:outline-none focus:ring-1 focus:ring-clicvend-orange"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-[#334155] mb-1">Foto de perfil</label>
              <div
                onDrop={handleDrop}
                onDragOver={handleDragOver}
                className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-[#E2E8F0] bg-[#F8FAFC] p-6 transition-colors hover:border-clicvend-orange/50 hover:bg-clicvend-orange/5"
              >
                {profileImage ? (
                  <div className="relative">
                    <img src={profileImage} alt="Preview" className="h-24 w-24 rounded-full object-cover" />
                    <button
                      type="button"
                      onClick={() => setProfileImage("")}
                      className="absolute -right-1 -top-1 rounded-full bg-red-500 p-1 text-white hover:bg-red-600"
                    >
                      ×
                    </button>
                  </div>
                ) : (
                  <>
                    {uploadingImage ? (
                      <Loader2 className="h-12 w-12 animate-spin text-clicvend-orange" />
                    ) : (
                      <>
                        <ImageIcon className="h-12 w-12 text-[#94A3B8]" />
                        <p className="mt-2 text-sm text-[#64748B]">Arraste uma imagem aqui ou clique para selecionar</p>
                        <p className="text-xs text-[#94A3B8]">JPEG, PNG, GIF ou WebP (máx. 5MB)</p>
                        <input
                          type="file"
                          accept="image/jpeg,image/png,image/gif,image/webp"
                          className="mt-2 hidden"
                          id="profile-image-upload"
                          onChange={(e) => {
                            const f = e.target.files?.[0];
                            if (f) handleImageUpload(f);
                            e.target.value = "";
                          }}
                        />
                        <label
                          htmlFor="profile-image-upload"
                          className="mt-2 inline-flex cursor-pointer items-center gap-2 rounded-lg bg-clicvend-orange px-4 py-2 text-sm font-medium text-white hover:bg-clicvend-orange-dark"
                        >
                          <Upload className="h-4 w-4" />
                          Enviar imagem
                        </label>
                      </>
                    )}
                  </>
                )}
              </div>
              <p className="mt-2 text-xs text-[#94A3B8]">Ou cole uma URL de imagem:</p>
              <input
                type="url"
                value={profileImage}
                onChange={(e) => setProfileImage(e.target.value)}
                placeholder="https://..."
                className="mt-1 w-full rounded-lg border border-[#E2E8F0] px-3 py-2 text-sm text-[#1E293B] focus:border-clicvend-orange focus:outline-none focus:ring-1 focus:ring-clicvend-orange"
              />
            </div>
          </div>
        )}

        {/* Privacidade */}
        {activeTab === "privacidade" && (
          <div className="space-y-4">
            {PRIVACY_OPTIONS.map((opt) => (
              <div key={opt.key}>
                <label className="block text-sm font-medium text-[#334155] mb-1">{opt.label}</label>
                <select
                  value={privacy[opt.key] ?? ""}
                  onChange={(e) => setPrivacy((p) => ({ ...p, [opt.key]: e.target.value }))}
                  className="w-full rounded-lg border border-[#E2E8F0] px-3 py-2 text-[#1E293B] focus:border-clicvend-orange focus:outline-none focus:ring-1 focus:ring-clicvend-orange"
                >
                  <option value="">Manter atual</option>
                  {opt.options.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </div>
            ))}
          </div>
        )}

        {/* Chatbot / Respostas automáticas */}
        {activeTab === "chatbot" && (
          <div className="space-y-4">
            <div className="rounded-lg bg-[#F0F9FF] p-3 text-sm text-[#0369A1]">
              <strong>O que são respostas automáticas?</strong> Configure um chatbot para responder mensagens automaticamente. Quando habilitado, o sistema pode enviar respostas pré-definidas. Use a palavra para parar quando o cliente quiser falar com um atendente humano.
            </div>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={chatbotEnabled}
                onChange={(e) => setChatbotEnabled(e.target.checked)}
                className="rounded border-[#E2E8F0] text-clicvend-orange focus:ring-clicvend-orange"
              />
              <span className="text-sm font-medium text-[#334155]">Respostas automáticas habilitadas</span>
            </label>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={chatbotIgnoreGroups}
                onChange={(e) => setChatbotIgnoreGroups(e.target.checked)}
                className="rounded border-[#E2E8F0] text-clicvend-orange focus:ring-clicvend-orange"
              />
              <span className="text-sm font-medium text-[#334155]">Ignorar grupos</span>
            </label>
            <div>
              <label className="block text-sm font-medium text-[#334155] mb-1">Palavra para parar e falar com atendente</label>
              <input
                type="text"
                value={chatbotStopWord}
                onChange={(e) => setChatbotStopWord(e.target.value)}
                placeholder="Ex: atendente, parar"
                className="w-full rounded-lg border border-[#E2E8F0] px-3 py-2 text-[#1E293B] focus:border-clicvend-orange focus:outline-none focus:ring-1 focus:ring-clicvend-orange"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-[#334155] mb-1">Minutos pausado após cliente pedir atendente</label>
              <input
                type="number"
                min={0}
                value={chatbotStopMinutes}
                onChange={(e) => setChatbotStopMinutes(parseInt(e.target.value, 10) || 0)}
                className="w-full rounded-lg border border-[#E2E8F0] px-3 py-2 text-[#1E293B] focus:border-clicvend-orange focus:outline-none focus:ring-1 focus:ring-clicvend-orange"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-[#334155] mb-1">Minutos pausado ao enviar mensagem manual</label>
              <input
                type="number"
                min={0}
                value={chatbotStopWhenSend}
                onChange={(e) => setChatbotStopWhenSend(parseInt(e.target.value, 10) || 0)}
                className="w-full rounded-lg border border-[#E2E8F0] px-3 py-2 text-[#1E293B] focus:border-clicvend-orange focus:outline-none focus:ring-1 focus:ring-clicvend-orange"
              />
            </div>
          </div>
        )}

        {/* Presença */}
        {activeTab === "presenca" && (
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-[#334155] mb-1">Status de presença</label>
              <select
                value={presence}
                onChange={(e) => setPresence(e.target.value as "available" | "unavailable")}
                className="w-full rounded-lg border border-[#E2E8F0] px-3 py-2 text-[#1E293B] focus:border-clicvend-orange focus:outline-none focus:ring-1 focus:ring-clicvend-orange"
              >
                <option value="available">Disponível (online)</option>
                <option value="unavailable">Indisponível (offline)</option>
              </select>
            </div>
          </div>
        )}

        <div className="flex justify-end gap-2 pt-4 border-t border-[#E2E8F0]">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-[#E2E8F0] px-4 py-2 text-sm font-medium text-[#64748B] hover:bg-[#F8FAFC]"
          >
            Fechar
          </button>
          {activeTab !== "conectar" && (
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="inline-flex items-center gap-2 rounded-lg bg-clicvend-orange px-4 py-2 text-sm font-medium text-white hover:bg-clicvend-orange-dark disabled:opacity-60"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Salvar
            </button>
          )}
        </div>
      </div>
    </SideOver>
  );
}
