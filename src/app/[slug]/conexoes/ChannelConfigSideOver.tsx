"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { SideOver } from "@/components/SideOver";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { Loader2, User, Shield, Bot, Radio, Upload, ImageIcon, Link2, Star, Trash2 } from "lucide-react";

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
  channelQueueId?: string | null;
  queues?: { id: string; name: string; slug: string }[];
  companySlug?: string;
  onSaved?: () => void;
};

export function ChannelConfigSideOver({
  open,
  onClose,
  channelId,
  channelName,
  channelQueueId,
  queues = [],
  companySlug = "",
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

  // Chatbot – Triggers e QuickReplies
  type Trigger = {
    id?: string;
    active?: boolean;
    type?: "agent" | "quickreply" | "flow" | string;
    agent_id?: string;
    quickreply_id?: string;
    flow_id?: string;
    wordsToStart?: string;
    priority?: number;
    ignoreGroups?: boolean;
  };

  type QuickReply = {
    id?: string;
    shortCut: string;
    text?: string;
    type?: string;
    onWhatsApp?: boolean;
  };

  const [triggers, setTriggers] = useState<Trigger[]>([]);
  const [quickReplies, setQuickReplies] = useState<QuickReply[]>([]);
  const [chatbotLoading, setChatbotLoading] = useState(false);
  const [chatbotInnerSaving, setChatbotInnerSaving] = useState(false);
  const [newTrigger, setNewTrigger] = useState<{
    wordsToStart: string;
    quickreplyId: string;
    priority: number;
  }>({ wordsToStart: "", quickreplyId: "", priority: 0 });
  const [newQuickReply, setNewQuickReply] = useState<{
    shortCut: string;
    text: string;
  }>({ shortCut: "", text: "" });

  // Presença
  const [presence, setPresence] = useState<"available" | "unavailable">("available");

  // Conectar
  const [connectStatus, setConnectStatus] = useState<"connected" | "connecting" | "disconnected" | null>(null);
  const onSavedRef = useRef(onSaved);
  const onCloseRef = useRef(onClose);
  const hasAutoSyncedRef = useRef(false);
  onSavedRef.current = onSaved;
  onCloseRef.current = onClose;
  const [qrcode, setQrcode] = useState<string | null>(null);
  const [paircode, setPaircode] = useState<string | null>(null);
  const [connectLoading, setConnectLoading] = useState(false);

  const [queueId, setQueueId] = useState<string>(channelQueueId ?? "");
  const [queueSaving, setQueueSaving] = useState(false);
  const [removeQueueConfirm, setRemoveQueueConfirm] = useState<{ queue_id: string; queue_name: string } | null>(null);
  const apiHeaders = companySlug ? { "X-Company-Slug": companySlug } : undefined;
  const [channelQueues, setChannelQueues] = useState<Array<{ queue_id: string; is_default: boolean; queue: { id: string; name: string; slug: string } | null }>>([]);
  const [channelQueuesLoading, setChannelQueuesLoading] = useState(false);
  const [addQueueId, setAddQueueId] = useState("");
  useEffect(() => {
    setQueueId(channelQueueId ?? "");
  }, [channelQueueId, open]);

  const fetchChannelQueues = useCallback(async () => {
    if (!channelId) return;
    setChannelQueuesLoading(true);
    try {
      const r = await fetch(`/api/channels/${encodeURIComponent(channelId)}/queues`, { credentials: "include", headers: apiHeaders });
      const data = await r.json();
      if (r.ok && Array.isArray(data)) setChannelQueues(data);
    } catch {
      setChannelQueues([]);
    } finally {
      setChannelQueuesLoading(false);
    }
  }, [channelId]);

  useEffect(() => {
    if (open && channelId) fetchChannelQueues();
  }, [open, channelId, fetchChannelQueues]);

  const fetchConnectStatus = useCallback(async () => {
    try {
      const r = await fetch(`/api/uazapi/instance/status?channel_id=${encodeURIComponent(channelId)}`, { credentials: "include", headers: apiHeaders });
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
    hasAutoSyncedRef.current = false;
    fetchConnectStatus();
    fetchPrivacy();
  }, [open, channelId, fetchConnectStatus]);

  // Não disparar sync de histórico ao abrir o sidebar (fluxo é só fila por chamado;
  // histórico só quando o usuário clicar em "Sincronizar histórico" no painel).
  // useEffect(() => {
  //   if (!open || !channelId || connectStatus !== "connected" || hasAutoSyncedRef.current) return;
  //   hasAutoSyncedRef.current = true;
  //   const base = companySlug ? `/${companySlug}` : "";
  //   fetch(`/api/channels/${channelId}/sync-history`, {
  //     method: "POST",
  //     credentials: "include",
  //     headers: base ? { "X-Company-Slug": companySlug } : undefined,
  //   })
  //     .then(() => onSavedRef.current?.())
  //     .catch(() => {});
  // }, [open, channelId, connectStatus, companySlug]);

  useEffect(() => {
    if (!open || activeTab !== "chatbot" || !channelId) return;
    const load = async () => {
      setChatbotLoading(true);
      try {
        const [tRes, qRes] = await Promise.all([
          fetch(`/api/uazapi/trigger?channel_id=${encodeURIComponent(channelId)}`, { credentials: "include", headers: apiHeaders }),
          fetch(`/api/uazapi/quickreply?channel_id=${encodeURIComponent(channelId)}`, { credentials: "include", headers: apiHeaders }),
        ]);
        const tData = await tRes.json();
        const qData = await qRes.json();
        if (tRes.ok && Array.isArray(tData)) setTriggers(tData);
        if (qRes.ok && Array.isArray(qData)) setQuickReplies(qData);
      } catch {
        // silencioso; erro geral já vai para setError em ações específicas
      } finally {
        setChatbotLoading(false);
      }
    };
    load();
  }, [open, activeTab, channelId]);

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
        onSavedRef.current?.();
        onCloseRef.current?.();
        return;
      }
      setTimeout(poll, 2500);
    };
    const t = setTimeout(poll, 2500);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [open, activeTab, connectStatus, channelId, fetchConnectStatus]);

  const fetchPrivacy = async () => {
    try {
      const r = await fetch(`/api/uazapi/instance/privacy?channel_id=${encodeURIComponent(channelId)}`, { credentials: "include", headers: apiHeaders });
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
        headers: { "Content-Type": "application/json", ...apiHeaders },
        body: JSON.stringify(body),
        credentials: "include",
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
        headers: { "Content-Type": "application/json", ...apiHeaders },
        body: JSON.stringify({ channel_id: channelId, ...privacy }),
        credentials: "include",
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
        headers: { "Content-Type": "application/json", ...apiHeaders },
        body: JSON.stringify({
          channel_id: channelId,
          chatbot_enabled: chatbotEnabled,
          chatbot_ignoreGroups: chatbotIgnoreGroups,
          chatbot_stopConversation: chatbotStopWord || undefined,
          chatbot_stopMinutes: chatbotStopMinutes,
          chatbot_stopWhenYouSendMsg: chatbotStopWhenSend,
        }),
        credentials: "include",
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

  const handleCreateTrigger = async () => {
    if (!newTrigger.wordsToStart.trim() || !newTrigger.quickreplyId) {
      setError("Informe palavras-chave e selecione uma resposta rápida.");
      return;
    }
    setChatbotInnerSaving(true);
    setError("");
    try {
      const r = await fetch("/api/uazapi/trigger", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...apiHeaders },
        body: JSON.stringify({
          channel_id: channelId,
          trigger: {
            active: true,
            type: "quickreply",
            quickreply_id: newTrigger.quickreplyId,
            wordsToStart: newTrigger.wordsToStart,
            priority: newTrigger.priority,
            ignoreGroups: chatbotIgnoreGroups,
          },
        }),
        credentials: "include",
      });
      const data = await r.json();
      if (!r.ok) {
        setError(data?.error ?? "Falha ao criar trigger");
        setChatbotInnerSaving(false);
        return;
      }
      // Recarregar lista
      const tRes = await fetch(`/api/uazapi/trigger?channel_id=${encodeURIComponent(channelId)}`, { credentials: "include", headers: apiHeaders });
      const tData = await tRes.json();
      if (tRes.ok && Array.isArray(tData)) setTriggers(tData);
      setNewTrigger({ wordsToStart: "", quickreplyId: "", priority: 0 });
    } catch {
      setError("Erro de rede ao criar trigger");
    }
    setChatbotInnerSaving(false);
  };

  const handleCreateQuickReply = async () => {
    if (!newQuickReply.shortCut.trim() || !newQuickReply.text.trim()) {
      setError("Informe atalho e texto da resposta rápida.");
      return;
    }
    setChatbotInnerSaving(true);
    setError("");
    try {
      const r = await fetch("/api/uazapi/quickreply", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...apiHeaders },
        body: JSON.stringify({
          channel_id: channelId,
          shortCut: newQuickReply.shortCut.trim(),
          type: "text",
          text: newQuickReply.text,
        }),
        credentials: "include",
      });
      const data = await r.json();
      if (!r.ok) {
        setError(data?.error ?? "Falha ao criar resposta rápida");
        setChatbotInnerSaving(false);
        return;
      }
      const qRes = await fetch(`/api/uazapi/quickreply?channel_id=${encodeURIComponent(channelId)}`, { credentials: "include", headers: apiHeaders });
      const qData = await qRes.json();
      if (qRes.ok && Array.isArray(qData)) setQuickReplies(qData);
      setNewQuickReply({ shortCut: "", text: "" });
    } catch {
      setError("Erro de rede ao criar resposta rápida");
    }
    setChatbotInnerSaving(false);
  };

  const savePresence = async () => {
    setSaving(true);
    setError("");
    try {
      const r = await fetch("/api/uazapi/instance/presence", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...apiHeaders },
        body: JSON.stringify({ channel_id: channelId, presence }),
        credentials: "include",
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
        headers: { "Content-Type": "application/json", ...apiHeaders },
        body: JSON.stringify({ channel_id: channelId }),
        credentials: "include",
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

  const MAX_IMAGE_SIZE = 5 * 1024 * 1024; // 5MB
  const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/gif", "image/webp"];
  const [uploadingImage, setUploadingImage] = useState(false);
  const handleImageUpload = useCallback(async (file: File) => {
    const type = file.type?.toLowerCase();
    if (!type || !ALLOWED_IMAGE_TYPES.includes(type)) {
      setError("Use JPEG, PNG, GIF ou WebP.");
      return;
    }
    if (file.size > MAX_IMAGE_SIZE) {
      setError("Imagem muito grande. Máximo 5MB.");
      return;
    }
    setUploadingImage(true);
    setError("");
    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = () => reject(new Error("Falha ao ler arquivo"));
        reader.readAsDataURL(file);
      });
      setProfileImage(dataUrl);
    } catch {
      setError("Erro ao ler imagem. Tente outra ou use uma URL.");
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

  const doRemoveQueue = async () => {
    const q = removeQueueConfirm;
    if (!q) return;
    setRemoveQueueConfirm(null);
    setError("");
    try {
      const r = await fetch(`/api/channels/${encodeURIComponent(channelId)}/queues`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json", ...apiHeaders },
        body: JSON.stringify({ queue_id: q.queue_id }),
        credentials: "include",
      });
      if (r.ok) {
        fetchChannelQueues();
        onSaved?.();
      } else {
        const d = await r.json();
        setError(d?.error ?? "Falha ao remover");
      }
    } catch {
      setError("Erro de rede");
    }
  };

  return (
    <>
    <SideOver
      open={open}
      onClose={onClose}
      title={`Configurar: ${channelName}`}
      width={880}
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

        <div className="rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] px-4 py-3 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-[#334155]">Caixas de entrada (até 8)</h3>
              {channelQueuesLoading && <Loader2 className="h-4 w-4 animate-spin text-clicvend-orange" />}
            </div>
            <p className="text-xs text-[#64748B]">Novas conversas deste número entram na caixa padrão. Vincule até 8 caixas e escolha qual é a padrão.</p>

            {channelQueues.length > 0 ? (
              <ul className="space-y-2">
                {channelQueues.map((cq) => (
                  <li
                    key={cq.queue_id}
                    className="flex items-center justify-between gap-2 rounded-lg border border-[#E2E8F0] bg-white px-3 py-2"
                  >
                    <span className="text-sm font-medium text-[#1E293B]">
                      {cq.queue?.name ?? cq.queue_id}
                      {cq.is_default && (
                        <span className="ml-2 inline-flex items-center gap-1 rounded bg-clicvend-orange/15 px-1.5 py-0.5 text-xs font-medium text-clicvend-orange">
                          <Star className="h-3 w-3 fill-current" /> Padrão
                        </span>
                      )}
                    </span>
                    <div className="flex items-center gap-1">
                      {!cq.is_default && (
                        <button
                          type="button"
                          onClick={async () => {
                            setError("");
                            try {
                              const r = await fetch(`/api/channels/${encodeURIComponent(channelId)}/queues`, {
                                method: "PATCH",
                                headers: { "Content-Type": "application/json", ...apiHeaders },
                                body: JSON.stringify({ queue_id: cq.queue_id, is_default: true }),
                                credentials: "include",
                              });
                              if (r.ok) {
                                fetchChannelQueues();
                                onSaved?.();
                              } else {
                                const d = await r.json();
                                setError(d?.error ?? "Falha ao definir padrão");
                              }
                            } catch {
                              setError("Erro de rede");
                            }
                          }}
                          className="rounded p-1.5 text-[#64748B] hover:bg-[#F1F5F9] hover:text-clicvend-orange"
                          title="Definir como padrão"
                        >
                          <Star className="h-4 w-4" />
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => setRemoveQueueConfirm({ queue_id: cq.queue_id, queue_name: cq.queue?.name ?? cq.queue_id })}
                        className="rounded p-1.5 text-[#64748B] hover:bg-red-50 hover:text-red-600"
                        title="Remover caixa"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-[#94A3B8]">Nenhuma caixa vinculada. Adicione abaixo.</p>
            )}

            {channelQueues.length < 8 && queues.length > 0 && (
              <div className="flex flex-wrap items-end gap-2 border-t border-[#E2E8F0] pt-2">
                <select
                  value={addQueueId}
                  onChange={(e) => setAddQueueId(e.target.value)}
                  className="flex-1 min-w-[160px] rounded-lg border border-[#E2E8F0] px-3 py-2 text-sm text-[#1E293B] focus:border-clicvend-orange focus:outline-none focus:ring-1 focus:ring-clicvend-orange"
                >
                  <option value="">Selecionar caixa…</option>
                  {queues
                    .filter((q) => !channelQueues.some((cq) => cq.queue_id === q.id))
                    .map((q) => (
                      <option key={q.id} value={q.id}>{q.name}</option>
                    ))}
                </select>
                <button
                  type="button"
                  disabled={!addQueueId || queueSaving}
                  onClick={async () => {
                    if (!addQueueId) return;
                    setQueueSaving(true);
                    setError("");
                    try {
                      const r = await fetch(`/api/channels/${encodeURIComponent(channelId)}/queues`, {
                        method: "POST",
                        headers: { "Content-Type": "application/json", ...apiHeaders },
                        body: JSON.stringify({
                          queue_id: addQueueId,
                          is_default: channelQueues.length === 0,
                        }),
                        credentials: "include",
                      });
                      const data = await r.json();
                      if (r.ok) {
                        fetchChannelQueues();
                        setAddQueueId("");
                        onSaved?.();
                      } else {
                        setError(data?.error ?? "Falha ao adicionar caixa");
                      }
                    } catch {
                      setError("Erro de rede");
                    }
                    setQueueSaving(false);
                  }}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-clicvend-orange px-3 py-2 text-sm font-medium text-white hover:bg-clicvend-orange-dark disabled:opacity-60"
                >
                  {queueSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                  Adicionar caixa
                </button>
              </div>
            )}
          </div>
        {/* Conectar */}
        {activeTab === "conectar" && (
          <div className="space-y-4">
            {connectStatus === "connected" ? (
              <div className="space-y-3">
                <div className="rounded-lg bg-[#DCFCE7] p-4 text-center">
                  <p className="font-medium text-[#16A34A]">WhatsApp conectado</p>
                  <p className="mt-1 text-sm text-[#64748B]">Este número já está vinculado e pronto para receber mensagens. Novas mensagens e grupos entram automaticamente nas filas. Ao abrir esta tela, as conversas antigas deste número são sincronizadas em segundo plano.</p>
                </div>
                <p className="text-xs text-[#64748B]">Para forçar de novo o histórico antigo, use o botão abaixo. Pode levar até 2 minutos.</p>
                <button
                  type="button"
                  onClick={async () => {
                    setLoading(true);
                    setError("");
                    const ctrl = new AbortController();
                    const timeoutId = setTimeout(() => ctrl.abort(), 120_000);
                    try {
                      const base = companySlug ? `/${companySlug}` : "";
                      const r = await fetch(`/api/channels/${channelId}/sync-history`, {
                        method: "POST",
                        credentials: "include",
                        headers: base ? { "X-Company-Slug": companySlug } : undefined,
                        signal: ctrl.signal,
                      });
                      clearTimeout(timeoutId);
                      const j = await r.json().catch(() => ({}));
                      if (!r.ok) {
                        setError(j?.error ?? "Falha ao sincronizar histórico");
                        return;
                      }
                      onSaved?.();
                    } catch (e) {
                      clearTimeout(timeoutId);
                      if ((e as Error)?.name === "AbortError") {
                        setError("Demorou mais que 2 min. Novas mensagens já entram sozinhas pelo WhatsApp.");
                      } else {
                        setError("Falha ao sincronizar histórico");
                      }
                    } finally {
                      setLoading(false);
                    }
                  }}
                  disabled={loading}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-[#E2E8F0] bg-white px-4 py-2.5 text-sm font-medium text-[#334155] hover:bg-[#F8FAFC] disabled:opacity-60"
                >
                  {loading ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Sincronizando…
                    </>
                  ) : (
                    "Sincronizar histórico de mensagens"
                  )}
                </button>
                {error && <p className="text-sm text-red-600">{error}</p>}
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
          <div className="space-y-6">
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

            <div className="pt-2 border-t border-[#E2E8F0] space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-[#0F172A]">Triggers de respostas automáticas</h3>
                {chatbotLoading && <Loader2 className="h-4 w-4 animate-spin text-clicvend-orange" />}
              </div>
              <p className="text-xs text-[#64748B]">
                Quando o cliente enviar uma das palavras abaixo, a UAZAPI enviará automaticamente a resposta rápida escolhida.
              </p>

              {triggers.length > 0 ? (
                <div className="max-h-56 overflow-auto rounded-lg border border-[#E2E8F0]">
                  <table className="min-w-full text-xs">
                    <thead className="bg-[#F8FAFC] text-[#64748B]">
                      <tr>
                        <th className="px-3 py-2 text-left font-medium">Ativo</th>
                        <th className="px-3 py-2 text-left font-medium">Palavras-chave</th>
                        <th className="px-3 py-2 text-left font-medium">Tipo</th>
                        <th className="px-3 py-2 text-left font-medium">Prioridade</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#E2E8F0]">
                      {triggers.map((t) => (
                        <tr key={t.id ?? `${t.type}-${t.wordsToStart}-${t.quickreply_id}`}>
                          <td className="px-3 py-2">
                            <span
                              className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium ${
                                t.active ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"
                              }`}
                            >
                              {t.active ? "Ativo" : "Inativo"}
                            </span>
                          </td>
                          <td className="px-3 py-2 text-[#0F172A] break-words max-w-[220px]">
                            {t.wordsToStart || "—"}
                          </td>
                          <td className="px-3 py-2 text-[#64748B]">
                            {t.type === "quickreply" ? "QuickReply" : t.type === "agent" ? "Agente IA" : t.type ?? "—"}
                          </td>
                          <td className="px-3 py-2 text-[#64748B]">{t.priority ?? 0}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="text-xs text-[#94A3B8]">Nenhum trigger configurado ainda.</p>
              )}

              <div className="rounded-lg border border-dashed border-[#CBD5E1] bg-[#F8FAFC] p-3 space-y-3">
                <p className="text-xs font-medium text-[#0F172A]">Novo trigger (QuickReply)</p>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                  <div className="md:col-span-2">
                    <label className="block text-[11px] font-medium text-[#64748B] mb-1">
                      Palavras-chave (separadas por | )
                    </label>
                    <input
                      type="text"
                      value={newTrigger.wordsToStart}
                      onChange={(e) =>
                        setNewTrigger((cur) => ({ ...cur, wordsToStart: e.target.value }))
                      }
                      placeholder="Ex: ola|bom dia|atendimento"
                      className="w-full rounded-lg border border-[#E2E8F0] px-2 py-1.5 text-xs text-[#1E293B] focus:border-clicvend-orange focus:outline-none focus:ring-1 focus:ring-clicvend-orange"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-medium text-[#64748B] mb-1">
                      Prioridade
                    </label>
                    <input
                      type="number"
                      value={newTrigger.priority}
                      onChange={(e) =>
                        setNewTrigger((cur) => ({
                          ...cur,
                          priority: Number.isNaN(parseInt(e.target.value, 10))
                            ? 0
                            : parseInt(e.target.value, 10),
                        }))
                      }
                      className="w-full rounded-lg border border-[#E2E8F0] px-2 py-1.5 text-xs text-[#1E293B] focus:border-clicvend-orange focus:outline-none focus:ring-1 focus:ring-clicvend-orange"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-2 items-end">
                  <div className="md:col-span-2">
                    <label className="block text-[11px] font-medium text-[#64748B] mb-1">
                      Resposta rápida a enviar
                    </label>
                    <select
                      value={newTrigger.quickreplyId}
                      onChange={(e) =>
                        setNewTrigger((cur) => ({ ...cur, quickreplyId: e.target.value }))
                      }
                      className="w-full rounded-lg border border-[#E2E8F0] px-2 py-1.5 text-xs text-[#1E293B] focus:border-clicvend-orange focus:outline-none focus:ring-1 focus:ring-clicvend-orange"
                    >
                      <option value="">Selecione uma resposta rápida…</option>
                      {quickReplies.map((qr) => (
                        <option key={qr.id ?? qr.shortCut} value={qr.id}>
                          {qr.shortCut} {qr.text ? `– ${qr.text.slice(0, 40)}` : ""}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="flex md:justify-end">
                    <button
                      type="button"
                      onClick={handleCreateTrigger}
                      disabled={chatbotInnerSaving}
                      className="inline-flex w-full md:w-auto items-center justify-center gap-1.5 rounded-lg bg-clicvend-orange px-3 py-1.5 text-xs font-medium text-white hover:bg-clicvend-orange-dark disabled:opacity-60"
                    >
                      {chatbotInnerSaving ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
                      Adicionar trigger
                    </button>
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <h3 className="text-sm font-semibold text-[#0F172A]">Respostas rápidas (QuickReply)</h3>
                {quickReplies.length > 0 ? (
                  <div className="max-h-40 overflow-auto rounded-lg border border-[#E2E8F0]">
                    <table className="min-w-full text-xs">
                      <thead className="bg-[#F8FAFC] text-[#64748B]">
                        <tr>
                          <th className="px-3 py-2 text-left font-medium">Atalho</th>
                          <th className="px-3 py-2 text-left font-medium">Texto</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#E2E8F0]">
                        {quickReplies.map((qr) => (
                          <tr key={qr.id ?? qr.shortCut}>
                            <td className="px-3 py-2 text-[#0F172A]">{qr.shortCut}</td>
                            <td className="px-3 py-2 text-[#64748B]">
                              {qr.text ? qr.text.slice(0, 80) : "—"}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p className="text-xs text-[#94A3B8]">
                    Nenhuma resposta rápida cadastrada ainda.
                  </p>
                )}

                <div className="rounded-lg border border-dashed border-[#CBD5E1] bg-[#F8FAFC] p-3 space-y-3">
                  <p className="text-xs font-medium text-[#0F172A]">Nova resposta rápida</p>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                    <div>
                      <label className="block text-[11px] font-medium text-[#64748B] mb-1">
                        Atalho
                      </label>
                      <input
                        type="text"
                        value={newQuickReply.shortCut}
                        onChange={(e) =>
                          setNewQuickReply((cur) => ({ ...cur, shortCut: e.target.value }))
                        }
                        placeholder="Ex: saudacao1"
                        className="w-full rounded-lg border border-[#E2E8F0] px-2 py-1.5 text-xs text-[#1E293B] focus:border-clicvend-orange focus:outline-none focus:ring-1 focus:ring-clicvend-orange"
                      />
                    </div>
                    <div className="md:col-span-2">
                      <label className="block text-[11px] font-medium text-[#64748B] mb-1">
                        Texto
                      </label>
                      <input
                        type="text"
                        value={newQuickReply.text}
                        onChange={(e) =>
                          setNewQuickReply((cur) => ({ ...cur, text: e.target.value }))
                        }
                        placeholder="Ex: Olá! Como posso ajudar hoje?"
                        className="w-full rounded-lg border border-[#E2E8F0] px-2 py-1.5 text-xs text-[#1E293B] focus:border-clicvend-orange focus:outline-none focus:ring-1 focus:ring-clicvend-orange"
                      />
                    </div>
                  </div>
                  <div className="flex md:justify-end">
                    <button
                      type="button"
                      onClick={handleCreateQuickReply}
                      disabled={chatbotInnerSaving}
                      className="inline-flex w-full md:w-auto items-center justify-center gap-1.5 rounded-lg bg-clicvend-orange px-3 py-1.5 text-xs font-medium text-white hover:bg-clicvend-orange-dark disabled:opacity-60"
                    >
                      {chatbotInnerSaving ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
                      Adicionar resposta rápida
                    </button>
                  </div>
                </div>
              </div>
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
    <ConfirmDialog
      open={!!removeQueueConfirm}
      onClose={() => setRemoveQueueConfirm(null)}
      title="Remover caixa"
      message={removeQueueConfirm ? `Remover a caixa "${removeQueueConfirm.queue_name}" deste número?` : ""}
      confirmLabel="Remover"
      cancelLabel="Cancelar"
      variant="danger"
      onConfirm={doRemoveQueue}
      onCancel={() => setRemoveQueueConfirm(null)}
    />
    </>
  );
}
