"use client";

import { usePathname, useRouter } from "next/navigation";
import React, { useState, useEffect, useCallback, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Send, Search, ArrowRightLeft, MoreVertical, CheckCheck, Phone, User, UserCheck, Paperclip, Mic, Square, Archive, ArchiveX, Bell, BellOff, Pin, PinOff, Trash2, Check, Download, Play, Pause } from "lucide-react";
import { queryKeys } from "@/lib/query-keys";
import { SideOver } from "@/components/SideOver";
import { Skeleton } from "@/components/Skeleton";
import { Loader2 } from "lucide-react";
import { RealtimeMessages } from "@/components/RealtimeMessages";

type Message = {
  id: string;
  direction: "in" | "out";
  content: string;
  sent_at: string;
  message_type?: string;
  media_url?: string | null;
  caption?: string | null;
  file_name?: string | null;
  external_id?: string | null;
  reaction?: string | null;
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
  status?: string;
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

/** Corrige Brasil: DDD+0+8 dígitos → DDD+9+8 (celular), para exibição correta. */
function fixBrazilMobileZero(d: string): string {
  if (d.length === 11 && !d.startsWith("55")) {
    const ddd = d.slice(0, 2);
    const rest = d.slice(2);
    if (/^\d{2}$/.test(ddd) && rest.length >= 9 && rest[0] === "0") return ddd + "9" + rest.slice(1, 9);
  }
  if (d.length === 13 && d.startsWith("55")) {
    const after55 = d.slice(2);
    if (after55.length >= 9 && after55[2] === "0") {
      const ddd = after55.slice(0, 2);
      const rest = after55.slice(2, 11);
      if (/^\d{2}$/.test(ddd) && rest[0] === "0") return "55" + ddd + "9" + rest.slice(1);
    }
  }
  return d;
}
/** Formata número para exibição Brasil: (DDD) 9 00000-0000. Usa sempre o número salvo na conversa/contato. */
function formatPhoneBrazil(raw: string | null | undefined): string {
  let s = (raw ?? "").trim().replace(/\D/g, "");
  if (!s) return "—";
  s = fixBrazilMobileZero(s);
  const withCountry = s.length >= 12 && s.startsWith("55");
  const digits = withCountry ? s.slice(2) : s;
  if (digits.length >= 10) {
    const ddd = digits.slice(0, 2);
    const rest = digits.slice(2);
    if (rest.length >= 9 && rest[0] === "9") {
      return `(${ddd}) ${rest.slice(0, 1)} ${rest.slice(1, 6)}-${rest.slice(6, 10)}`;
    }
    if (rest.length >= 8) {
      return `(${ddd}) ${rest.slice(0, 4)}-${rest.slice(4, 8)}`;
    }
  }
  if (s.length <= 14) return s;
  return s.slice(0, 14) + "…";
}

/** Formata segundos em mm:ss */
function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

/**
 * Mini player de áudio estilo WhatsApp Web: botão play/pause, barra de progresso, tempo e download.
 */
function ChatAudioPlayer({
  src,
  onDownload,
  isLoading,
}: {
  src: string | null;
  onDownload?: () => void;
  isLoading?: boolean;
}) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [loaded, setLoaded] = useState(false);

  const togglePlay = useCallback(() => {
    const el = audioRef.current;
    if (!el) return;
    if (playing) {
      el.pause();
    } else {
      el.play().catch(() => {});
    }
    setPlaying(!playing);
  }, [playing]);

  useEffect(() => {
    const el = audioRef.current;
    if (!el || !src) return;
    setLoaded(false);
    setDuration(0);
    setCurrentTime(0);
    setPlaying(false);
    const onTimeUpdate = () => setCurrentTime(el.currentTime);
    const onDurationChange = () => {
      setDuration(el.duration);
      setLoaded(true);
    };
    const onEnded = () => setPlaying(false);
    const onLoadedData = () => setLoaded(true);
    el.addEventListener("timeupdate", onTimeUpdate);
    el.addEventListener("durationchange", onDurationChange);
    el.addEventListener("ended", onEnded);
    el.addEventListener("loadeddata", onLoadedData);
    return () => {
      el.removeEventListener("timeupdate", onTimeUpdate);
      el.removeEventListener("durationchange", onDurationChange);
      el.removeEventListener("ended", onEnded);
      el.removeEventListener("loadeddata", onLoadedData);
    };
  }, [src]);

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;

  if (isLoading || !src) {
    return (
      <div className="flex items-center gap-3 rounded-xl bg-black/5 px-3 py-2 min-w-[200px] max-w-[280px]">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#E2E8F0]">
          <Loader2 className="h-4 w-4 animate-spin text-[#64748B]" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="h-1.5 w-full rounded-full bg-[#E2E8F0] overflow-hidden" />
          <p className="mt-1 text-xs text-[#64748B]">Carregando…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-3 rounded-xl bg-black/5 px-3 py-2 min-w-[200px] max-w-[280px]">
      {src && <audio ref={audioRef} src={src} preload="metadata" className="hidden" />}
      <button
        type="button"
        onClick={togglePlay}
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-clicvend-orange text-white hover:bg-clicvend-orange-dark transition-colors focus:outline-none focus:ring-2 focus:ring-clicvend-orange focus:ring-offset-1"
        aria-label={playing ? "Pausar" : "Reproduzir"}
      >
        {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4 ml-0.5" />}
      </button>
      <div className="flex-1 min-w-0">
        <div className="h-1.5 w-full rounded-full bg-[#E2E8F0] overflow-hidden cursor-pointer" onClick={(e) => {
          const el = audioRef.current;
          if (!el) return;
          const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
          const x = e.clientX - rect.left;
          const pct = x / rect.width;
          el.currentTime = pct * el.duration;
          setCurrentTime(el.currentTime);
        }}>
          <div className="h-full rounded-full bg-clicvend-orange transition-all duration-150" style={{ width: `${progress}%` }} />
        </div>
        <div className="flex justify-between mt-0.5">
          <span className="text-xs text-[#64748B]">{formatDuration(currentTime)}</span>
          <span className="text-xs text-[#64748B]">{loaded ? formatDuration(duration) : "–:––"}</span>
        </div>
      </div>
      {onDownload && (
        <button
          type="button"
          onClick={onDownload}
          className="shrink-0 p-1.5 rounded-full text-[#64748B] hover:bg-[#E2E8F0] hover:text-clicvend-orange transition-colors"
          title="Baixar áudio"
        >
          <Download className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}

/** Retorna se a URL é utilizável diretamente no front (reproduzir/abrir). */
function isPlayableOrDirectUrl(url: string | null | undefined): boolean {
  if (!url?.trim()) return false;
  return url.startsWith("http") || url.startsWith("data:");
}

function MessageBubble({
  m,
  name,
  conversationId,
  apiHeaders,
  onReaction,
}: {
  m: Message;
  name: string;
  conversationId?: string;
  apiHeaders?: Record<string, string>;
  onReaction?: (messageId: string, emoji: string) => void;
}) {
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

  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [downloadLoading, setDownloadLoading] = useState(false);
  const canFetchDownload = Boolean(conversationId && apiHeaders && m.external_id && (type === "audio" || type === "ptt" || type === "document" || type === "image" || type === "video"));
  const needsDownloadForPlay = (type === "audio" || type === "ptt") && !isPlayableOrDirectUrl(mediaUrl) && canFetchDownload;
  const needsDownloadForMedia = (type === "image" || type === "video") && !isPlayableOrDirectUrl(mediaUrl) && canFetchDownload;
  const needsDownloadForDocument = type === "document" && !isPlayableOrDirectUrl(mediaUrl) && canFetchDownload;

  useEffect(() => {
    if (!(needsDownloadForPlay || needsDownloadForMedia) || !conversationId || !apiHeaders || !m.id) return;
    let cancelled = false;
    setDownloadLoading(true);
    fetch(`/api/conversations/${conversationId}/messages/${m.id}/download`, { credentials: "include", headers: apiHeaders })
      .then((r) => (r.ok ? r.json() : null))
      .then((data: { fileURL?: string } | null) => {
        if (!cancelled && data?.fileURL) setDownloadUrl(data.fileURL);
      })
      .finally(() => { if (!cancelled) setDownloadLoading(false); });
    return () => { cancelled = true; };
  }, [needsDownloadForPlay, needsDownloadForMedia, conversationId, apiHeaders, m.id]);

  const audioSrc = (type === "audio" || type === "ptt") ? (downloadUrl || mediaUrl) : null;

  async function handleDownloadClick() {
    if (downloadUrl) {
      window.open(downloadUrl, "_blank", "noopener,noreferrer");
      return;
    }
    if (!conversationId || !apiHeaders || !m.id) return;
    setDownloadLoading(true);
    try {
      const res = await fetch(`/api/conversations/${conversationId}/messages/${m.id}/download`, { credentials: "include", headers: apiHeaders });
      const data = await res.json().catch(() => ({}));
      if (data?.fileURL) {
        setDownloadUrl(data.fileURL);
        window.open(data.fileURL, "_blank", "noopener,noreferrer");
      }
    } finally {
      setDownloadLoading(false);
    }
  }

  return (
    <div
      className={`max-w-[80%] rounded-lg px-3 py-2 ${
        m.direction === "out"
          ? "bg-[#DCFCE7] text-[#1E293B]"
          : "bg-white border border-[#E2E8F0] text-[#1E293B]"
      }`}
    >
      <p className="text-xs font-medium text-[#64748B] mb-0.5 flex items-center gap-2">
        {m.direction === "out" ? "Você" : name}
        {typeof m.id === "string" && m.id.startsWith("temp-") && (
          <span className="text-[#64748B] font-normal animate-pulse">Enviando…</span>
        )}
      </p>
      {type === "image" && (mediaUrl || downloadUrl || needsDownloadForMedia) && (
        <div className="space-y-1">
          {(mediaUrl || downloadUrl) ? (
            <>
              <a
                href={downloadUrl || mediaUrl || "#"}
                target="_blank"
                rel="noopener noreferrer"
                className="block rounded-xl overflow-hidden border border-[#E2E8F0] shadow-sm hover:shadow-md transition-shadow focus:outline-none focus:ring-2 focus:ring-clicvend-orange/50"
              >
                <img
                  src={mediaUrl || downloadUrl || ""}
                  alt=""
                  className="max-h-[280px] min-h-[120px] w-full object-cover cursor-pointer"
                />
              </a>
              {canFetchDownload && (
                <button type="button" onClick={handleDownloadClick} disabled={downloadLoading} className="inline-flex items-center gap-1.5 text-xs text-clicvend-orange hover:underline disabled:opacity-50">
                  {downloadLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
                  Baixar
                </button>
              )}
            </>
          ) : (
            <div className="flex items-center gap-2 py-4 text-sm text-[#64748B]">
              <Loader2 className="h-5 w-5 animate-spin shrink-0" /> Carregando imagem…
            </div>
          )}
          {caption && caption !== "[image]" && <p className="whitespace-pre-wrap text-sm">{caption}</p>}
        </div>
      )}
      {type === "video" && (mediaUrl || downloadUrl || needsDownloadForMedia) && (
        <div className="space-y-1">
          {(mediaUrl || downloadUrl) ? (
            <>
              <div className="relative rounded-xl overflow-hidden border border-[#E2E8F0] shadow-sm max-w-[320px]">
                <video
                  src={downloadUrl || mediaUrl || ""}
                  controls
                  className="w-full max-h-[240px] object-cover rounded-xl"
                  playsInline
                />
              </div>
              {canFetchDownload && (
                <button type="button" onClick={handleDownloadClick} disabled={downloadLoading} className="inline-flex items-center gap-1.5 text-xs text-clicvend-orange hover:underline disabled:opacity-50">
                  {downloadLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
                  Baixar
                </button>
              )}
            </>
          ) : (
            <div className="flex items-center gap-2 py-4 text-sm text-[#64748B]">
              <Loader2 className="h-5 w-5 animate-spin shrink-0" /> Carregando vídeo…
            </div>
          )}
          {caption && caption !== "[video]" && <p className="whitespace-pre-wrap text-sm">{caption}</p>}
        </div>
      )}
      {(type === "audio" || type === "ptt") && (audioSrc || downloadLoading || mediaUrl) && (
        <div className="space-y-1">
          <ChatAudioPlayer
            src={audioSrc}
            isLoading={downloadLoading}
            onDownload={audioSrc ? () => window.open(audioSrc!, "_blank") : undefined}
          />
          {caption && caption !== "[audio]" && caption !== "[ptt]" && <p className="whitespace-pre-wrap text-sm mt-1">{caption}</p>}
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
          {needsDownloadForDocument && (
            <button type="button" onClick={handleDownloadClick} disabled={downloadLoading} className="inline-flex items-center gap-1.5 text-sm text-clicvend-orange hover:underline disabled:opacity-50">
              {downloadLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
              Baixar arquivo
            </button>
          )}
          {caption && caption !== "[document]" && m.file_name !== caption && <p className="whitespace-pre-wrap text-sm">{caption}</p>}
        </div>
      )}
      {type === "sticker" && (mediaUrl || downloadUrl) && (
        <div>
          <div className="rounded-xl overflow-hidden border border-[#E2E8F0] shadow-sm inline-block">
            <img src={mediaUrl || downloadUrl || ""} alt="" className="max-h-32 w-auto block" />
          </div>
          {canFetchDownload && (
            <button type="button" onClick={handleDownloadClick} disabled={downloadLoading} className="mt-1 inline-flex items-center gap-1.5 text-xs text-clicvend-orange hover:underline disabled:opacity-50">
              {downloadLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
              Baixar
            </button>
          )}
        </div>
      )}
      {(type === "text" || (!mediaUrl && !downloadUrl && type !== "document")) && (
        <p className="whitespace-pre-wrap text-sm">{m.content}</p>
      )}
      <div className="mt-1 flex items-center justify-end gap-1 flex-wrap">
        {m.reaction && (
          <span className="text-sm mr-1" title="Reação">
            {m.reaction}
          </span>
        )}
        <span className="text-xs text-[#64748B]">
          {new Date(m.sent_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
        </span>
        {m.direction === "out" && (
          <CheckCheck className="h-3.5 w-3.5 text-[#64748B]" aria-hidden />
        )}
        {conversationId && apiHeaders && m.external_id && onReaction && (
          <div className="flex items-center gap-0.5 ml-1 opacity-0 hover:opacity-100 focus-within:opacity-100 transition-opacity">
            {["👍", "❤️", "😂", "😮", "😢", "🙏"].map((emoji) => (
              <button
                key={emoji}
                type="button"
                className="p-0.5 rounded hover:bg-black/10 text-base leading-none disabled:opacity-50"
                onClick={() => onReaction(m.id, m.reaction === emoji ? "" : emoji)}
                title={m.reaction === emoji ? "Remover reação" : `Reagir ${emoji}`}
              >
                {emoji}
              </button>
            ))}
          </div>
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
  const [loadingOlderMessages, setLoadingOlderMessages] = useState(false);
  const [hasMoreOlderMessages, setHasMoreOlderMessages] = useState(true);
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
  const queryClient = useQueryClient();

  const { data: permissionsData } = useQuery({
    queryKey: queryKeys.permissions(slug),
    queryFn: () =>
      fetch("/api/auth/permissions", { credentials: "include", headers: apiHeaders }).then((r) => r.json()),
    enabled: !!slug,
    staleTime: 5 * 60 * 1000,
  });
  useEffect(() => {
    const perms = Array.isArray(permissionsData?.permissions) ? permissionsData.permissions : [];
    setCanTransfer(perms.includes("inbox.transfer"));
  }, [permissionsData?.permissions]);

  const invalidateConversation = useCallback(
    (id: string) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.conversation(id) });
    },
    [queryClient]
  );

  const {
    data: conv,
    isLoading: loading,
    error: convQueryError,
    refetch: refetchConversation,
  } = useQuery({
    queryKey: queryKeys.conversation(resolved?.id ?? ""),
    queryFn: async () => {
      const id = resolved?.id;
      if (!id) return null;
      const res = await fetch(`/api/conversations/${id}`, {
        credentials: "include",
        headers: apiHeaders,
      });
      if (!res.ok) return null;
      return res.json() as Promise<ConversationDetail>;
    },
    enabled: !!resolved?.id && !!slug,
    staleTime: 5 * 60 * 1000, // 5 minutos - Realtime atualiza em tempo real
    // Removido refetchInterval - Realtime cuida das atualizações
  });

  useEffect(() => {
    if (resolved?.id) setHasMoreOlderMessages(true);
  }, [resolved?.id]);

  useEffect(() => {
    if (convQueryError) setError(convQueryError instanceof Error ? convQueryError.message : "Erro ao carregar");
    else setError(null);
  }, [convQueryError]);

  const claimAttemptedRef = useRef(false);
  const contactDetailsFetchedForRef = useRef<string | null>(null);

  const loadOlderMessages = useCallback(async () => {
    if (!resolved?.id || !conv?.messages?.length || loadingOlderMessages || !hasMoreOlderMessages) return;
    const first = conv.messages[0] as { sent_at?: string };
    const before = first?.sent_at;
    if (!before) return;
    setLoadingOlderMessages(true);
    try {
      const url = `/api/conversations/${resolved.id}/messages?before=${encodeURIComponent(before)}&limit=1000`;
      const res = await fetch(url, { credentials: "include", headers: apiHeaders });
      if (!res.ok) return;
      const data = await res.json();
      const older = Array.isArray(data?.messages) ? data.messages : [];
      if (older.length === 0) setHasMoreOlderMessages(false);
      else {
        const scrollEl = messagesScrollRef.current;
        const prevHeight = scrollEl?.scrollHeight ?? 0;
        const prevScroll = scrollEl?.scrollTop ?? 0;
        const id = resolved.id;
        queryClient.setQueryData<ConversationDetail>(queryKeys.conversation(id), (c) => {
          if (!c) return c;
          const existing = Array.isArray(c.messages) ? c.messages : [];
          return { ...c, messages: [...older, ...existing] };
        });
        requestAnimationFrame(() => {
          if (scrollEl) {
            const newHeight = scrollEl.scrollHeight;
            scrollEl.scrollTop = prevScroll + (newHeight - prevHeight);
          }
        });
        if (older.length < 1000) setHasMoreOlderMessages(false);
      }
    } finally {
      setLoadingOlderMessages(false);
    }
  }, [resolved?.id, conv?.messages, loadingOlderMessages, hasMoreOlderMessages, apiHeaders, queryClient]);

  // Scroll automático apenas na primeira carga ou quando o usuário está no final
  useEffect(() => {
    if (!conv?.messages?.length || !messagesScrollRef.current) return;
    
    const scrollContainer = messagesScrollRef.current;
    const { scrollTop, scrollHeight, clientHeight } = scrollContainer;
    const isNearBottom = scrollHeight - scrollTop - clientHeight < 300;
    
    // Só faz scroll automático se estiver próximo do final
    if (isNearBottom) {
      const t = requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          messagesEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
        });
      });
      return () => cancelAnimationFrame(t);
    }
  }, [conv?.messages?.length]);

  // Não atribuir ao abrir: atribuição só pelo botão "+" no minicard da lista.

  // Foto do contato vem do banco (contact_avatar_url). Só chamamos chat-details quando o usuário
  // abre o painel de informações (useEffect abaixo com infoOpen).

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

  const perms = Array.isArray(permissionsData?.permissions) ? permissionsData.permissions : [];
  const canClaim = perms.includes("inbox.claim");
  const currentUserId = (permissionsData as { user_id?: string } | undefined)?.user_id ?? null;
  const canSendMessages = Boolean(conv && currentUserId && conv.assigned_to === currentUserId);
  const canChangeStatus = perms.includes("inbox.assign") || perms.includes("inbox.manage_tickets");
  const canClose = perms.includes("inbox.close");

  async function handleClaim() {
    if (!resolved?.id) return;
    setChatActionLoading("claim");
    setChatMenuOpen(false);
    try {
      const res = await fetch(`/api/conversations/${resolved.id}/claim`, {
        method: "POST",
        credentials: "include",
        headers: apiHeaders ?? {},
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        setError(err?.error ?? "Falha ao atribuir");
        return;
      }
      await refetchConversation();
      queryClient.invalidateQueries({ queryKey: ["inbox", "conversations"] });
      queryClient.invalidateQueries({ queryKey: queryKeys.counts(slug) });
    } finally {
      setChatActionLoading(null);
    }
  }

  async function handleStatusChange(newStatus: string) {
    if (!resolved?.id) return;
    setChatActionLoading("status");
    setChatMenuOpen(false);
    try {
      const res = await fetch(`/api/conversations/${resolved.id}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json", ...apiHeaders },
        body: JSON.stringify({ status: newStatus }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        setError(err?.error ?? "Falha ao alterar status");
        return;
      }
      await refetchConversation();
      queryClient.invalidateQueries({ queryKey: ["inbox", "conversations"] });
      queryClient.invalidateQueries({ queryKey: queryKeys.counts(slug) });
    } finally {
      setChatActionLoading(null);
    }
  }

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
      await refetchConversation();
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
      
      // Otimização: atualizar cache imediatamente com mensagem otimista
      const sentMessage: Message = {
        id: `temp-${Date.now()}`,
        direction: "out",
        content: isMedia ? (payload!.caption || "") : text,
        sent_at: new Date().toISOString(),
        message_type: payload?.type || "text",
        media_url: payload?.file || null,
        caption: payload?.caption || null,
        file_name: payload?.docName || null,
      };
      
      queryClient.setQueryData<ConversationDetail>(
        queryKeys.conversation(resolved.id),
        (oldData) => {
          if (!oldData) return oldData;
          return {
            ...oldData,
            messages: [...(oldData.messages || []), sentMessage],
          };
        }
      );
      
      // Scroll imediato para a nova mensagem
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          messagesEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
        });
      });
      
      // Refetch para obter mensagem real do servidor (substitui a otimista)
      await refetchConversation();
      queryClient.invalidateQueries({ queryKey: ["inbox", "conversations"] });
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
            if (res.ok) {
              // Scroll imediato após enviar áudio
              requestAnimationFrame(() => {
                requestAnimationFrame(() => {
                  messagesEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
                });
              });
              await refetchConversation();
            } else setError("Falha ao enviar áudio");
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

  async function handleReaction(messageId: string, emoji: string) {
    if (!resolved?.id || !apiHeaders) return;
    try {
      const res = await fetch(`/api/conversations/${resolved.id}/messages/reaction`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json", ...apiHeaders },
        body: JSON.stringify({ message_id: messageId, emoji }),
      });
      if (res.ok) await refetchConversation();
    } catch {
      // silent fail
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

  if (!conv && !loading) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center bg-[#F1F5F9] text-[#64748B]">
        <p>Conversa não encontrada.</p>
        <a href={`${base}/conversas`} className="mt-2 text-clicvend-orange hover:underline">
          Voltar
        </a>
      </div>
    );
  }

  const isLoading = loading && !conv;
  const isInitialLoad = loading && !conv && !!resolved?.id;

  const name = conv?.customer_name || conv?.customer_phone || "";
  const displayName = contactDetails?.name ?? contactDetails?.wa_name ?? contactDetails?.wa_contactName ?? name;
  /** Preferir sempre o número salvo na conversa/contato (canonical); UAZAPI pode retornar formato errado */
  const rawPhone = conv?.customer_phone ?? contactDetails?.phone ?? "";
  const displayPhone = formatPhoneBrazil(rawPhone);
  const telDigits = rawPhone.replace(/\D/g, "") || "";
  const telHref = telDigits ? (telDigits.startsWith("55") ? `tel:+${telDigits}` : `tel:+55${telDigits}`) : undefined;
  const imageUrl = (conv?.contact_avatar_url && conv.contact_avatar_url.trim())
    ? (conv.contact_avatar_url.startsWith("http://") || conv.contact_avatar_url.startsWith("https://")
        ? `/api/contacts/avatar?url=${encodeURIComponent(conv.contact_avatar_url)}`
        : conv.contact_avatar_url)
    : (contactDetails?.imagePreview ?? contactDetails?.image ?? null);

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
          {isLoading ? (
            <Skeleton className="h-10 w-10 rounded-full" />
          ) : imageUrl ? (
            <img src={imageUrl} alt="" className="h-full w-full object-cover" />
          ) : (
            name.slice(0, 1).toUpperCase() || "?"
          )}
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-medium text-[#1E293B]">{isLoading ? "Carregando…" : (displayName || name)}</p>
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            {!isLoading && displayPhone && displayPhone !== "—" && (
              <span className="rounded bg-[#F1F5F9] px-1.5 py-0.5 text-xs font-medium text-[#64748B]" title="Número normalizado para envio">
                {displayPhone}
              </span>
            )}
            {!isLoading && conv?.channel_name && (
              <span className="rounded bg-clicvend-green/15 px-1.5 py-0.5 text-xs font-medium text-clicvend-green">
                {conv.channel_name}
              </span>
            )}
            {!isLoading && conv?.queue_name && (
              <span className="rounded bg-[#E2E8F0] px-1.5 py-0.5 text-xs text-[#64748B]">
                {conv.queue_name}
              </span>
            )}
            {!isLoading && conv?.assigned_to_name && (
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
          {canTransfer && (
            <button type="button" className="rounded p-2 text-[#64748B] hover:bg-[#F1F5F9] hover:text-[#1E293B]" aria-label="Transferir">
              <ArrowRightLeft className="h-4 w-4" />
            </button>
          )}
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
                {(canChangeStatus || canClose) && (
                  <>
                    {canChangeStatus && (
                      <>
                        <button
                          type="button"
                          onClick={() => handleStatusChange("open")}
                          disabled={!!chatActionLoading}
                          className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-[#1E293B] hover:bg-[#F8FAFC] disabled:opacity-60"
                        >
                          <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-[#22C55E]" aria-hidden />
                          {conv?.status === "open" ? <Check className="h-4 w-4 shrink-0 text-[#22C55E]" /> : null}
                          Abrir
                        </button>
                        <button
                          type="button"
                          onClick={() => handleStatusChange("in_progress")}
                          disabled={!!chatActionLoading}
                          className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-[#1E293B] hover:bg-[#F8FAFC] disabled:opacity-60"
                        >
                          <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-[#3B82F6]" aria-hidden />
                          {conv?.status === "in_progress" ? <Check className="h-4 w-4 shrink-0 text-[#3B82F6]" /> : null}
                          Em atendimento
                        </button>
                      </>
                    )}
                    {canClose && (
                      <button
                        type="button"
                        onClick={() => handleStatusChange("closed")}
                        disabled={!!chatActionLoading}
                        className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-[#1E293B] hover:bg-[#F8FAFC] disabled:opacity-60"
                      >
                        <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-[#64748B]" aria-hidden />
                        {conv?.status === "closed" ? <Check className="h-4 w-4 shrink-0 text-[#64748B]" /> : null}
                        Fechar
                      </button>
                    )}
                    <hr className="my-1 border-[#E2E8F0]" />
                  </>
                )}
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

      {resolved?.id && typeof window !== "undefined" && <RealtimeMessages conversationId={resolved.id} />}
      <div className="flex flex-1 min-h-0 flex-col min-w-0 overflow-hidden">
        <div ref={messagesScrollRef} data-messages-scroll className="scroll-area flex-1 min-h-0 overflow-x-hidden overflow-y-auto overscroll-contain p-4">
          <div className="space-y-3">
            {isLoading ? (
              <>
                {isInitialLoad && (
                  <div className="flex flex-col items-center justify-center gap-2 py-8 text-[#64748B]">
                    <Loader2 className="h-8 w-8 animate-spin" aria-hidden />
                    <p className="text-sm font-medium">Abrindo conversa…</p>
                  </div>
                )}
                <div className="flex justify-start"><Skeleton className="h-14 w-[75%] max-w-sm rounded-lg" /></div>
                <div className="flex justify-end"><Skeleton className="h-10 w-[50%] max-w-xs rounded-lg" /></div>
                <div className="flex justify-start"><Skeleton className="h-12 w-[60%] max-w-sm rounded-lg" /></div>
                <div className="flex justify-end"><Skeleton className="h-16 w-[70%] max-w-sm rounded-lg" /></div>
              </>
            ) : (
              <>
                {(conv?.messages?.length ?? 0) > 0 && hasMoreOlderMessages && (
                  <div className="flex justify-center py-2">
                    <button
                      type="button"
                      onClick={loadOlderMessages}
                      disabled={loadingOlderMessages}
                      className="text-sm text-clicvend-orange hover:underline disabled:opacity-50"
                    >
                      {loadingOlderMessages ? "Carregando…" : "Carregar mensagens antigas"}
                    </button>
                  </div>
                )}
                {(Array.isArray(conv?.messages) ? conv.messages : [])
                  .filter((m, i, arr) => {
                    const id = (m as Message).id;
                    const first = arr.findIndex((x) => (x as Message).id === id);
                    return first === i;
                  })
                  .map((m) => (
                  <div
                    key={(m as Message).id}
                    className={`flex ${(m as Message).direction === "out" ? "justify-end" : "justify-start"}`}
                  >
                    <MessageBubble m={m as Message} name={name} conversationId={resolved?.id} apiHeaders={apiHeaders} onReaction={handleReaction} />
                  </div>
                ))}
                <div ref={messagesEndRef} data-messages-end />
              </>
            )}
          </div>
        </div>

        <div className="shrink-0 border-t border-[#E2E8F0] bg-white p-2">

          {error && <p className="mb-2 text-sm text-[#EF4444]">{error}</p>}
          <form onSubmit={(e) => { if (!canSendMessages) e.preventDefault(); else handleSend(e); }} className={`flex gap-2 ${!canSendMessages ? "opacity-60 pointer-events-none" : ""}`}>
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
              onFocus={() => {
                if (resolved?.id && apiHeaders && canSendMessages) {
                  fetch(`/api/conversations/${resolved.id}/presence`, {
                    method: "POST",
                    credentials: "include",
                    headers: { "Content-Type": "application/json", ...apiHeaders },
                    body: JSON.stringify({ presence: "composing" }),
                  }).catch(() => {});
                }
              }}
              onBlur={() => {
                if (resolved?.id && apiHeaders) {
                  fetch(`/api/conversations/${resolved.id}/presence`, {
                    method: "POST",
                    credentials: "include",
                    headers: { "Content-Type": "application/json", ...apiHeaders },
                    body: JSON.stringify({ presence: "paused" }),
                  }).catch(() => {});
                }
              }}
              placeholder="Digite sua mensagem…"
              className="flex-1 rounded-lg border border-[#E2E8F0] px-4 py-2 text-sm text-[#1E293B] placeholder-[#94A3B8] focus:border-clicvend-orange focus:outline-none focus:ring-1 focus:ring-clicvend-orange"
              disabled={sending || isLoading}
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
              disabled={!sendValue.trim() || sending || isLoading}
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
        width={580}
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
            {!contactDetailsLoading && (contactDetails || !conv?.channel_id) && (
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
                      href={telHref}
                      className="mt-1 flex items-center justify-center gap-2 text-sm text-[#64748B] hover:text-clicvend-orange"
                    >
                      <Phone className="h-3.5 w-3.5" />
                      {displayPhone}
                    </a>
                    {conv?.channel_name && (
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
            {!conv?.channel_id && !contactDetailsLoading && (
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
        width={560}
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
