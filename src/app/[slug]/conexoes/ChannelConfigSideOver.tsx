"use client";

import { useState, useEffect } from "react";
import { SideOver } from "@/components/SideOver";
import { Loader2, User, Shield, Wifi, Clock, Bot, Webhook, Radio } from "lucide-react";

type TabId = "perfil" | "privacidade" | "proxy" | "delay" | "chatbot" | "webhook" | "presenca";

const TAB_LABELS: Record<TabId, string> = {
  perfil: "Perfil",
  privacidade: "Privacidade",
  proxy: "Proxy",
  delay: "Delay",
  chatbot: "Chatbot",
  webhook: "Webhook",
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

  // Proxy
  const [proxyEnabled, setProxyEnabled] = useState(false);
  const [proxyUrl, setProxyUrl] = useState("");

  // Delay
  const [delayMin, setDelayMin] = useState(0);
  const [delayMax, setDelayMax] = useState(2);

  // Chatbot
  const [chatbotEnabled, setChatbotEnabled] = useState(false);
  const [chatbotIgnoreGroups, setChatbotIgnoreGroups] = useState(true);
  const [chatbotStopWord, setChatbotStopWord] = useState("");
  const [chatbotStopMinutes, setChatbotStopMinutes] = useState(30);
  const [chatbotStopWhenSend, setChatbotStopWhenSend] = useState(5);

  // Webhook
  const [webhookUrl, setWebhookUrl] = useState("");
  const [webhookEvents, setWebhookEvents] = useState<string[]>([]);
  const [webhookExclude, setWebhookExclude] = useState<string[]>([]);

  // Presença
  const [presence, setPresence] = useState<"available" | "unavailable">("available");

  useEffect(() => {
    if (!open || !channelId) return;
    setError("");
    setActiveTab("perfil");
    fetchPrivacy();
    fetchProxy();
    fetchWebhook();
  }, [open, channelId]);

  const fetchPrivacy = async () => {
    try {
      const r = await fetch(`/api/uazapi/instance/privacy?channel_id=${encodeURIComponent(channelId)}`);
      const data = await r.json();
      if (r.ok && typeof data === "object") setPrivacy(data);
    } catch {
      // ignore
    }
  };

  const fetchProxy = async () => {
    try {
      const r = await fetch(`/api/uazapi/instance/proxy?channel_id=${encodeURIComponent(channelId)}`);
      const data = await r.json();
      if (r.ok) {
        setProxyEnabled(data?.enabled ?? false);
        setProxyUrl(data?.proxy_url ?? "");
      }
    } catch {
      // ignore
    }
  };

  const fetchWebhook = async () => {
    try {
      const r = await fetch(`/api/uazapi/instance/webhook?channel_id=${encodeURIComponent(channelId)}`);
      const data = await r.json();
      if (r.ok && Array.isArray(data) && data[0]) {
        const w = data[0];
        setWebhookUrl(w.url ?? "");
        setWebhookEvents(Array.isArray(w.events) ? w.events : []);
        setWebhookExclude(Array.isArray(w.excludeMessages) ? w.excludeMessages : []);
      }
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

  const saveProxy = async () => {
    setSaving(true);
    setError("");
    try {
      const r = await fetch("/api/uazapi/instance/proxy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          channel_id: channelId,
          enable: proxyEnabled,
          proxy_url: proxyEnabled ? proxyUrl : undefined,
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

  const saveDelay = async () => {
    setSaving(true);
    setError("");
    try {
      const r = await fetch("/api/uazapi/instance/delay", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          channel_id: channelId,
          msg_delay_min: delayMin,
          msg_delay_max: delayMax,
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

  const saveWebhook = async () => {
    setSaving(true);
    setError("");
    try {
      const r = await fetch("/api/uazapi/instance/webhook", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          channel_id: channelId,
          url: webhookUrl.trim(),
          events: webhookEvents.length ? webhookEvents : ["messages", "connection"],
          excludeMessages: webhookExclude.length ? webhookExclude : ["wasSentByApi"],
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

  const handleSave = () => {
    switch (activeTab) {
      case "perfil":
        saveProfile();
        break;
      case "privacidade":
        savePrivacy();
        break;
      case "proxy":
        saveProxy();
        break;
      case "delay":
        saveDelay();
        break;
      case "chatbot":
        saveChatbot();
        break;
      case "webhook":
        saveWebhook();
        break;
      case "presenca":
        savePresence();
        break;
    }
  };

  const tabs: { id: TabId; icon: React.ReactNode }[] = [
    { id: "perfil", icon: <User className="h-4 w-4" /> },
    { id: "privacidade", icon: <Shield className="h-4 w-4" /> },
    { id: "proxy", icon: <Wifi className="h-4 w-4" /> },
    { id: "delay", icon: <Clock className="h-4 w-4" /> },
    { id: "chatbot", icon: <Bot className="h-4 w-4" /> },
    { id: "webhook", icon: <Webhook className="h-4 w-4" /> },
    { id: "presenca", icon: <Radio className="h-4 w-4" /> },
  ];

  const PRIVACY_OPTIONS: { key: string; label: string; options: string[] }[] = [
    { key: "groupadd", label: "Quem pode adicionar aos grupos", options: ["all", "contacts", "contact_blacklist", "none"] },
    { key: "last", label: "Quem pode ver visto por último", options: ["all", "contacts", "contact_blacklist", "none"] },
    { key: "status", label: "Quem pode ver status", options: ["all", "contacts", "contact_blacklist", "none"] },
    { key: "profile", label: "Quem pode ver foto de perfil", options: ["all", "contacts", "contact_blacklist", "none"] },
    { key: "readreceipts", label: "Confirmação de leitura", options: ["all", "none"] },
    { key: "online", label: "Status online", options: ["all", "match_last_seen"] },
    { key: "calladd", label: "Quem pode fazer chamadas", options: ["all", "known"] },
  ];

  return (
    <SideOver
      open={open}
      onClose={onClose}
      title={`Configurar: ${channelName}`}
      width={520}
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

        {/* Perfil */}
        {activeTab === "perfil" && (
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-[#334155] mb-1">Nome do perfil WhatsApp (max 25)</label>
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
              <label className="block text-sm font-medium text-[#334155] mb-1">Imagem (URL ou base64)</label>
              <input
                type="text"
                value={profileImage}
                onChange={(e) => setProfileImage(e.target.value)}
                placeholder="https://... ou data:image/... ou remove"
                className="w-full rounded-lg border border-[#E2E8F0] px-3 py-2 text-[#1E293B] focus:border-clicvend-orange focus:outline-none focus:ring-1 focus:ring-clicvend-orange"
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
                    <option key={o} value={o}>{o}</option>
                  ))}
                </select>
              </div>
            ))}
          </div>
        )}

        {/* Proxy */}
        {activeTab === "proxy" && (
          <div className="space-y-4">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={proxyEnabled}
                onChange={(e) => setProxyEnabled(e.target.checked)}
                className="rounded border-[#E2E8F0] text-clicvend-orange focus:ring-clicvend-orange"
              />
              <span className="text-sm font-medium text-[#334155]">Usar proxy próprio</span>
            </label>
            {proxyEnabled && (
              <div>
                <label className="block text-sm font-medium text-[#334155] mb-1">URL do proxy</label>
                <input
                  type="text"
                  value={proxyUrl}
                  onChange={(e) => setProxyUrl(e.target.value)}
                  placeholder="http://user:pass@host:port"
                  className="w-full rounded-lg border border-[#E2E8F0] px-3 py-2 text-[#1E293B] focus:border-clicvend-orange focus:outline-none focus:ring-1 focus:ring-clicvend-orange"
                />
              </div>
            )}
          </div>
        )}

        {/* Delay */}
        {activeTab === "delay" && (
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-[#334155] mb-1">Delay mínimo (segundos)</label>
              <input
                type="number"
                min={0}
                value={delayMin}
                onChange={(e) => setDelayMin(parseInt(e.target.value, 10) || 0)}
                className="w-full rounded-lg border border-[#E2E8F0] px-3 py-2 text-[#1E293B] focus:border-clicvend-orange focus:outline-none focus:ring-1 focus:ring-clicvend-orange"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-[#334155] mb-1">Delay máximo (segundos)</label>
              <input
                type="number"
                min={0}
                value={delayMax}
                onChange={(e) => setDelayMax(parseInt(e.target.value, 10) || 0)}
                className="w-full rounded-lg border border-[#E2E8F0] px-3 py-2 text-[#1E293B] focus:border-clicvend-orange focus:outline-none focus:ring-1 focus:ring-clicvend-orange"
              />
            </div>
          </div>
        )}

        {/* Chatbot */}
        {activeTab === "chatbot" && (
          <div className="space-y-4">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={chatbotEnabled}
                onChange={(e) => setChatbotEnabled(e.target.checked)}
                className="rounded border-[#E2E8F0] text-clicvend-orange focus:ring-clicvend-orange"
              />
              <span className="text-sm font-medium text-[#334155]">Chatbot habilitado</span>
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
              <label className="block text-sm font-medium text-[#334155] mb-1">Palavra para parar conversa</label>
              <input
                type="text"
                value={chatbotStopWord}
                onChange={(e) => setChatbotStopWord(e.target.value)}
                placeholder="Ex: parar"
                className="w-full rounded-lg border border-[#E2E8F0] px-3 py-2 text-[#1E293B] focus:border-clicvend-orange focus:outline-none focus:ring-1 focus:ring-clicvend-orange"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-[#334155] mb-1">Minutos pausado após parar</label>
              <input
                type="number"
                min={0}
                value={chatbotStopMinutes}
                onChange={(e) => setChatbotStopMinutes(parseInt(e.target.value, 10) || 0)}
                className="w-full rounded-lg border border-[#E2E8F0] px-3 py-2 text-[#1E293B] focus:border-clicvend-orange focus:outline-none focus:ring-1 focus:ring-clicvend-orange"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-[#334155] mb-1">Minutos pausado ao enviar msg manual</label>
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

        {/* Webhook */}
        {activeTab === "webhook" && (
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-[#334155] mb-1">URL do webhook</label>
              <input
                type="url"
                value={webhookUrl}
                onChange={(e) => setWebhookUrl(e.target.value)}
                placeholder="https://..."
                className="w-full rounded-lg border border-[#E2E8F0] px-3 py-2 text-[#1E293B] focus:border-clicvend-orange focus:outline-none focus:ring-1 focus:ring-clicvend-orange"
              />
            </div>
            <p className="text-xs text-[#64748B]">
              Use excludeMessages: wasSentByApi para evitar loops.
            </p>
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
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="inline-flex items-center gap-2 rounded-lg bg-clicvend-orange px-4 py-2 text-sm font-medium text-white hover:bg-clicvend-orange-dark disabled:opacity-60"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Salvar
          </button>
        </div>
      </div>
    </SideOver>
  );
}
