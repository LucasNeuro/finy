"use client";

import { usePathname, useRouter } from "next/navigation";
import { useState, useEffect, useCallback, useRef } from "react";
import useSWR from "swr";
import { ArrowLeft, Send, Search, ArrowRightLeft, MoreVertical, CheckCheck, Phone, User, Paperclip, Mic, Square, Archive, ArchiveX, Bell, BellOff, Pin, PinOff, Trash2, Check } from "lucide-react";
import { SideOver } from "@/components/SideOver";
import { ChatThreadSkeleton } from "@/components/Skeleton";
import { Loader2 } from "lucide-react";

type Message = {
  id: string;
  direction: "in" | "out";
  content: string;
  sent_at: string;
  message_type?: string;
  media_url?: string | null;
  caption?: string | null;
  file_name?: string | null;
};

type ConversationDetail = {
  id: string;
  channel_id: string | null;
  external_id: string;
  wa_chat_jid: string | null;
  kind?: string;
  is_group?: boolean;
  customer_phone: string;
  customer_name: string | null;
  queue_id: string | null;
  assigned_to: string | null;
  channel_name?: string | null;
  queue_name?: string | null;
  assigned_to_name?: string | null;
  contact_avatar_url?: string | null;
  messages: Message[];
};

type ChatDetails = {
  name?: string;
  wa_name?: string;
  wa_contactName?: string;
  phone?: string;
  image?: string;
  imagePreview?: string;
  wa_isBlocked?: boolean;
  wa_isGroup?: boolean;
  common_groups?: string;
  lead_name?: string;
  lead_email?: string;
  lead_status?: string;
  lead_notes?: string;
  [key: string]: unknown;
};

function MessageBubble({ m, name }: { m: Message; name: string }) {
  const type = m.message_type ?? "text";
  const rawMediaUrl = m.media_url;
  const mediaUrl = rawMediaUrl && (rawMediaUrl.startsWith("http") || rawMediaUrl.startsWith("data:"))
    ? rawMediaUrl
    : rawMediaUrl
      ? (type === "image"
          ? `data:image/jpeg;base64,${rawMediaUrl}`
          : type === "audio" || type === "ptt"
            ? `data:audio/ogg;base64,${rawMediaUrl}`
            : type === "video"
              ? `data:video/mp4;base64,${rawMediaUrl}`
              : rawMediaUrl)
      : null;
  const caption = m.caption ?? m.content;

  return (
    <div
      className={`max-w-[80%] rounded-lg px-3 py-2 ${
        m.direction === "out"
          ? "bg-[#DCFCE7] text-[#1E293B]"
          : "bg-white border border-[#E2E8F0] text-[#1E293B]"
      }`}
    >
      <p className="text-xs font-medium text-[#64748B] mb-0.5">
        {m.direction === "out" ? "Você" : name}
      </p>
      {type === "image" && mediaUrl && (
        <div className="space-y-1">
          <a href={mediaUrl} target="_blank" rel="noopener noreferrer" className="block rounded overflow-hidden">
            <img src={mediaUrl} alt="" className="max-h-64 w-full object-contain rounded" />
          </a>
          {caption && caption !== "[image]" && <p className="whitespace-pre-wrap text-sm">{caption}</p>}
        </div>
      )}
      {type === "video" && mediaUrl && (
        <div className="space-y-1">
          <video src={mediaUrl} controls className="max-h-64 w-full rounded" />
          {caption && caption !== "[video]" && <p className="whitespace-pre-wrap text-sm">{caption}</p>}
        </div>
      )}
      {(type === "audio" || type === "ptt") && mediaUrl && (
        <div className="space-y-1">
          <audio src={mediaUrl} controls className="w-full max-w-sm" />
          {caption && caption !== "[audio]" && caption !== "[ptt]" && <p className="whitespace-pre-wrap text-sm">{caption}</p>}
        </div>
      )}
      {type === "document" && (
        <div className="space-y-1">
          {mediaUrl && (mediaUrl.startsWith("http") || mediaUrl.startsWith("data:")) ? (
            <a href={mediaUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 text-sm text-clicvend-orange hover:underline">
              📎 {m.file_name || "Documento"}
            </a>
          ) : (
            <span className="text-sm">📎 {m.file_name || caption || "Documento"}</span>
          )}
          {caption && caption !== "[document]" && m.file_name !== caption && <p className="whitespace-pre-wrap text-sm">{caption}</p>}
        </div>
      )}
      {type === "sticker" && mediaUrl && (
        <img src={mediaUrl} alt="" className="max-h-32 w-auto" />
      )}
      {(type === "text" || !mediaUrl) && (
        <p className="whitespace-pre-wrap text-sm">{m.content}</p>
      )}
      <div className="mt-1 flex items-center justify-end gap-1">
        <span className="text-xs text-[#64748B]">
          {new Date(m.sent_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
        </span>
        {m.direction === "out" && (
          <CheckCheck className="h-3.5 w-3.5 text-[#64748B]" aria-hidden />
        )}
      </div>
    </div>
  );
}

export default function ConversaThreadPage({
  params,
}: {
  params: { slug: string; id: string } | Promise<{ slug: string; id: string }>;
}) {
  const pathname = usePathname();
  const [resolvedParams, setResolvedParams] = useState<{ slug: string; id: string } | null>(null);
  const [conv, setConv] = useState<ConversationDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [sendValue, setSendValue] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [infoOpen, setInfoOpen] = useState(false);
  const [contactDetails, setContactDetails] = useState<ChatDetails | null>(null);
  const [contactDetailsLoading, setContactDetailsLoading] = useState(false);
  const [contactDetailsError, setContactDetailsError] = useState<string | null>(null);
  const [attachOpen, setAttachOpen] = useState(false);
  const [recording, setRecording] = useState(false);
  const [chatMenuOpen, setChatMenuOpen] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deleteOptions, setDeleteOptions] = useState({ deleteChatDB: true, deleteMessagesDB: true, deleteChatWhatsApp: false });
  const [chatActionLoading, setChatActionLoading] = useState<string | null>(null);
  const [canTransfer, setCanTransfer] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesScrollRef = useRef<HTMLDivElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const audioInputRef = useRef<HTMLInputElement>(null);
  const docInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const p = Promise.resolve(params);
    p.then((r) => setResolvedParams(r));
  }, [params]);

  const resolved =
    resolvedParams ??
    (typeof (params as { slug?: string; id?: string })?.id !== "undefined" ? (params as { slug: string; id: string }) : null);
  const slug = resolved?.slug ?? pathname?.split("/")[1] ?? "";
  const router = useRouter();
  const apiHeaders = slug ? { "X-Company-Slug": slug } : undefined;

  const { data: permissionsData } = useSWR<{ permissions?: string[] }>(
    slug ? ["/api/auth/permissions", slug] : null,
    ([url]) => fetch(url as string, { credentials: "include", headers: apiHeaders }).then((r) => r.json()),
    { revalidateOnFocus: false, dedupingInterval: 120_000 }
  );
  useEffect(() => {
    const perms = Array.isArray(permissionsData?.permissions) ? permissionsData.permissions : [];
    setCanTransfer(perms.includes("inbox.assign") || perms.includes("inbox.manage_tickets") || perms.includes("inbox.transfer"));
  }, [permissionsData?.permissions]);

  const fetchConversation = useCallback(async (id: string, options?: { silent?: boolean; skipCache?: boolean }) => {
    if (!options?.silent) {
      setLoading(true);
      setError(null);
    }
    try {
      const url = options?.skipCache ? `/api/conversations/${id}?skip_cache=1` : `/api/conversations/${id}`;
      const res = await fetch(url, {
        credentials: "include",
        headers: apiHeaders,
      });
      if (!res.ok) {
        if (!options?.silent) setConv(null);
        return;
      }
      const data = await res.json();
      setConv(data);
    } catch {
      if (!options?.silent) setConv(null);
    } finally {
      if (!options?.silent) setLoading(false);
    }
  }, [slug]);

  const claimAttemptedRef = useRef(false);
  const avatarFetchAttemptedRef = useRef<string | null>(null);
  const contactDetailsFetchedForRef = useRef<string | null>(null);

  useEffect(() => {
    if (!resolved?.id) return;
    fetchConversation(resolved.id, { skipCache: true });
  }, [resolved?.id, fetchConversation]);

  useEffect(() => {
    if (!conv?.messages?.length) return;
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [conv?.id, conv?.messages?.length]);

  useEffect(() => {
    if (!resolved?.id || !conv || claimAttemptedRef.current || conv.assigned_to != null) return;
    const perms = Array.isArray(permissionsData?.permissions) ? permissionsData.permissions : [];
    if (!perms.includes("inbox.claim")) return;
    claimAttemptedRef.current = true;
    fetch(`/api/conversations/${resolved.id}/claim`, {
      method: "POST",
      credentials: "include",
      headers: apiHeaders,
    })
      .then((r) => (r?.ok ? fetchConversation(resolved.id) : undefined))
      .catch(() => {});
  }, [resolved?.id, conv, permissionsData?.permissions, apiHeaders, fetchConversation]);

  useEffect(() => {
    if (!resolved?.id || !conv) return;
    const interval = setInterval(() => {
      fetchConversation(resolved.id, { silent: true });
    }, 45_000);
    return () => clearInterval(interval);
  }, [resolved?.id, conv, fetchConversation]);

  // Na aba Contatos a foto vem do chat-details (UAZAPI). No Chat usamos channel_contacts.avatar_url;
  // se estiver vazio, chamamos chat-details UMA VEZ por conversa para buscar e gravar no banco.
  useEffect(() => {
    if (!resolved?.id || !conv?.channel_id || conv.is_group) return;
    const hasAvatar = !!(conv.contact_avatar_url && conv.contact_avatar_url.trim());
    if (hasAvatar) return;
    if (avatarFetchAttemptedRef.current === conv.id) return;
    avatarFetchAttemptedRef.current = conv.id;
    const number = (conv.customer_phone || conv.external_id || "").replace(/\D/g, "").trim() || conv.external_id || conv.customer_phone;
    if (!number) return;
    fetch("/api/contacts/chat-details", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json", ...apiHeaders },
      body: JSON.stringify({
        channel_id: conv.channel_id,
        number,
        preview: true,
        conversation_id: resolved.id,
      }),
    })
      .then((r) => (r.ok ? fetchConversation(resolved.id) : undefined))
      .catch(() => {});
  }, [resolved?.id, conv?.id, conv?.channel_id, conv?.is_group, conv?.contact_avatar_url, conv?.customer_phone, conv?.external_id, apiHeaders, fetchConversation]);

  // Só busca detalhes do contato quando o painel ABRE ou quando troca de conversa — evita ficar batendo na API a cada refetch.
  useEffect(() => {
    if (!infoOpen) {
      setContactDetails(null);
      setContactDetailsError(null);
      contactDetailsFetchedForRef.current = null;
      return;
    }
    if (!conv?.channel_id || !conv?.id) return;
    if (contactDetailsFetchedForRef.current === conv.id) return;
    contactDetailsFetchedForRef.current = conv.id;
    setContactDetailsLoading(true);
    setContactDetailsError(null);
    setContactDetails(null);
    const number = conv.is_group && conv.wa_chat_jid
      ? conv.wa_chat_jid
      : (conv.customer_phone || conv.external_id || "").replace(/\D/g, "").trim() || conv.external_id || conv.customer_phone;
    if (!number) {
      setContactDetailsLoading(false);
      return;
    }
    fetch("/api/contacts/chat-details", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json", ...apiHeaders },
      body: JSON.stringify({ channel_id: conv.channel_id, number, preview: true, conversation_id: resolved?.id ?? undefined }),
    })
      .then(async (r) => {
        const data = await r.json();
        if (r.ok) setContactDetails(data);
        else setContactDetailsError(data?.error ?? "Falha ao carregar detalhes");
      })
      .catch(() => setContactDetailsError("Erro de rede"))
      .finally(() => setContactDetailsLoading(false));
  }, [infoOpen, conv?.id, conv?.channel_id, conv?.is_group, conv?.customer_phone, conv?.external_id, conv?.wa_chat_jid, apiHeaders, resolved?.id]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (chatMenuOpen && menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setChatMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [chatMenuOpen]);

  async function chatAction(
    action: "read" | "archive" | "mute" | "pin" | "delete",
    payload?: Record<string, unknown>
  ) {
    if (!resolved?.id) return;
    setChatActionLoading(action);
    setChatMenuOpen(false);
    try {
      const baseUrl = `/api/conversations/${resolved.id}/chat`;
      const method = "POST";
      const body = payload ?? {};
      let url = baseUrl;
      if (action === "read") url = `${baseUrl}/read`;
      else if (action === "archive") url = `${baseUrl}/archive`;
      else if (action === "mute") url = `${baseUrl}/mute`;
      else if (action === "pin") url = `${baseUrl}/pin`;
      else if (action === "delete") {
        url = `${baseUrl}/delete`;
        const res = await fetch(url, {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json", ...apiHeaders },
          body: JSON.stringify(body),
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          setError(err?.error ?? "Falha ao excluir");
          return;
        }
        router.push(`${base}/conversas`);
        return;
      }
      const res = await fetch(url, {
        method,
        credentials: "include",
        headers: { "Content-Type": "application/json", ...apiHeaders },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        setError(err?.error ?? `Falha em ${action}`);
        return;
      }
      await fetchConversation(resolved.id);
    } finally {
      setChatActionLoading(null);
    }
  }

  function openDeleteConfirm() {
    setChatMenuOpen(false);
    setDeleteOptions({ deleteChatDB: true, deleteMessagesDB: true, deleteChatWhatsApp: false });
    setDeleteConfirmOpen(true);
  }

  async function confirmDelete() {
    if (!resolved?.id) return;
    setChatActionLoading("delete");
    setDeleteConfirmOpen(false);
    try {
      const res = await fetch(`/api/conversations/${resolved.id}/chat/delete`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json", ...apiHeaders },
        body: JSON.stringify(deleteOptions),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        setError(err?.error ?? "Falha ao excluir");
        return;
      }
      router.push(`${base}/conversas`);
    } finally {
      setChatActionLoading(null);
    }
  }

  async function handleSend(e?: React.FormEvent, payload?: { type: string; file: string; caption?: string; docName?: string }) {
    e?.preventDefault();
    if (!resolved?.id || sending) return;
    const isMedia = payload && payload.type && payload.file;
    const text = sendValue.trim();
    if (!isMedia && !text) return;
    setSending(true);
    setError(null);
    try {
      const body = isMedia
        ? { type: payload!.type, file: payload!.file, caption: payload!.caption || "", docName: payload!.docName || "" }
        : { content: text };
      const res = await fetch(`/api/conversations/${resolved.id}/messages`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json", ...apiHeaders },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        setError(err?.error ?? "Falha ao enviar");
        return;
      }
      if (!isMedia) setSendValue("");
      await fetchConversation(resolved.id);
    } catch {
      setError("Falha ao enviar");
    } finally {
      setSending(false);
    }
  }

  function fileToBase64(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result as string;
        const base64 = result.includes(",") ? result.split(",")[1] : result;
        resolve(base64);
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  async function onFileChoose(type: "image" | "document" | "audio", e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !resolved?.id) return;
    e.target.value = "";
    setSending(true);
    setError(null);
    try {
      const base64 = await fileToBase64(file);
      const uazType = type === "image" ? "image" : type === "audio" ? "audio" : "document";
      await handleSend(undefined, {
        type: uazType,
        file: base64,
        docName: type === "document" ? file.name : undefined,
      });
    } catch {
      setError("Falha ao enviar arquivo");
    } finally {
      setSending(false);
    }
  }

  async function startRecording() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      const chunks: BlobPart[] = [];
      recorder.ondataavailable = (ev) => ev.data.size && chunks.push(ev.data);
      recorder.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunks, { type: "audio/ogg; codecs=opus" });
        const base64 = await new Promise<string>((res, rej) => {
          const r = new FileReader();
          r.onload = () => res((r.result as string).split(",")[1] || "");
          r.onerror = rej;
          r.readAsDataURL(blob);
        });
        if (base64 && resolved?.id) {
          setSending(true);
          try {
            const res = await fetch(`/api/conversations/${resolved.id}/messages`, {
              method: "POST",
              credentials: "include",
              headers: { "Content-Type": "application/json", ...apiHeaders },
              body: JSON.stringify({ type: "ptt", file: base64 }),
            });
            if (res.ok) await fetchConversation(resolved.id);
            else setError("Falha ao enviar áudio");
          } finally {
            setSending(false);
          }
        }
      };
      recorder.start();
      mediaRecorderRef.current = recorder;
      setRecording(true);
    } catch {
      setError("Não foi possível acessar o microfone");
    }
  }

  function stopRecording() {
    if (mediaRecorderRef.current && recording) {
      mediaRecorderRef.current.stop();
      mediaRecorderRef.current = null;
      setRecording(false);
    }
  }

  useEffect(() => {
    return () => {
      if (mediaRecorderRef.current && recording) {
        mediaRecorderRef.current.stop();
      }
    };
  }, [recording]);

  const base = slug ? `/${slug}` : "";

  if (loading && !conv) {
    return <ChatThreadSkeleton />;
  }
  if (!conv) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center bg-[#F1F5F9] text-[#64748B]">
        <p>Conversa não encontrada.</p>
        <a href={`${base}/conversas`} className="mt-2 text-clicvend-orange hover:underline">
          Voltar
        </a>
      </div>
    );
  }

  const name = conv.customer_name || conv.customer_phone;
  const showTransfer = !!conv.assigned_to && canTransfer;
  const displayName = contactDetails?.name ?? contactDetails?.wa_name ?? contactDetails?.wa_contactName ?? name;
  const displayPhone = contactDetails?.phone ?? conv.customer_phone;
  const imageUrl = (conv.contact_avatar_url && conv.contact_avatar_url.trim()) ? conv.contact_avatar_url : (contactDetails?.imagePreview ?? contactDetails?.image ?? null);

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-[#F1F5F9]">
      <header className="flex shrink-0 items-center gap-3 border-b border-[#E2E8F0] bg-white px-4 py-3">
        <a
          href={`${base}/conversas`}
          className="shrink-0 text-[#64748B] hover:text-[#1E293B] transition-colors"
          aria-label="Voltar"
        >
          <ArrowLeft className="h-5 w-5" />
        </a>
        <span className="relative flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-[#E2E8F0] text-sm font-medium text-[#64748B]">
          {imageUrl ? (
            <img src={imageUrl} alt="" className="h-full w-full object-cover" />
          ) : (
            name.slice(0, 1).toUpperCase()
          )}
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-medium text-[#1E293B]">{displayName || name}</p>
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            {conv.channel_name && (
              <span className="rounded bg-clicvend-green/15 px-1.5 py-0.5 text-xs font-medium text-clicvend-green">
                {conv.channel_name}
              </span>
            )}
            {conv.queue_name && (
              <span className="rounded bg-[#E2E8F0] px-1.5 py-0.5 text-xs text-[#64748B]">
                {conv.queue_name}
              </span>
            )}
            {conv.assigned_to_name && (
              <span className="rounded bg-[#E2E8F0] px-1.5 py-0.5 text-xs text-[#64748B]">
                {conv.assigned_to_name}
              </span>
            )}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1" ref={menuRef}>
          <button type="button" className="rounded p-2 text-[#64748B] hover:bg-[#F1F5F9] hover:text-[#1E293B]" aria-label="Buscar">
            <Search className="h-4 w-4" />
          </button>
          <button type="button" className="rounded p-2 text-[#64748B] hover:bg-[#F1F5F9] hover:text-[#1E293B]" aria-label="Transferir">
            <ArrowRightLeft className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => setInfoOpen(true)}
            className="rounded p-2 text-[#64748B] hover:bg-[#F1F5F9] hover:text-[#1E293B]"
            aria-label="Ver informações do contato"
          >
            <User className="h-4 w-4" />
          </button>
          <div className="relative">
            <button
              type="button"
              onClick={() => setChatMenuOpen((o) => !o)}
              className="rounded p-2 text-[#64748B] hover:bg-[#F1F5F9] hover:text-[#1E293B]"
              aria-label="Mais opções"
              aria-expanded={chatMenuOpen}
            >
              <MoreVertical className="h-4 w-4" />
            </button>
            {chatMenuOpen && (
              <div className="absolute right-0 top-full z-50 mt-1 w-56 rounded-lg border border-[#E2E8F0] bg-white py-1 shadow-lg">
                <button
                  type="button"
                  onClick={() => chatAction("read", { read: true })}
                  disabled={!!chatActionLoading}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-[#1E293B] hover:bg-[#F8FAFC] disabled:opacity-60"
                >
                  <Check className="h-4 w-4 shrink-0" />
                  Marcar como lido
                </button>
                <button
                  type="button"
                  onClick={() => chatAction("archive", { archive: true })}
                  disabled={!!chatActionLoading}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-[#1E293B] hover:bg-[#F8FAFC] disabled:opacity-60"
                >
                  <Archive className="h-4 w-4 shrink-0" />
                  Arquivar conversa
                </button>
                <button
                  type="button"
                  onClick={() => chatAction("mute", { muteEndTime: 8 })}
                  disabled={!!chatActionLoading}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-[#1E293B] hover:bg-[#F8FAFC] disabled:opacity-60"
                >
                  <BellOff className="h-4 w-4 shrink-0" />
                  Silenciar (8h)
                </button>
                <button
                  type="button"
                  onClick={() => chatAction("pin", { pin: true })}
                  disabled={!!chatActionLoading}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-[#1E293B] hover:bg-[#F8FAFC] disabled:opacity-60"
                >
                  <Pin className="h-4 w-4 shrink-0" />
                  Fixar conversa
                </button>
                <hr className="my-1 border-[#E2E8F0]" />
                <button
                  type="button"
                  onClick={openDeleteConfirm}
                  disabled={!!chatActionLoading}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-[#EF4444] hover:bg-[#FEF2F2] disabled:opacity-60"
                >
                  <Trash2 className="h-4 w-4 shrink-0" />
                  Excluir conversa
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      <div className="flex flex-1 min-h-0 flex-col min-w-0 overflow-hidden">
        <div ref={messagesScrollRef} className="scroll-area flex-1 min-h-0 overflow-x-hidden overflow-y-auto overscroll-contain p-4">
          <div className="space-y-3">
            {(Array.isArray(conv.messages) ? conv.messages : []).map((m) => (
              <div
                key={m.id}
                className={`flex ${m.direction === "out" ? "justify-end" : "justify-start"}`}
              >
                <MessageBubble m={m} name={name} />
              </div>
            ))}
            <div ref={messagesEndRef} />
          </div>
        </div>

        <div className="shrink-0 border-t border-[#E2E8F0] bg-white p-2">
          {showTransfer && (
            <p className="mb-2 text-xs text-[#64748B]">
              Chamado pertence a outro atendente.{" "}
              <button type="button" className="text-clicvend-orange hover:underline font-medium">
                Transferir chamado
              </button>
            </p>
          )}
          {error && <p className="mb-2 text-sm text-[#EF4444]">{error}</p>}
          <form onSubmit={(e) => handleSend(e)} className="flex gap-2">
            <input
              type="file"
              ref={fileInputRef}
              accept="image/*"
              className="hidden"
              onChange={(e) => onFileChoose("image", e)}
            />
            <input
              type="file"
              ref={audioInputRef}
              accept="audio/*"
              className="hidden"
              onChange={(e) => onFileChoose("audio", e)}
            />
            <input
              type="file"
              ref={docInputRef}
              accept=".pdf,.doc,.docx,.xls,.xlsx"
              className="hidden"
              onChange={(e) => onFileChoose("document", e)}
            />
            <div className="flex shrink-0 items-center gap-0.5 border border-[#E2E8F0] rounded-lg overflow-hidden bg-white">
              <button
                type="button"
                onClick={() => setAttachOpen(!attachOpen)}
                className="p-2 text-[#64748B] hover:bg-[#F8FAFC] hover:text-[#1E293B]"
                aria-label="Anexar"
              >
                <Paperclip className="h-5 w-5" />
              </button>
              {attachOpen && (
                <div className="flex items-center border-l border-[#E2E8F0]">
                  <button type="button" onClick={() => { fileInputRef.current?.click(); setAttachOpen(false); }} className="px-2 py-1.5 text-xs text-[#64748B] hover:bg-[#F8FAFC]">Imagem</button>
                  <button type="button" onClick={() => { audioInputRef.current?.click(); setAttachOpen(false); }} className="px-2 py-1.5 text-xs text-[#64748B] hover:bg-[#F8FAFC]">Áudio</button>
                  <button type="button" onClick={() => { docInputRef.current?.click(); setAttachOpen(false); }} className="px-2 py-1.5 text-xs text-[#64748B] hover:bg-[#F8FAFC]">Documento</button>
                </div>
              )}
            </div>
            <input
              type="text"
              value={sendValue}
              onChange={(e) => setSendValue(e.target.value)}
              placeholder="Digite sua mensagem…"
              className="flex-1 rounded-lg border border-[#E2E8F0] px-4 py-2 text-sm text-[#1E293B] placeholder-[#94A3B8] focus:border-clicvend-orange focus:outline-none focus:ring-1 focus:ring-clicvend-orange"
              disabled={sending}
            />
            {recording ? (
              <button
                type="button"
                onClick={stopRecording}
                className="inline-flex items-center gap-1.5 rounded-lg bg-red-500 px-4 py-2 text-sm font-medium text-white hover:bg-red-600"
              >
                <Square className="h-4 w-4" />
                Parar
              </button>
            ) : (
              <button
                type="button"
                onClick={startRecording}
                className="inline-flex items-center gap-1.5 rounded-lg border border-[#E2E8F0] px-4 py-2 text-sm font-medium text-[#64748B] hover:bg-[#F8FAFC]"
                aria-label="Enviar áudio"
              >
                <Mic className="h-4 w-4" />
              </button>
            )}
            <button
              type="submit"
              disabled={!sendValue.trim() || sending}
              className="inline-flex items-center gap-1.5 rounded-lg bg-clicvend-orange px-4 py-2 text-sm font-medium text-white hover:bg-clicvend-orange-dark disabled:bg-[#94A3B8] disabled:cursor-not-allowed transition-colors"
            >
              <Send className="h-4 w-4" />
              Enviar
            </button>
          </form>
        </div>
      </div>

      {/* SideOver de informações do contato — abre só ao clicar no botão (padrão do sistema), com rolagem própria e fotos/infos */}
      <SideOver
        open={infoOpen}
        onClose={() => setInfoOpen(false)}
        title="Informações do contato"
        width={420}
      >
        <div className="flex flex-col h-full overflow-hidden">
          <div className="flex-1 overflow-y-auto min-h-0">
            {contactDetailsLoading && (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-clicvend-orange" />
              </div>
            )}
            {contactDetailsError && !contactDetailsLoading && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                {contactDetailsError}
              </div>
            )}
            {!contactDetailsLoading && (contactDetails || !conv.channel_id) && (
              <div className="space-y-4">
                <div className="flex flex-col items-center gap-3 border-b border-[#E2E8F0] pb-4">
                  <div className="relative h-24 w-24 shrink-0 overflow-hidden rounded-full bg-[#E2E8F0]">
                    {imageUrl ? (
                      <img src={imageUrl} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-3xl text-[#94A3B8]">
                        <User className="h-12 w-12" />
                      </div>
                    )}
                  </div>
                  <div className="text-center">
                    <p className="font-semibold text-[#1E293B]">{displayName}</p>
                    <a
                      href={`tel:${displayPhone}`}
                      className="mt-1 flex items-center justify-center gap-2 text-sm text-[#64748B] hover:text-clicvend-orange"
                    >
                      <Phone className="h-3.5 w-3.5" />
                      {displayPhone}
                    </a>
                    {conv.channel_name && (
                      <p className="mt-1 text-xs text-[#94A3B8]">{conv.channel_name}</p>
                    )}
                  </div>
                </div>
                <div className="space-y-3">
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-[#64748B]">Mídias e documentos</h3>
                  <p className="text-sm text-[#94A3B8]">0</p>
                </div>
                <div className="space-y-2">
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-[#64748B]">Pessoa</h3>
                  <p className="text-sm text-[#94A3B8]">Selecione</p>
                </div>
                {contactDetails && (
                  <div className="space-y-3">
                    <h3 className="text-xs font-semibold uppercase tracking-wider text-[#64748B]">Outras informações</h3>
                    <dl className="space-y-2 text-sm">
                      {contactDetails.wa_isBlocked != null && (
                        <div>
                          <dt className="text-[#64748B]">Bloqueado</dt>
                          <dd className="font-medium text-[#1E293B]">{contactDetails.wa_isBlocked ? "Sim" : "Não"}</dd>
                        </div>
                      )}
                      {contactDetails.lead_email && (
                        <div>
                          <dt className="text-[#64748B]">E-mail (lead)</dt>
                          <dd className="font-medium text-[#1E293B]">{contactDetails.lead_email}</dd>
                        </div>
                      )}
                      {contactDetails.lead_status && (
                        <div>
                          <dt className="text-[#64748B]">Status (lead)</dt>
                          <dd className="font-medium text-[#1E293B]">{contactDetails.lead_status}</dd>
                        </div>
                      )}
                      {contactDetails.common_groups && (
                        <div>
                          <dt className="text-[#64748B]">Grupos em comum</dt>
                          <dd className="font-medium text-[#1E293B] break-words">{contactDetails.common_groups}</dd>
                        </div>
                      )}
                      {contactDetails.lead_notes && (
                        <div>
                          <dt className="text-[#64748B]">Observações</dt>
                          <dd className="font-medium text-[#1E293B] whitespace-pre-wrap">{contactDetails.lead_notes}</dd>
                        </div>
                      )}
                    </dl>
                  </div>
                )}
                <div className="flex items-center justify-between py-2">
                  <span className="text-sm text-[#64748B]">Silenciar</span>
                  <span className="text-xs text-[#94A3B8]">Off</span>
                </div>
                <button type="button" className="w-full rounded-lg border border-[#E2E8F0] py-2 text-sm text-[#64748B] hover:bg-[#F8FAFC]">
                  Marcar como não lida
                </button>
              </div>
            )}
            {!conv.channel_id && !contactDetailsLoading && (
              <p className="text-sm text-[#64748B]">Canal não disponível para detalhes.</p>
            )}
          </div>
        </div>
      </SideOver>

      {/* Modal de exclusão: opções WhatsApp / banco */}
      <SideOver
        open={deleteConfirmOpen}
        onClose={() => setDeleteConfirmOpen(false)}
        title="Excluir conversa"
        width={400}
      >
        <div className="space-y-4">
          <p className="text-sm text-[#64748B]">
            Escolha o que deseja remover. Pode marcar mais de uma opção.
          </p>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={deleteOptions.deleteChatDB}
              onChange={(e) => setDeleteOptions((o) => ({ ...o, deleteChatDB: e.target.checked }))}
              className="rounded border-[#E2E8F0] text-clicvend-orange focus:ring-clicvend-orange"
            />
            <span className="text-sm text-[#1E293B]">Remover conversa do painel (banco de dados)</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={deleteOptions.deleteMessagesDB}
              onChange={(e) => setDeleteOptions((o) => ({ ...o, deleteMessagesDB: e.target.checked }))}
              className="rounded border-[#E2E8F0] text-clicvend-orange focus:ring-clicvend-orange"
            />
            <span className="text-sm text-[#1E293B]">Remover mensagens do banco de dados</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={deleteOptions.deleteChatWhatsApp}
              onChange={(e) => setDeleteOptions((o) => ({ ...o, deleteChatWhatsApp: e.target.checked }))}
              className="rounded border-[#E2E8F0] text-clicvend-orange focus:ring-clicvend-orange"
            />
            <span className="text-sm text-[#1E293B]">Remover também no WhatsApp</span>
          </label>
          <div className="flex gap-2 pt-2">
            <button
              type="button"
              onClick={() => setDeleteConfirmOpen(false)}
              className="flex-1 rounded-lg border border-[#E2E8F0] bg-white px-3 py-2 text-sm font-medium text-[#64748B] hover:bg-[#F8FAFC]"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={confirmDelete}
              disabled={
                !deleteOptions.deleteChatDB && !deleteOptions.deleteMessagesDB && !deleteOptions.deleteChatWhatsApp
              }
              className="flex-1 rounded-lg bg-red-600 px-3 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {chatActionLoading === "delete" ? (
                <span className="inline-flex items-center gap-1.5">
                  <Loader2 className="h-4 w-4 animate-spin shrink-0" />
                  Excluindo…
                </span>
              ) : (
                "Excluir"
              )}
            </button>
          </div>
        </div>
      </SideOver>
    </div>
  );
}
