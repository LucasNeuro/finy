"use client";

import { usePathname, useRouter } from "next/navigation";
import React, { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Send, Search, ArrowRightLeft, MoreVertical, CheckCheck, Phone, User, UserCheck, Paperclip, Mic, Square, Archive, ArchiveX, Bell, BellOff, Pin, PinOff, Trash2, Check, Download, Play, Pause, Smile, FileText, Image, Video, Music, Volume2, MoreVertical as MoreVerticalIcon, Bold, AlignLeft, AlignCenter, AlignRight, MessageSquare, Zap, Sparkles, Copy, Tag } from "lucide-react";
import { queryKeys } from "@/lib/query-keys";
import { useInboxStore } from "@/stores/inbox-store";
import { SideOver } from "@/components/SideOver";
import { Skeleton } from "@/components/Skeleton";
import { Loader2 } from "lucide-react";
import { RealtimeMessages } from "@/components/RealtimeMessages";
import { EmojiReactionPicker } from "@/components/EmojiReactionPicker";
import { ChannelIcon } from "@/components/ChannelIcon";
import { ChatAudioPlayer } from "@/components/chat/ChatAudioPlayer";

type Message = {
  id: string;
  direction: "in" | "out";
  content: string;
  sent_at: string;
  message_type?: string;
  media_url?: string | null;
  media_cached_url?: string | null;
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

/** Barra de preview do áudio gravado antes de enviar (miniplayer com degradê roxo claro, igual ao mini player da conversa). */
function RecordingPreviewBar({
  src,
  isLoading,
  sending,
  onSend,
  onDiscard,
}: {
  src: string | null;
  isLoading: boolean;
  sending: boolean;
  onSend: () => void;
  onDiscard: () => void;
}) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);

  useEffect(() => {
    const el = audioRef.current;
    setPlaying(false);
    setCurrentTime(0);
    setDuration(0);
    if (!el || !src) return;
    const onTimeUpdate = () => setCurrentTime(el.currentTime);
    const onLoadedMetadata = () => setDuration(el.duration || 0);
    const onEnded = () => setPlaying(false);
    el.addEventListener("timeupdate", onTimeUpdate);
    el.addEventListener("loadedmetadata", onLoadedMetadata);
    el.addEventListener("ended", onEnded);
    return () => {
      el.removeEventListener("timeupdate", onTimeUpdate);
      el.removeEventListener("loadedmetadata", onLoadedMetadata);
      el.removeEventListener("ended", onEnded);
    };
  }, [src]);

  const togglePlay = useCallback(() => {
    const el = audioRef.current;
    if (!el || !src) return;
    if (playing) {
      el.pause();
      setPlaying(false);
    } else {
      el
        .play()
        .then(() => setPlaying(true))
        .catch(() => {
          setPlaying(false);
        });
    }
  }, [playing, src]);

  const handleSeek = (e: React.MouseEvent<HTMLDivElement>) => {
    const el = audioRef.current;
    if (!el || !duration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const pct = Math.max(0, Math.min(1, x / rect.width));
    el.currentTime = pct * duration;
    setCurrentTime(el.currentTime);
  };

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;

  if (isLoading || !src) {
    return (
      <div className="flex items-center justify-between gap-4 rounded-xl bg-gradient-to-r from-violet-400 via-purple-300 to-fuchsia-300 px-5 py-3 shadow-lg text-white">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-white/20">
            <Loader2 className="h-5 w-5 animate-spin text-white" />
          </div>
          <div className="flex flex-col">
            <span className="text-sm font-semibold text-violet-900/90">Preparando áudio…</span>
            <span className="text-xs text-violet-800/70">Aguarde um instante antes de enviar.</span>
          </div>
        </div>
        <button
          type="button"
          onClick={onDiscard}
          className="rounded-full border border-white/60 px-4 py-1.5 text-xs font-medium text-violet-900/90 hover:bg-white/10"
        >
          Cancelar
        </button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-4 rounded-xl bg-gradient-to-r from-violet-400 via-purple-300 to-fuchsia-300 px-5 py-3 shadow-lg text-white">
      {src && <audio ref={audioRef} src={src} preload="metadata" className="hidden" />}
      <button
        type="button"
        onClick={togglePlay}
        className="flex h-11 w-11 items-center justify-center rounded-full bg-white text-violet-600 shadow-md hover:scale-105 transition-transform"
        aria-label={playing ? "Pausar pré-visualização" : "Reproduzir pré-visualização"}
      >
        {playing ? <Pause className="h-5 w-5" /> : <Play className="h-5 w-5 ml-0.5" />}
      </button>
      <div className="flex-1 min-w-0">
        <p className="text-xs font-semibold uppercase tracking-wide text-violet-900/80">
          Pré-visualização do áudio
        </p>
        <div className="mt-1 flex items-center justify-between text-[11px] text-violet-800/90">
          <span>{formatDuration(currentTime)}</span>
          <span>{duration ? formatDuration(duration) : "–:––"}</span>
        </div>
        <div
          className="mt-1.5 h-1.5 w-full rounded-full bg-white/30 overflow-hidden cursor-pointer"
          onClick={handleSeek}
        >
          <div
            className="h-full rounded-full bg-white shadow-[0_0_8px_rgba(255,255,255,0.8)] transition-all"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>
      <div className="flex flex-col items-center gap-2 ml-1 shrink-0">
        <button
          type="button"
          onClick={onSend}
          disabled={sending}
          className="flex h-9 w-9 items-center justify-center rounded-full bg-white text-violet-600 shadow-md hover:bg-violet-50 disabled:opacity-60"
          title="Enviar áudio gravado"
          aria-label="Enviar áudio gravado"
        >
          {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
        </button>
        <button
          type="button"
          onClick={onDiscard}
          className="flex h-9 w-9 items-center justify-center rounded-full border border-white/70 text-white/90 hover:bg-white/10"
          title="Descartar gravação"
          aria-label="Descartar gravação"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

/** Barra enquanto está gravando (mostra tempo e "ondas" animadas). Degradê roxo igual ao preview. */
function RecordingInProgressBar({
  seconds,
  onStop,
}: {
  seconds: number;
  onStop: () => void;
}) {
  const [levels, setLevels] = useState<number[]>([0.4, 0.7, 0.5, 0.8, 0.6, 0.75]);

  useEffect(() => {
    const id = setInterval(() => {
      setLevels((prev) =>
        prev.map(() => 0.3 + Math.random() * 0.7)
      );
    }, 160);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="flex items-center gap-4 rounded-xl bg-gradient-to-r from-violet-500 via-purple-400 to-fuchsia-400 px-5 py-3 shadow-lg text-white">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onStop}
          className="flex h-11 w-11 items-center justify-center rounded-full bg-white text-violet-600 shadow-md hover:bg-violet-50"
          aria-label="Parar gravação"
        >
          <Square className="h-5 w-5" />
        </button>
        <div className="flex flex-col gap-1">
          <span className="text-xs font-semibold uppercase tracking-wide text-violet-100/90">
            Gravando áudio…
          </span>
          <span className="text-sm font-medium text-white">
            {formatDuration(seconds)}
          </span>
        </div>
      </div>
      <div className="flex-1 flex items-center justify-center">
        <div className="flex items-end gap-1 h-8 w-full max-w-xs">
          {levels.map((h, idx) => (
            <div
              // eslint-disable-next-line react/no-array-index-key
              key={idx}
              className="flex-1 rounded-full bg-white/40 transition-all"
              style={{ height: `${h * 100}%` }}
            />
          ))}
        </div>
      </div>
      <div className="hidden sm:flex flex-col items-end text-[11px] text-violet-100/90">
        <span>Toque em parar para revisar</span>
        <span>O áudio só será enviado depois da confirmação.</span>
      </div>
    </div>
  );
}

/** Player de vídeo com fallback em caso de erro de carregamento (ex.: CORS, URL inválida). */
function VideoPlayerWithFallback({
  src,
  canFetchDownload,
  downloadLoading,
  onDownloadClick,
}: {
  src: string;
  canFetchDownload?: boolean;
  downloadLoading?: boolean;
  onDownloadClick?: () => void;
}) {
  const [error, setError] = useState(false);
  const url = src || "";

  useEffect(() => {
    setError(false);
  }, [url]);

  return (
    <>
      {!error ? (
        <video
          src={url}
          controls
          preload="auto"
          className="w-full max-h-[360px] min-h-[200px] object-contain rounded-xl"
          playsInline
          onError={() => setError(true)}
        />
      ) : (
        <div className="flex flex-col items-center justify-center gap-2 py-8 px-4 rounded-xl bg-[#0F172A]/80 text-white/90 text-center">
          <p className="text-sm font-medium">Não foi possível carregar o vídeo</p>
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-clicvend-orange hover:underline"
          >
            Abrir em nova aba
          </a>
        </div>
      )}
      {canFetchDownload && !error && (
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="absolute bottom-2 right-2 z-10 flex h-8 w-8 items-center justify-center rounded-full bg-black/60 text-white hover:bg-clicvend-orange transition-colors"
          title="Baixar vídeo"
        >
          <Download className="h-4 w-4" />
        </a>
      )}
    </>
  );
}

/** Retorna se a URL é utilizável diretamente no front (reproduzir/abrir). */
function isPlayableOrDirectUrl(url: string | null | undefined): boolean {
  if (!url?.trim()) return false;
  return url.startsWith("http") || url.startsWith("data:");
}

/** Cache local de URLs de mídia por messageId (evita refetch ao navegar entre abas). */
const mediaUrlCache = new Map<string, string>();

/** Inferir tipo de mídia para mensagens já na conversa (message_type vazio ou conteúdo em formato antigo). */
function inferDisplayType(messageType: string | undefined, content: string, m?: { file_name?: string | null; media_url?: string | null }): string {
  const c = (content ?? "").trim();
  const fileName = (m?.file_name ?? "").toLowerCase();
  const mediaUrlRaw = (m?.media_url ?? "").toString();
  const t = (messageType ?? "").trim().toLowerCase();

  // Prioridade: file_name e media_url indicam o tipo real (evita vídeo exibir player de áudio)
  const videoExt = /\.(mp4|webm|mov|avi|mkv|m4v|3gp)(\?|$)/i;
  const audioExt = /\.(mp3|ogg|m4a|wav|opus|aac|oga|weba)(\?|$)/i;
  if (fileName && videoExt.test(fileName)) return "video";
  if (fileName && audioExt.test(fileName)) return "audio";
  if (mediaUrlRaw) {
    if (mediaUrlRaw.length < 2000 && (videoExt.test(mediaUrlRaw) || /data:video\//i.test(mediaUrlRaw))) return "video";
    if (mediaUrlRaw.length < 2000 && (audioExt.test(mediaUrlRaw) || /data:audio\//i.test(mediaUrlRaw))) return "audio";
    const prefix = mediaUrlRaw.slice(0, 80);
    if (/data:video\//i.test(prefix)) return "video";
    if (/data:audio\//i.test(prefix)) return "audio";
  }

  // Tipos explícitos de mídia vindos da API
  if (t && t !== "text" && t !== "document" && t !== "media") {
    if (t === "ptv" || t === "video") return "video";   // API usa "ptv" para vídeo
    if (t === "myaudio") return "audio";                // API usa "myaudio" para áudio
    return t; // audio, ptt, image, sticker, etc.
  }
  const match = c.match(/^\[(image|video|audio|document|ptt|media|sticker|vídeo|áudio|imagem)\]$/i);
  if (match) {
    const k = match[1].toLowerCase();
    if (k === "media") return "document";
    if (k === "vídeo") return "video";
    if (k === "áudio") return "audio";
    if (k === "imagem") return "image";
    return k;
  }
  // Conteúdo explícito sem colchetes
  if (/^áudio$|^audio$/i.test(c) || c === "[Áudio]") return "audio";
  if (/^vídeo$|^video$/i.test(c) || c === "[Vídeo]") return "video";
  if (/^imagem$|^image$/i.test(c) || c === "[Imagem]") return "image";
  if (m?.file_name || /^documento$/i.test(c) || c === "[Documento]") return "document";
  if (/^document$/i.test(c)) return "document";
  if (m?.media_url && !c && !t) return "document"; // mídia sem tipo nem conteúdo → documento genérico
  return "text";
}

/** Mensagens que são mídia/documento para listar no painel do contato. */
function getMediaMessages(messages: Message[] | undefined): Message[] {
  if (!Array.isArray(messages)) return [];
  return messages.filter((m) => {
    const type = inferDisplayType(m.message_type, m.content ?? "", m);
    return ["image", "video", "document", "audio", "ptt"].includes(type);
  });
}

function mediaTypeLabel(type: string): string {
  switch (type) {
    case "image": return "Imagem";
    case "video": return "Vídeo";
    case "document": return "Documento";
    case "audio":
    case "ptt": return "Áudio";
    default: return "Arquivo";
  }
}

/** Retorna o tipo de arquivo para badge (PDF, DOC, XLS, etc.) a partir do filename. */
function getDocumentTypeBadge(fileName: string | null | undefined): string {
  const fn = (fileName ?? "").toLowerCase();
  if (fn.endsWith(".pdf")) return "PDF";
  if (fn.endsWith(".doc") || fn.endsWith(".docx")) return "DOC";
  if (fn.endsWith(".xls") || fn.endsWith(".xlsx")) return "XLS";
  if (fn.endsWith(".ppt") || fn.endsWith(".pptx")) return "PPT";
  if (fn.endsWith(".txt")) return "TXT";
  if (fn.endsWith(".csv")) return "CSV";
  return "DOC";
}

/** Verifica se o arquivo é PDF (para exibir miniatura em iframe). */
function isPdfFile(fileName: string | null | undefined): boolean {
  return (fileName ?? "").toLowerCase().endsWith(".pdf");
}

/** Documentos sem extensão ou genéricos: tentar preview como PDF (extratos, boletos costumam ser PDF). */
function mayBePdf(fileName: string | null | undefined): boolean {
  const fn = (fileName ?? "").toLowerCase().trim();
  if (!fn || fn === "documento") return true;
  if (fn.endsWith(".pdf")) return true;
  if (fn.endsWith(".doc") || fn.endsWith(".docx") || fn.endsWith(".xls") || fn.endsWith(".xlsx")) return false;
  return true; // extensão desconhecida: tentar PDF
}

function MessageBubble({
  m,
  name,
  conversationId,
  apiHeaders,
  onReaction,
  onDeleteMessage,
}: {
  m: Message;
  name: string;
  conversationId?: string;
  apiHeaders?: Record<string, string>;
  onReaction?: (messageId: string, emoji: string) => void;
  onDeleteMessage?: (messageId: string, forEveryone: boolean) => void;
}) {
  const type = m.message_type ?? "text";
  const displayType = inferDisplayType(type, m.content ?? "", m);
  const rawMediaUrl = m.media_url;
  const fileName = (m.file_name ?? "").toLowerCase();
  const videoMime = /\.(webm|ogg|ogv)(\?|$)/i.test(fileName) ? "video/webm" : "video/mp4";
  const mediaUrl = rawMediaUrl && (rawMediaUrl.startsWith("http") || rawMediaUrl.startsWith("data:"))
    ? rawMediaUrl
    : rawMediaUrl
      ? (displayType === "image"
          ? `data:image/jpeg;base64,${rawMediaUrl}`
          : displayType === "audio" || displayType === "ptt"
            ? `data:audio/ogg;base64,${rawMediaUrl}`
            : displayType === "video"
              ? `data:${videoMime};base64,${rawMediaUrl}`
              : rawMediaUrl)
      : null;
  // Prioridade: media_cached_url (API) > cache local > fetch /download
  const cachedFromApi = m.media_cached_url && isPlayableOrDirectUrl(m.media_cached_url) ? m.media_cached_url : null;
  const cachedFromLocal = m.id && !String(m.id).startsWith("temp-") ? mediaUrlCache.get(m.id) : null;
  const immediateUrl = cachedFromApi || cachedFromLocal || null;
  const caption = m.caption ?? m.content;
  const captionTrim = String(caption ?? "").trim();
  const captionNormalized = captionTrim.toLowerCase().replace(/^\[|\]$/g, "").trim();
  const isPlaceholderCaption = ["document", "documento", "media", "video", "audio", "ptt", "vídeo", "áudio", "image", "imagem"].includes(captionNormalized) || /^\[?(document|documento|media|video|audio|ptt|vídeo|áudio|image|imagem)\]?$/i.test(captionTrim);
  const contentTrim = String(m.content ?? "").trim();
  const contentNormalized = contentTrim.toLowerCase().replace(/^\[|\]$/g, "").trim();
  const isContentPlaceholder = ["document", "documento", "media", "video", "audio", "ptt", "vídeo", "áudio", "image", "imagem"].includes(contentNormalized) || /^\[?(document|documento|media|video|audio|ptt|vídeo|áudio|image|imagem)\]?$/i.test(contentTrim);
  const displayCaptionForMedia = (displayType === "video" || displayType === "document") && isPlaceholderCaption && m.content && !isContentPlaceholder ? m.content : caption;
  const showCaptionForMedia = displayCaptionForMedia && ((displayType === "video" || displayType === "document") ? !(isPlaceholderCaption && isContentPlaceholder) : !isPlaceholderCaption);

  const [downloadUrl, setDownloadUrl] = useState<string | null>(immediateUrl ?? null);
  const [downloadLoading, setDownloadLoading] = useState(false);
  const [documentPreviewFailed, setDocumentPreviewFailed] = useState(false);
  const [mediaLoadFailed, setMediaLoadFailed] = useState(false);
  const [reactionPickerOpen, setReactionPickerOpen] = useState(false);
  const [deleteMenuOpen, setDeleteMenuOpen] = useState(false);
  const pickerRef = useRef<HTMLDivElement>(null);
  const pickerPortalRef = useRef<HTMLDivElement>(null);
  const deleteMenuRef = useRef<HTMLDivElement>(null);

  // Permite buscar mídia por message id mesmo sem external_id no snapshot (mensagens recebidas antigas)
  const canFetchDownload = Boolean(
    conversationId && apiHeaders && m.id && !String(m.id).startsWith("temp-") &&
    ["audio", "ptt", "document", "image", "video"].includes(displayType)
  );
  const hasResolvedUrl = immediateUrl || downloadUrl || (mediaUrl && isPlayableOrDirectUrl(mediaUrl));
  const needsDownloadForPlay = (displayType === "audio" || displayType === "ptt") && !hasResolvedUrl && canFetchDownload;
  const needsDownloadForMedia = (displayType === "image" || displayType === "video") && !hasResolvedUrl && canFetchDownload;
  const needsDownloadForDocument = displayType === "document" && !hasResolvedUrl && canFetchDownload;

  useEffect(() => {
    if (immediateUrl) {
      if (m.id && !String(m.id).startsWith("temp-")) mediaUrlCache.set(m.id, immediateUrl);
      return;
    }
    if (!(needsDownloadForPlay || needsDownloadForMedia || needsDownloadForDocument) || !conversationId || !apiHeaders || !m.id) return;
    let cancelled = false;
    setDownloadLoading(true);
    fetch(`/api/conversations/${conversationId}/messages/${m.id}/download`, { credentials: "include", headers: apiHeaders })
      .then((r) => (r.ok ? r.json() : null))
      .then((data: { fileURL?: string } | null) => {
        if (!cancelled && data?.fileURL) {
          setDownloadUrl(data.fileURL);
          if (m.id) mediaUrlCache.set(m.id, data.fileURL);
        }
      })
      .finally(() => { if (!cancelled) setDownloadLoading(false); });
    return () => { cancelled = true; };
  }, [immediateUrl, needsDownloadForPlay, needsDownloadForMedia, needsDownloadForDocument, conversationId, apiHeaders, m.id]);

  const effectiveMediaUrl = immediateUrl || downloadUrl || mediaUrl;

  const resolvedDisplayType = (() => {
    const base = displayType;
    const url = (effectiveMediaUrl || "").toString().toLowerCase();
    if (!url) return base;
    const videoExt2 = /\.(mp4|webm|mov|avi|mkv|m4v|3gp)(\?|$)/i;
    const audioExt2 = /\.(mp3|ogg|m4a|wav|opus|aac|oga|weba)(\?|$)/i;
    if (audioExt2.test(url) || url.startsWith("data:audio/")) return "audio";
    if (videoExt2.test(url) || url.startsWith("data:video/")) return "video";
    return base;
  })();

  // Detectar link expirado no preview de documento (PDF): HEAD na URL; se 400/403, mostrar fallback
  const isDocumentPdfPreview = resolvedDisplayType === "document" && Boolean(effectiveMediaUrl) && mayBePdf(m.file_name);
  useEffect(() => {
    if (!isDocumentPdfPreview || !effectiveMediaUrl) {
      setDocumentPreviewFailed(false);
      return;
    }
    let cancelled = false;
    fetch(effectiveMediaUrl, { method: "HEAD" })
      .then((res) => {
        if (!cancelled && (res.status === 400 || res.status === 403)) setDocumentPreviewFailed(true);
        else if (!cancelled) setDocumentPreviewFailed(false);
      })
      .catch(() => {
        if (!cancelled) setDocumentPreviewFailed(false);
      });
    return () => { cancelled = true; };
  }, [isDocumentPdfPreview, effectiveMediaUrl]);

  // Detectar link expirado em áudio/vídeo: HEAD na URL; se 400/403, mostrar fallback "Carregar de novo"
  const isMediaWithUrl = (resolvedDisplayType === "audio" || resolvedDisplayType === "ptt" || resolvedDisplayType === "video") && Boolean(effectiveMediaUrl);
  useEffect(() => {
    if (!isMediaWithUrl || !effectiveMediaUrl) {
      setMediaLoadFailed(false);
      return;
    }
    let cancelled = false;
    fetch(effectiveMediaUrl, { method: "HEAD" })
      .then((res) => {
        if (!cancelled && (res.status === 400 || res.status === 403)) setMediaLoadFailed(true);
        else if (!cancelled) setMediaLoadFailed(false);
      })
      .catch(() => {
        if (!cancelled) setMediaLoadFailed(false);
      });
    return () => { cancelled = true; };
  }, [isMediaWithUrl, effectiveMediaUrl]);

  const audioSrc = (resolvedDisplayType === "audio" || resolvedDisplayType === "ptt") ? effectiveMediaUrl : null;

  useEffect(() => {
    if (!reactionPickerOpen) return;
    const close = (e: MouseEvent) => {
      const target = e.target as Node;
      const inButton = pickerRef.current?.contains(target);
      const inPicker = pickerPortalRef.current?.contains(target);
      if (!inButton && !inPicker) setReactionPickerOpen(false);
    };
    document.addEventListener("click", close, true);
    return () => document.removeEventListener("click", close, true);
  }, [reactionPickerOpen]);

  useEffect(() => {
    if (!deleteMenuOpen) return;
    const close = (e: MouseEvent) => {
      if (deleteMenuRef.current && !deleteMenuRef.current.contains(e.target as Node)) setDeleteMenuOpen(false);
    };
    document.addEventListener("click", close, true);
    return () => document.removeEventListener("click", close, true);
  }, [deleteMenuOpen]);

  async function handleDownloadClick() {
    if (effectiveMediaUrl) {
      window.open(effectiveMediaUrl, "_blank", "noopener,noreferrer");
      return;
    }
    if (!conversationId || !apiHeaders || !m.id) return;
    setDownloadLoading(true);
    try {
      const res = await fetch(`/api/conversations/${conversationId}/messages/${m.id}/download`, { credentials: "include", headers: apiHeaders });
      const data = await res.json().catch(() => ({}));
      if (data?.fileURL) {
        setDownloadUrl(data.fileURL);
        if (m.id) mediaUrlCache.set(m.id, data.fileURL);
        window.open(data.fileURL, "_blank", "noopener,noreferrer");
      }
    } finally {
      setDownloadLoading(false);
    }
  }

  async function fetchFreshMediaUrl(): Promise<string | null> {
    if (!conversationId || !apiHeaders || !m.id) return null;
    const res = await fetch(
      `/api/conversations/${conversationId}/messages/${m.id}/download?refresh=1`,
      { credentials: "include", headers: apiHeaders }
    );
    const data = await res.json().catch(() => ({}));
    if (data?.fileURL) {
      setDownloadUrl(data.fileURL);
      if (m.id) mediaUrlCache.set(m.id, data.fileURL);
      return data.fileURL;
    }
    return null;
  }

  async function handleRefreshDocumentPreview() {
    if (!conversationId || !apiHeaders || !m.id) return;
    setDownloadLoading(true);
    try {
      const url = await fetchFreshMediaUrl();
      if (url) setDocumentPreviewFailed(false);
    } finally {
      setDownloadLoading(false);
    }
  }

  async function handleRefreshMedia() {
    if (!conversationId || !apiHeaders || !m.id) return;
    setDownloadLoading(true);
    try {
      await fetchFreshMediaUrl();
      setMediaLoadFailed(false);
    } finally {
      setDownloadLoading(false);
    }
  }

  if (displayType === "internal_note") {
    return (
      <div className="rounded-lg bg-purple-50 border border-purple-100 text-[#1E293B] max-w-[69%] px-3 py-2">
        <div className="flex items-center gap-1.5 mb-1 text-purple-600">
          <FileText className="h-3 w-3" />
          <span className="text-[10px] font-bold uppercase tracking-wider">Comentário Interno</span>
        </div>
        <div className="whitespace-pre-wrap text-sm">{m.content}</div>
        <div className="mt-1 flex items-center justify-end gap-1">
          <span className="text-[10px] text-purple-400">
            {new Date(m.sent_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
          </span>
        </div>
      </div>
    );
  }

  return (
    <div
      className={`rounded-lg ${
        ["audio", "ptt"].includes(resolvedDisplayType)
          ? "bg-transparent border-0 text-[#1E293B]"
          : m.direction === "out"
            ? "bg-[#E2E8F0] border border-[#CBD5E1] text-[#1E293B]"
            : "bg-white border border-[#E2E8F0] text-[#1E293B]"
      } ${
        resolvedDisplayType === "document"
          ? "max-w-[41%] min-w-0 w-full px-1 py-0.5"
          : ["video", "image"].includes(resolvedDisplayType)
            ? "max-w-[77%] min-w-0 w-full px-1 py-0.5"
            : ["audio", "ptt"].includes(resolvedDisplayType)
              ? "max-w-[65%] min-w-0 w-full px-1 py-0.5"
              : "max-w-[69%] px-3 py-2"
      }`}
    >
      <p className="text-xs font-medium text-[#64748B] mb-0.5 flex items-center gap-2">
        {m.direction === "out" ? "Você" : name}
        {typeof m.id === "string" && m.id.startsWith("temp-") && (
          <span className="text-[#64748B] font-normal animate-pulse">Enviando…</span>
        )}
      </p>
      {resolvedDisplayType === "image" && (effectiveMediaUrl || needsDownloadForMedia) && (
        <div className="w-full space-y-0.5">
          {effectiveMediaUrl ? (
            <>
              <a
                href={effectiveMediaUrl || "#"}
                target="_blank"
                rel="noopener noreferrer"
                className="block rounded-xl overflow-hidden border border-[#E2E8F0] shadow-sm hover:shadow-md transition-shadow focus:outline-none focus:ring-2 focus:ring-clicvend-orange/50"
              >
                <img
                  src={effectiveMediaUrl || ""}
                  alt=""
                  className="max-h-[380px] min-h-[140px] w-full object-cover cursor-pointer"
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
          {caption && !isPlaceholderCaption && <p className="whitespace-pre-wrap text-sm">{caption}</p>}
        </div>
      )}
      {resolvedDisplayType === "video" && (effectiveMediaUrl || needsDownloadForMedia || canFetchDownload) && (
        <div className="w-full space-y-0.5">
          {mediaLoadFailed && effectiveMediaUrl ? (
            <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] px-4 py-6 text-center">
              <p className="text-sm text-[#64748B]">Link expirado. Clique para carregar de novo.</p>
              <button
                type="button"
                onClick={handleRefreshMedia}
                disabled={downloadLoading}
                className="text-sm font-medium text-clicvend-orange hover:underline disabled:opacity-50"
              >
                {downloadLoading ? "Carregando…" : "Carregar de novo"}
              </button>
            </div>
          ) : effectiveMediaUrl ? (
            <>
              <div className="relative rounded-lg overflow-hidden border border-[#E2E8F0] shadow-sm w-full bg-[#0F172A] group">
                <span className="absolute top-1.5 left-1.5 z-10 rounded bg-black/60 px-1.5 py-0.5 text-[10px] font-medium text-white uppercase tracking-wide">
                  Vídeo
                </span>
                <VideoPlayerWithFallback
                  key={effectiveMediaUrl}
                  src={effectiveMediaUrl || ""}
                  canFetchDownload={canFetchDownload}
                  downloadLoading={!effectiveMediaUrl && downloadLoading}
                  onDownloadClick={handleDownloadClick}
                />
              </div>
              {canFetchDownload && !effectiveMediaUrl && downloadLoading && (
                <button type="button" disabled className="inline-flex items-center gap-1.5 text-xs text-[#64748B]">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" /> Baixar…
                </button>
              )}
            </>
          ) : (
            <div className="flex items-center gap-2 rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] px-3 py-4 w-full">
              <Loader2 className="h-6 w-6 animate-spin shrink-0 text-clicvend-orange" />
              <div>
                <p className="text-sm font-medium text-[#475569]">Carregando vídeo…</p>
                <p className="text-xs text-[#64748B]">A miniatura aparecerá em instantes.</p>
              </div>
            </div>
          )}
          {showCaptionForMedia && (
            <p className="whitespace-pre-wrap text-sm text-[#1E293B]">{displayCaptionForMedia}</p>
          )}
        </div>
      )}
      {(resolvedDisplayType === "audio" || resolvedDisplayType === "ptt") && (audioSrc || downloadLoading || mediaUrl || canFetchDownload) && (
        <div className="w-full space-y-0.5">
          {mediaLoadFailed && audioSrc ? (
            <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] px-4 py-4 text-center">
              <p className="text-sm text-[#64748B]">Link expirado. Clique para carregar de novo.</p>
              <button
                type="button"
                onClick={handleRefreshMedia}
                disabled={downloadLoading}
                className="text-sm font-medium text-clicvend-orange hover:underline disabled:opacity-50"
              >
                {downloadLoading ? "Carregando…" : "Carregar de novo"}
              </button>
            </div>
          ) : (
            <ChatAudioPlayer
              key={audioSrc ?? "no-src"}
              src={audioSrc}
              direction={m.direction}
              isLoading={downloadLoading || (canFetchDownload && !audioSrc && !(mediaUrl && (mediaUrl.startsWith("http") || mediaUrl.startsWith("data:"))))}
              onDownload={audioSrc ? () => window.open(audioSrc!, "_blank") : undefined}
            />
          )}
          {caption && !isPlaceholderCaption && <p className="whitespace-pre-wrap text-sm mt-1">{caption}</p>}
        </div>
      )}
      {resolvedDisplayType === "document" && (
        <div className="w-full space-y-0 min-w-0">
          {/* Miniatura: preview do PDF ou ícone genérico */}
          <div className="rounded-t-lg overflow-hidden border border-b-0 border-[#E2E8F0] bg-white">
            {effectiveMediaUrl && mayBePdf(m.file_name) && documentPreviewFailed ? (
              <div className="flex flex-col items-center justify-center gap-3 h-[200px] bg-[#F8FAFC] px-4 text-center">
                <p className="text-sm text-[#64748B]">Link expirado. Clique para carregar de novo.</p>
                <button
                  type="button"
                  onClick={handleRefreshDocumentPreview}
                  disabled={downloadLoading}
                  className="text-sm font-medium text-clicvend-orange hover:underline disabled:opacity-50"
                >
                  {downloadLoading ? "Carregando…" : "Carregar de novo"}
                </button>
              </div>
            ) : effectiveMediaUrl && mayBePdf(m.file_name) ? (
              <div className="relative w-full h-[200px] bg-white overflow-hidden">
                <iframe
                  key={effectiveMediaUrl}
                  src={effectiveMediaUrl}
                  title={m.file_name || "Documento"}
                  className="w-full h-full border-0"
                />
              </div>
            ) : effectiveMediaUrl ? (
              <div className="flex items-center justify-center h-[140px] bg-[#F8FAFC]">
                <div className="flex flex-col items-center gap-2 text-[#94A3B8]">
                  <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-red-100 text-red-600">
                    <FileText className="h-7 w-7" />
                  </div>
                  <span className="text-xs font-medium text-[#64748B]">{getDocumentTypeBadge(m.file_name)}</span>
                </div>
              </div>
            ) : needsDownloadForDocument && downloadLoading ? (
              <div className="flex items-center justify-center h-[140px] bg-[#F8FAFC]">
                <Loader2 className="h-8 w-8 animate-spin text-clicvend-orange" />
              </div>
            ) : (
              <div className="flex items-center justify-center h-[140px] bg-[#F8FAFC]">
                <div className="flex flex-col items-center gap-2 text-[#94A3B8]">
                  <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-red-100 text-red-600">
                    <FileText className="h-7 w-7" />
                  </div>
                  <span className="text-xs font-medium text-[#64748B]">{getDocumentTypeBadge(m.file_name)}</span>
                </div>
              </div>
            )}
          </div>
          {/* Info: badge do tipo e nome do arquivo (sem botões) */}
          <div
            className={`flex items-center gap-3 border-x border-[#E2E8F0] py-2.5 px-3 min-w-0 ${
              m.direction === "out" ? "bg-[#E2E8F0]" : "bg-[#F1F5F9]"
            }`}
          >
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-red-600 text-white text-xs font-bold">
              {getDocumentTypeBadge(m.file_name)}
            </div>
            <p className="truncate text-sm font-medium text-[#1E293B] min-w-0 flex-1">
              {m.file_name || "Documento"}
            </p>
          </div>
          {/* Footer: botões Abrir e Salvar como */}
          <div
            className={`flex items-center justify-end gap-4 rounded-b-lg border border-[#E2E8F0] py-2.5 px-3 ${
              m.direction === "out" ? "bg-[#E2E8F0]" : "bg-[#F1F5F9]"
            }`}
          >
            {effectiveMediaUrl ? (
              <>
                <a
                  href={effectiveMediaUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs font-medium text-clicvend-orange hover:underline"
                >
                  Abrir
                </a>
                <a
                  href={effectiveMediaUrl}
                  download={m.file_name || "documento"}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs font-medium text-clicvend-orange hover:underline"
                >
                  Salvar como…
                </a>
              </>
            ) : needsDownloadForDocument ? (
              <>
                <button
                  type="button"
                  onClick={handleDownloadClick}
                  disabled={downloadLoading}
                  className="text-xs font-medium text-clicvend-orange hover:underline disabled:opacity-50"
                >
                  {downloadLoading ? "Carregando…" : "Abrir"}
                </button>
                <button
                  type="button"
                  onClick={handleDownloadClick}
                  disabled={downloadLoading}
                  className="text-xs font-medium text-clicvend-orange hover:underline disabled:opacity-50"
                >
                  {downloadLoading ? "…" : "Salvar como…"}
                </button>
              </>
            ) : null}
          </div>
          {needsDownloadForDocument && !effectiveMediaUrl && !downloadLoading && (
            <div className="flex justify-end gap-4 py-2">
              <button type="button" onClick={handleDownloadClick} className="text-xs font-medium text-clicvend-orange hover:underline">
                Abrir
              </button>
              <button type="button" onClick={handleDownloadClick} className="text-xs font-medium text-clicvend-orange hover:underline">
                Salvar como…
              </button>
            </div>
          )}
          {showCaptionForMedia && (
            <p className="whitespace-pre-wrap text-sm mt-1">{displayCaptionForMedia}</p>
          )}
        </div>
      )}
      {displayType === "sticker" && effectiveMediaUrl && (
        <div>
          <div className="rounded-xl overflow-hidden border border-[#E2E8F0] shadow-sm inline-block">
            <img src={effectiveMediaUrl} alt="" className="max-h-32 w-auto block" />
          </div>
          {canFetchDownload && (
            <button type="button" onClick={handleDownloadClick} disabled={downloadLoading} className="mt-1 inline-flex items-center gap-1.5 text-xs text-clicvend-orange hover:underline disabled:opacity-50">
              {downloadLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
              Baixar
            </button>
          )}
        </div>
      )}
      {displayType === "text" && (
        <p className="whitespace-pre-wrap text-sm">{m.content}</p>
      )}
      <footer className={`${["video", "audio", "ptt", "image", "document"].includes(resolvedDisplayType) ? "mt-1 pt-1" : "mt-2 pt-1.5"} border-t border-[#E2E8F0]/60 flex items-center justify-between gap-2 flex-wrap`}>
        <div className="flex items-center gap-1.5 min-w-0 flex-wrap">
          <span className="text-xs text-[#64748B]">
            {new Date(m.sent_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
          </span>
          {m.reaction && (
            <span className="text-sm" title="Reação">
              {m.reaction}
            </span>
          )}
        </div>
        <div className="flex items-center gap-0.5">
          {m.direction === "out" && (
            <CheckCheck className="h-3.5 w-3.5 text-[#64748B] shrink-0" aria-hidden />
          )}
          {conversationId && apiHeaders && onDeleteMessage && !String(m.id).startsWith("temp-") && (
            <div className="relative" ref={deleteMenuRef}>
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); setDeleteMenuOpen((v) => !v); }}
                className="p-1 rounded hover:bg-black/10 text-[#64748B] hover:text-red-600 transition-colors"
                title="Apagar mensagem"
                aria-label="Apagar mensagem"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
              {deleteMenuOpen && (
                <div className="absolute right-0 bottom-full mb-1 rounded-lg border border-[#E2E8F0] bg-white shadow-lg py-1 min-w-[160px] z-50">
                  <button
                    type="button"
                    onClick={() => { onDeleteMessage(m.id, false); setDeleteMenuOpen(false); }}
                    className="w-full flex items-center gap-2 px-3 py-2 text-sm text-[#64748B] hover:bg-[#F1F5F9] hover:text-[#1E293B] text-left"
                  >
                    <Trash2 className="h-4 w-4 shrink-0" /> Apagar para mim
                  </button>
                  <button
                    type="button"
                    onClick={() => { onDeleteMessage(m.id, true); setDeleteMenuOpen(false); }}
                    className="w-full flex items-center gap-2 px-3 py-2 text-sm text-[#64748B] hover:bg-red-50 hover:text-red-600 text-left"
                  >
                    <Trash2 className="h-4 w-4 shrink-0" /> Apagar para todos
                  </button>
                </div>
              )}
            </div>
          )}
          {conversationId && apiHeaders && onReaction && !String(m.id).startsWith("temp-") && (
            <div className="relative" ref={pickerRef}>
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); setReactionPickerOpen((v) => !v); }}
                className="p-1 rounded hover:bg-black/10 text-[#64748B] hover:text-[#1E293B] transition-colors"
                title="Reagir"
                aria-label="Reagir"
              >
                <Smile className="h-4 w-4" />
              </button>
              {reactionPickerOpen && (
                <div
                  ref={pickerPortalRef}
                  className={`absolute top-0 z-50 rounded-xl bg-white border border-[#E2E8F0] shadow-xl overflow-hidden w-[300px] ${
                    m.direction === "out" ? "right-full mr-2" : "left-full ml-2"
                  }`}
                  role="dialog"
                  aria-label="Escolher reação"
                >
                  <div className="max-h-[320px] overflow-auto">
                    <EmojiReactionPicker
                      onSelect={(emoji) => {
                        onReaction(m.id, m.reaction === emoji ? "" : emoji);
                        setReactionPickerOpen(false);
                      }}
                      onClose={() => setReactionPickerOpen(false)}
                    />
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </footer>
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
  const [optimisticMessages, setOptimisticMessages] = useState<Message[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [infoOpen, setInfoOpen] = useState(false);
  const [contactDetails, setContactDetails] = useState<ChatDetails | null>(null);
  const [contactDetailsLoading, setContactDetailsLoading] = useState(false);
  const [contactDetailsError, setContactDetailsError] = useState<string | null>(null);
  const [contactTags, setContactTags] = useState<{ id: string; name: string; color_hex: string | null; category_name: string }[]>([]);
  const [contactTagIds, setContactTagIds] = useState<string[]>([]);
  const [convTags, setConvTags] = useState<{ id: string; name: string; color_hex: string | null }[]>([]);
  const [convTagIds, setConvTagIds] = useState<string[]>([]);
  const [convTagIdsDraft, setConvTagIdsDraft] = useState<string[]>([]);
  const [savingConvTags, setSavingConvTags] = useState(false);
  const [tabulationForms, setTabulationForms] = useState<{ id: string; name: string; description: string | null; fields: { id: string; label: string; type: string; required: boolean; options?: string[] }[] }[]>([]);
  const [tabulationAnswers, setTabulationAnswers] = useState<Record<string, { answers: Record<string, unknown>; created_at: string }>>({});
  const [tabulationLoading, setTabulationLoading] = useState(false);
  const [formAnswerOpen, setFormAnswerOpen] = useState<string | null>(null);
  const [formAnswerDraft, setFormAnswerDraft] = useState<Record<string, unknown>>({});
  const [savingFormAnswer, setSavingFormAnswer] = useState(false);
  const [attachOpen, setAttachOpen] = useState(false);
  const [recording, setRecording] = useState(false);
  const [recordedAudioBlob, setRecordedAudioBlob] = useState<Blob | null>(null);
  const [recordedAudioPreviewUrl, setRecordedAudioPreviewUrl] = useState<string | null>(null);
  const [recordingVideo, setRecordingVideo] = useState(false);
  const [recordedVideoBlob, setRecordedVideoBlob] = useState<{ blob: Blob; mimeType: string } | null>(null);
  const [recordedVideoPreviewUrl, setRecordedVideoPreviewUrl] = useState<string | null>(null);
  const [chatMenuOpen, setChatMenuOpen] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deleteOptions, setDeleteOptions] = useState({ deleteChatDB: true, deleteMessagesDB: true, deleteChatWhatsApp: false });
  const [chatActionLoading, setChatActionLoading] = useState<string | null>(null);
  const [canTransfer, setCanTransfer] = useState(false);
  const [loadingOlderMessages, setLoadingOlderMessages] = useState(false);
  const [hasMoreOlderMessages, setHasMoreOlderMessages] = useState(true);
  const [inputEmojiPickerOpen, setInputEmojiPickerOpen] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const menuRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesScrollRef = useRef<HTMLDivElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const videoStreamRef = useRef<MediaStream | null>(null);
  const videoRecorderRef = useRef<MediaRecorder | null>(null);
  const videoChunksRef = useRef<Blob[]>([]);
  const discardVideoOnStopRef = useRef(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const videoPreviewRef = useRef<HTMLVideoElement>(null);
  const audioInputRef = useRef<HTMLInputElement>(null);
  const docInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);
  const inputEmojiPickerRef = useRef<HTMLDivElement>(null);
  const inputEmojiButtonRef = useRef<HTMLButtonElement>(null);

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


  const focusMode = useInboxStore((s) => s.focusMode);
  const setFocusMode = useInboxStore((s) => s.setFocusMode);
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
    refetchOnWindowFocus: false, // Evita refetch ao fechar picker de reação (reação sumia e voltava)
  });

  const [quickSearch, setQuickSearch] = useState<string | null>(null);
  const [quickIndex, setQuickIndex] = useState(0);
  const [inputTab, setInputTab] = useState<'write' | 'quick' | 'note'>('write');
  const [quickReplySearch, setQuickReplySearch] = useState('');
  const [correctingText, setCorrectingText] = useState(false);

  const { data: quickReplies } = useQuery({
    queryKey: ["quick-replies", slug],
    queryFn: () => fetch("/api/quick-replies", { headers: apiHeaders }).then((r) => r.json()).then((json) => Array.isArray(json?.data) ? json.data : []),
    enabled: !!slug,
    staleTime: 5 * 60 * 1000,
  });

  const filteredQuickReplies = useMemo(() => {
    // Se não há termo de busca (quickSearch é null), não retorna nada
    if (quickSearch === null || !Array.isArray(quickReplies)) return [];
    
    const currentQueueId = conv?.queue_id;
    const term = quickSearch.toLowerCase();
    
    return quickReplies.filter((qr: any) => {
      // 1. Filtrar por texto/atalho (apenas se o termo não estiver vazio)
      // Se term for "", exibe todos (comportamento ao digitar apenas /)
      const matchesTerm = term === "" || qr.shortCut?.toLowerCase().includes(term) || (qr.text && qr.text.toLowerCase().includes(term));
      if (!matchesTerm) return false;

      // 2. Filtrar por fila (Queue)
      // Se a resposta não tem filas vinculadas, é global -> Exibir
      const isGlobal = !qr.queueIds || qr.queueIds.length === 0;
      if (isGlobal) return true;

      // Se tem filas, exibir apenas se a conversa pertence a uma dessas filas
      if (currentQueueId && qr.queueIds.includes(currentQueueId)) return true;

      // Se tem filas mas a conversa não é de nenhuma delas (ou não tem fila), esconder
      return false;
    }).slice(0, 50);
  }, [quickReplies, quickSearch, conv?.queue_id]);

  const tabQuickReplies = useMemo(() => {
    if (!Array.isArray(quickReplies)) return [];
    
    const currentQueueId = conv?.queue_id;
    const term = quickReplySearch.toLowerCase();
    
    return quickReplies.filter((qr: any) => {
      const matchesTerm = term === "" || qr.shortCut?.toLowerCase().includes(term) || (qr.text && qr.text.toLowerCase().includes(term));
      if (!matchesTerm) return false;

      // Se tem filas, exibir apenas se a conversa pertence a uma dessas filas
      if (qr.queueIds && Array.isArray(qr.queueIds) && qr.queueIds.length > 0) {
        // Normalizar para string para evitar mismatch de tipos
        const allowedQueues = qr.queueIds.map(String);
        const currentQueue = String(currentQueueId || "");
        
        if (!currentQueue || !allowedQueues.includes(currentQueue)) return false;
      }
      return true;
    });
  }, [quickReplies, quickReplySearch, conv?.queue_id]);

  function selectQuickReply(qr: any) {
    if (qr.text) {
      setSendValue(qr.text);
    }
    setQuickSearch(null);
    setQuickIndex(0);
  }

  useEffect(() => {
    if (resolved?.id) setHasMoreOlderMessages(true);
  }, [resolved?.id]);

  useEffect(() => {
    if (convQueryError) setError(convQueryError instanceof Error ? convQueryError.message : "Erro ao carregar");
    else setError(null);
  }, [convQueryError]);

  const claimAttemptedRef = useRef(false);
  const contactDetailsFetchedForRef = useRef<string | null>(null);
  const tabulationFetchedForRef = useRef<string | null>(null);

  async function handleAICorrection() {
    if (!sendValue.trim()) return;
    setCorrectingText(true);
    try {
        const res = await fetch("/api/ai/correct-text", {
            method: "POST",
            headers: { "Content-Type": "application/json", ...apiHeaders },
            body: JSON.stringify({ text: sendValue }),
        });
        const data = await res.json();
        if (res.ok && data.corrected) {
            setSendValue(data.corrected);
        } else {
            setError(data.error || "Falha ao corrigir texto");
        }
    } catch {
        setError("Erro ao conectar com IA");
    } finally {
        setCorrectingText(false);
    }
  }

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
    if (!infoOpen || !resolved?.id || !conv?.id) {
      if (!infoOpen) {
        tabulationFetchedForRef.current = null;
        setContactTags([]);
        setContactTagIds([]);
        setConvTags([]);
        setConvTagIds([]);
        setConvTagIdsDraft([]);
        setTabulationForms([]);
        setTabulationAnswers({});
      }
      return;
    }
    if (tabulationFetchedForRef.current === conv.id) return;
    tabulationFetchedForRef.current = conv.id;
    setTabulationLoading(true);
    const number = conv.is_group && conv.wa_chat_jid
      ? conv.wa_chat_jid
      : (conv.customer_phone || conv.external_id || "").replace(/\D/g, "").trim() || conv.external_id || conv.customer_phone;
    const contactTagsUrl = conv.channel_id && number
      ? `/api/contact-tags?channel_id=${encodeURIComponent(conv.channel_id)}&number=${encodeURIComponent(number)}`
      : null;
    Promise.all([
      contactTagsUrl ? fetch(contactTagsUrl, { credentials: "include", headers: apiHeaders }).then((r) => r.json()) : Promise.resolve({ tags: [], selected_tag_ids: [] }),
      fetch(`/api/conversations/${resolved.id}/tags`, { credentials: "include", headers: apiHeaders }).then((r) => r.json()),
      fetch(`/api/conversations/${resolved.id}/form-answers`, { credentials: "include", headers: apiHeaders }).then((r) => r.json()),
    ])
      .then(([ctData, convTagsData, formData]) => {
        if (ctData?.tags) {
          setContactTags(Array.isArray(ctData.tags) ? ctData.tags : []);
          setContactTagIds(Array.isArray(ctData.selected_tag_ids) ? ctData.selected_tag_ids : []);
        }
        if (convTagsData?.tags != null && Array.isArray(convTagsData.tags)) {
          setConvTags(convTagsData.tags);
          const applied = Array.isArray(convTagsData.applied_tag_ids) ? convTagsData.applied_tag_ids : [];
          setConvTagIds(applied);
          setConvTagIdsDraft(applied);
        }
        if (formData?.forms != null && Array.isArray(formData.forms)) {
          setTabulationForms(formData.forms);
          setTabulationAnswers(formData.answers_by_form ?? {});
        }
      })
      .catch(() => {})
      .finally(() => setTabulationLoading(false));
  }, [infoOpen, conv?.id, conv?.channel_id, conv?.is_group, conv?.customer_phone, conv?.external_id, conv?.wa_chat_jid, resolved?.id, apiHeaders]);

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
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(json?.error ?? "Falha ao atribuir");
        return;
      }
      const assignedToName = json?.assigned_to_name ?? null;
      queryClient.setQueryData<ConversationDetail>(queryKeys.conversation(resolved.id), (prev) =>
        prev ? { ...prev, assigned_to: json?.assigned_to ?? currentUserId, assigned_to_name: assignedToName ?? prev.assigned_to_name, status: "in_progress" } : prev
      );
      await refetchConversation();
      queryClient.invalidateQueries({ queryKey: ["inbox", "conversations"] });
      queryClient.invalidateQueries({ queryKey: queryKeys.counts(slug) });
      window.dispatchEvent(new CustomEvent("conversations-status-reset"));
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

  function handleSend(e?: React.FormEvent, payload?: { type: string; file: string; caption?: string; docName?: string }) {
    e?.preventDefault();
    if (!resolved?.id) return;
    const isMedia = payload && payload.type && payload.file;
    const text = sendValue.trim();
    if (!isMedia && !text) return;
    setError(null);

    const tempId = `temp-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    const sentAt = new Date().toISOString();
    
    // Se for nota interna, tipo é 'internal_note'
    const isNote = inputTab === 'note';
    const msgType = isNote ? "internal_note" : (isMedia ? (payload!.type === "ptt" ? "ptt" : payload!.type) : "text");
    
    const content = isMedia ? (payload!.caption || `[${msgType}]`) : text;
    const optimistic: Message = {
      id: tempId,
      direction: "out",
      content,
      sent_at: sentAt,
      message_type: msgType,
      media_url: isMedia ? payload!.file : undefined,
      caption: payload?.caption,
      file_name: payload?.docName,
    };
    setOptimisticMessages((prev) => [...prev, optimistic]);
    if (!isMedia) setSendValue("");
    setSending(false);

    requestAnimationFrame(() => {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
    });

    const body = isMedia
      ? { type: payload!.type, file: payload!.file, caption: payload!.caption || "", docName: payload!.docName || "" }
      : { content: text, type: isNote ? "internal_note" : undefined };
    
    fetch(`/api/conversations/${resolved.id}/messages`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json", ...apiHeaders },
      body: JSON.stringify(body),
    })
      .then(async (res) => {
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          setError(err?.error ?? "Falha ao enviar");
          setOptimisticMessages((prev) => prev.filter((m) => m.id !== tempId));
          return;
        }
        const data = await res.json().catch(() => ({}));
        queryClient.invalidateQueries({ queryKey: ["inbox", "conversations"] });
        const newMsg = data?.message;
        if (newMsg && resolved?.id) {
          queryClient.setQueryData<ConversationDetail>(queryKeys.conversation(resolved.id), (c) => {
            if (!c) return c;
            const existing = Array.isArray(c.messages) ? c.messages : [];
            return { ...c, messages: [...existing, newMsg] };
          });
        } else {
          await refetchConversation();
        }
        setOptimisticMessages((prev) => prev.filter((m) => m.id !== tempId));
        requestAnimationFrame(() => {
          messagesEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
        });
      })
      .catch(() => {
        setError("Falha ao enviar");
        setOptimisticMessages((prev) => prev.filter((m) => m.id !== tempId));
      });
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

  async function onFileChoose(type: "image" | "document" | "audio" | "video", e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !resolved?.id) return;
    e.target.value = "";
    setSending(true);
    setError(null);
    try {
      const base64 = await fileToBase64(file);
      const uazType = type === "image" ? "image" : type === "audio" ? "audio" : type === "video" ? "video" : "document";
      handleSend(undefined, {
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
      recorder.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunks, { type: "audio/ogg; codecs=opus" });
        setRecordedAudioBlob(blob);
        setRecording(false);
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
    }
  }

  async function sendRecordedAudio() {
    if (!recordedAudioBlob || !resolved?.id || !apiHeaders) return;
    setError(null);
    const blob = recordedAudioBlob;
    setRecordedAudioBlob(null);
    setSending(false);

    const base64 = await new Promise<string>((res, rej) => {
      const r = new FileReader();
      r.onload = () => res((r.result as string).split(",")[1] || "");
      r.onerror = rej;
      r.readAsDataURL(blob);
    });
    const tempId = `temp-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    const sentAt = new Date().toISOString();
    const optimistic: Message = {
      id: tempId,
      direction: "out",
      content: "[ptt]",
      sent_at: sentAt,
      message_type: "ptt",
      media_url: `data:audio/ogg;base64,${base64}`,
    };
    setOptimisticMessages((prev) => [...prev, optimistic]);
    requestAnimationFrame(() => {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
    });

    fetch(`/api/conversations/${resolved.id}/messages`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json", ...apiHeaders },
      body: JSON.stringify({ type: "ptt", file: base64 }),
    })
      .then(async (res) => {
        if (res.ok) {
          const data = await res.json().catch(() => ({}));
          queryClient.invalidateQueries({ queryKey: ["inbox", "conversations"] });
          const newMsg = data?.message;
          if (newMsg && resolved?.id) {
            queryClient.setQueryData<ConversationDetail>(queryKeys.conversation(resolved.id), (c) => {
              if (!c) return c;
              const existing = Array.isArray(c.messages) ? c.messages : [];
              return { ...c, messages: [...existing, newMsg] };
            });
          } else {
            await refetchConversation();
          }
          setOptimisticMessages((prev) => prev.filter((m) => m.id !== tempId));
          requestAnimationFrame(() => {
            messagesEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
          });
        } else {
          setError("Falha ao enviar áudio");
          setOptimisticMessages((prev) => prev.filter((m) => m.id !== tempId));
        }
      })
      .catch(() => {
        setError("Falha ao enviar áudio");
        setOptimisticMessages((prev) => prev.filter((m) => m.id !== tempId));
      });
  }

  function discardRecordedAudio() {
    setRecordedAudioBlob(null);
  }

  useEffect(() => {
    if (!recordedAudioBlob) {
      setRecordedAudioPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(recordedAudioBlob);
    setRecordedAudioPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [recordedAudioBlob]);

  async function startRecordingVideo() {
    if (!resolved?.id || recordingVideo) return;
    setAttachOpen(false);
    setError(null);
    setRecordingVideo(true);
    await new Promise((r) => setTimeout(r, 100));
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      videoStreamRef.current = stream;
      const videoEl = videoPreviewRef.current;
      if (videoEl) {
        videoEl.srcObject = stream;
      }
      const mimeType = MediaRecorder.isTypeSupported("video/mp4")
        ? "video/mp4"
        : MediaRecorder.isTypeSupported("video/webm;codecs=vp9")
          ? "video/webm;codecs=vp9"
          : MediaRecorder.isTypeSupported("video/webm")
            ? "video/webm"
            : "video/mp4";
      const recorder = new MediaRecorder(stream, { mimeType });
      videoChunksRef.current = [];
      recorder.ondataavailable = (ev) => ev.data.size && videoChunksRef.current.push(ev.data);
      recorder.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        videoStreamRef.current = null;
        if (videoEl) videoEl.srcObject = null;
        if (discardVideoOnStopRef.current) {
          discardVideoOnStopRef.current = false;
          setRecordingVideo(false);
          return;
        }
        const blob = new Blob(videoChunksRef.current, { type: mimeType });
        setRecordedVideoBlob({ blob, mimeType });
        setRecordingVideo(false);
      };
      recorder.start(1000);
      videoRecorderRef.current = recorder;
      setRecordingVideo(true);
    } catch (err) {
      setError("Não foi possível acessar a câmera. Verifique as permissões do navegador.");
      setRecordingVideo(false);
    }
  }

  function stopRecordingVideo() {
    if (videoRecorderRef.current && recordingVideo) {
      videoRecorderRef.current.stop();
      videoRecorderRef.current = null;
    }
  }

  async function sendRecordedVideo() {
    const rec = recordedVideoBlob;
    if (!rec || !resolved?.id || !apiHeaders) return;
    setSending(true);
    setError(null);
    try {
      const base64 = await new Promise<string>((res, rej) => {
        const r = new FileReader();
        r.onload = () => res((r.result as string).split(",")[1] || "");
        r.onerror = rej;
        r.readAsDataURL(rec.blob);
      });
      const res = await fetch(`/api/conversations/${resolved.id}/messages`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json", ...apiHeaders },
        body: JSON.stringify({ type: "video", file: base64, mimetype: rec.mimeType }),
      });
      if (res.ok) {
        const data = await res.json().catch(() => ({}));
        setRecordedVideoBlob(null);
        queryClient.invalidateQueries({ queryKey: ["inbox", "conversations"] });
        const newMsg = data?.message;
        if (newMsg && resolved?.id) {
          queryClient.setQueryData<ConversationDetail>(queryKeys.conversation(resolved.id), (c) => {
            if (!c) return c;
            const existing = Array.isArray(c.messages) ? c.messages : [];
            return { ...c, messages: [...existing, newMsg] };
          });
        } else {
          await refetchConversation();
        }
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            messagesEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
          });
        });
      } else {
        const data = await res.json().catch(() => ({}));
        setError(typeof data?.error === "string" ? data.error : "Falha ao enviar vídeo");
      }
    } catch {
      setError("Falha ao enviar vídeo");
    } finally {
      setSending(false);
    }
  }

  function discardRecordedVideo() {
    setRecordedVideoBlob(null);
  }

  async function handleReaction(messageId: string, emoji: string) {
    if (!resolved?.id || !apiHeaders) return;
    const prev = queryClient.getQueryData<ConversationDetail>(queryKeys.conversation(resolved.id));
    const nextEmoji = emoji || null;
    if (prev?.messages) {
      queryClient.setQueryData<ConversationDetail>(queryKeys.conversation(resolved.id), {
        ...prev,
        messages: prev.messages.map((m) =>
          String(m.id) === String(messageId) ? { ...m, reaction: nextEmoji } : m
        ),
      });
    }
    try {
      const res = await fetch(`/api/conversations/${resolved.id}/messages/reaction`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json", ...apiHeaders },
        body: JSON.stringify({ message_id: messageId, emoji }),
      });
      if (!res.ok && prev) {
        queryClient.setQueryData(queryKeys.conversation(resolved.id), prev);
      }
    } catch {
      if (prev) {
        queryClient.setQueryData(queryKeys.conversation(resolved.id), prev);
      }
    }
  }

  async function handleDeleteMessage(messageId: string, forEveryone: boolean) {
    if (!resolved?.id || !apiHeaders) return;
    const prev = queryClient.getQueryData<ConversationDetail>(queryKeys.conversation(resolved.id));
    if (prev?.messages) {
      queryClient.setQueryData<ConversationDetail>(queryKeys.conversation(resolved.id), {
        ...prev,
        messages: prev.messages.filter((msg) => String(msg.id) !== String(messageId)),
      });
    }
    try {
      const res = await fetch(`/api/conversations/${resolved.id}/messages/${messageId}/delete`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json", ...apiHeaders },
        body: JSON.stringify({ forEveryone }),
      });
      if (res.ok) {
        await refetchConversation();
      } else {
        const data = await res.json().catch(() => ({}));
        setError(data?.error ?? "Falha ao apagar mensagem");
        if (prev) queryClient.setQueryData(queryKeys.conversation(resolved.id), prev);
      }
    } catch {
      setError("Falha ao apagar mensagem");
      if (prev) queryClient.setQueryData(queryKeys.conversation(resolved.id), prev);
    }
  }

  useEffect(() => {
    return () => {
      if (mediaRecorderRef.current && recording) {
        mediaRecorderRef.current.stop();
      }
    };
  }, [recording]);

  useEffect(() => {
    if (!inputEmojiPickerOpen) return;
    const close = (e: MouseEvent) => {
      const target = e.target as Node;
      const inPicker = inputEmojiPickerRef.current?.contains(target);
      const onButton = inputEmojiButtonRef.current?.contains(target);
      if (!inPicker && !onButton) setInputEmojiPickerOpen(false);
    };
    document.addEventListener("click", close, true);
    return () => document.removeEventListener("click", close, true);
  }, [inputEmojiPickerOpen]);

  useEffect(() => {
    if (!recording) {
      setRecordingSeconds(0);
      return;
    }
    const id = setInterval(() => {
      setRecordingSeconds((s) => s + 1);
    }, 1000);
    return () => clearInterval(id);
  }, [recording]);

  useEffect(() => {
    if (!recordedVideoBlob) {
      setRecordedVideoPreviewUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return null;
      });
      return;
    }
    const url = URL.createObjectURL(recordedVideoBlob.blob);
    setRecordedVideoPreviewUrl(url);
    return () => {
      URL.revokeObjectURL(url);
    };
  }, [recordedVideoBlob]);

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
        <button
          type="button"
          onClick={() => setFocusMode(!focusMode)}
          className="shrink-0 rounded p-1 text-[#64748B] hover:bg-[#F1F5F9] hover:text-[#1E293B] transition-colors"
          aria-label={focusMode ? "Sair do modo foco" : "Modo foco"}
          title={focusMode ? "Sair do modo foco (mostrar sidebar)" : "Modo foco: sidebar recolhida, abas com suas conversas"}
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
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
          <div className="flex items-center gap-2">
            <p className="font-medium text-[#1E293B] truncate">{isLoading ? "Carregando…" : (displayName || name)}</p>
          </div>
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            {!isLoading && displayPhone && displayPhone !== "—" && (
              <span className="rounded bg-[#F1F5F9] px-1.5 py-0.5 text-xs font-medium text-[#64748B]" title="Número normalizado para envio">
                {displayPhone}
              </span>
            )}
            {!isLoading && conv?.channel_name && (
              <span className="inline-flex items-center gap-1 rounded bg-clicvend-green/15 px-1.5 py-0.5 text-xs font-medium text-clicvend-green">
                <ChannelIcon variant="outline" channelName={conv.channel_name} size={14} />
                {conv.channel_name}
              </span>
            )}
            {!isLoading && conv?.queue_name && (
              <span className="rounded bg-[#E2E8F0] px-1.5 py-0.5 text-xs text-[#64748B]">
                Fila: {conv.queue_name}
              </span>
            )}
            {!isLoading && (
              <span className="rounded bg-[#E2E8F0] px-1.5 py-0.5 text-xs text-[#64748B]">
                Atendente:{" "}
                {conv?.assigned_to
                  ? (conv.assigned_to_name && String(conv.assigned_to_name).trim() !== ""
                      ? conv.assigned_to_name
                      : conv.assigned_to === currentUserId
                        ? "Você"
                        : "—")
                  : "—"}
              </span>
            )}
            {!isLoading && (
              (() => {
                const rawStatus = conv?.status ?? "open";
                const isAssigned = !!conv?.assigned_to;
                let statusKey =
                  rawStatus === "closed"
                    ? "closed"
                    : isAssigned
                      ? "in_progress"
                      : rawStatus === "in_queue"
                        ? "in_queue"
                        : "open";
                const label =
                  statusKey === "closed"
                    ? "Encerrado"
                    : statusKey === "in_progress"
                      ? "Em atendimento"
                      : statusKey === "in_queue"
                        ? "Fila"
                        : "Novo";
                const colorClass =
                  statusKey === "closed"
                    ? "bg-[#64748B]/15 text-[#64748B]"
                    : statusKey === "in_progress"
                      ? "bg-[#8B5CF6]/15 text-[#7C3AED]"
                      : "bg-[#22C55E]/15 text-[#16A34A]";
                return (
                  <span className={`rounded px-1.5 py-0.5 text-xs font-medium ${colorClass}`}>
                    {label}
                  </span>
                );
              })()
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
                {(() => {
                  const base = Array.isArray(conv?.messages) ? conv.messages : [];
                  const deduped = base.filter((m, i, arr) => {
                    const id = (m as Message).id;
                    const first = arr.findIndex((x) => (x as Message).id === id);
                    return first === i;
                  });
                  const toAdd = optimisticMessages.filter((opt) => {
                    const hasMatch = deduped.some(
                      (m) =>
                        (m as Message).direction === "out" &&
                        (m as Message).content === opt.content &&
                        !String((m as Message).id).startsWith("temp-") &&
                        Math.abs(new Date((m as Message).sent_at).getTime() - new Date(opt.sent_at).getTime()) < 20000
                    );
                    return !hasMatch;
                  });
                  const merged = [...deduped, ...toAdd].sort(
                    (a, b) => new Date((a as Message).sent_at).getTime() - new Date((b as Message).sent_at).getTime()
                  );
                  return merged.map((m) => (
                    <div
                      key={(m as Message).id}
                      className={`flex ${(m as Message).direction === "out" ? "justify-end" : "justify-start"}`}
                    >
                      <MessageBubble
                        m={m as Message}
                        name={name}
                        conversationId={resolved?.id}
                        apiHeaders={apiHeaders}
                        onReaction={handleReaction}
                        onDeleteMessage={handleDeleteMessage}
                      />
                    </div>
                  ));
                })()}
                <div ref={messagesEndRef} data-messages-end />
              </>
            )}
          </div>
        </div>

        <div className="shrink-0 border-t border-[#E2E8F0] p-0 bg-white">
          {error && <p className="mb-2 text-sm text-[#EF4444] px-4 pt-2">{error}</p>}
          {recording ? (
            <RecordingInProgressBar
              seconds={recordingSeconds}
              onStop={stopRecording}
            />
          ) : recordedAudioBlob ? (
            <RecordingPreviewBar
              src={recordedAudioPreviewUrl}
              isLoading={!!recordedAudioBlob && !recordedAudioPreviewUrl}
              sending={sending}
              onSend={sendRecordedAudio}
              onDiscard={discardRecordedAudio}
            />
          ) : (
          <>
<div className={`flex flex-col bg-white overflow-hidden ${!canSendMessages ? "opacity-60 pointer-events-none" : ""}`}>
  <div className="flex items-center border-b border-[#E2E8F0] bg-[#F8FAFC]">
    <button
      type="button"
      onClick={() => setInputTab('write')}
      className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 flex items-center gap-2 ${inputTab === 'write' ? 'border-clicvend-orange text-clicvend-orange bg-white' : 'border-transparent text-[#64748B] hover:text-[#1E293B] hover:bg-gray-50'}`}
    >
      <MessageSquare className="h-4 w-4" />
      Responder
    </button>
    <button
      type="button"
      onClick={() => setInputTab('quick')}
      className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 flex items-center gap-2 ${inputTab === 'quick' ? 'border-clicvend-orange text-clicvend-orange bg-white' : 'border-transparent text-[#64748B] hover:text-[#1E293B] hover:bg-gray-50'}`}
    >
      <Zap className="h-4 w-4" />
      Respostas Rápidas
    </button>
    <button
      type="button"
      onClick={() => setInputTab('note')}
      className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 flex items-center gap-2 ${inputTab === 'note' ? 'border-purple-500 text-purple-600 bg-purple-50' : 'border-transparent text-[#64748B] hover:text-[#1E293B] hover:bg-gray-50'}`}
    >
      <FileText className="h-4 w-4" />
      Comentário Interno
    </button>
  </div>

  <div className="p-0 relative bg-white">
    {inputTab === 'write' || inputTab === 'note' ? (
      <>
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
        <input
            type="file"
            ref={videoInputRef}
            accept="video/*"
            className="hidden"
            onChange={(e) => onFileChoose("video", e)}
        />

        {quickSearch !== null && filteredQuickReplies.length > 0 && (
            <div className="absolute bottom-full left-0 mb-2 w-full rounded-xl bg-white border border-[#E2E8F0] shadow-xl overflow-hidden max-h-[300px] overflow-y-auto z-50">
                {filteredQuickReplies.map((qr: any, i: number) => (
                <button
                    key={qr.id}
                    type="button"
                    onClick={() => selectQuickReply(qr)}
                    className={`w-full text-left px-4 py-2 text-sm hover:bg-[#F8FAFC] flex items-center justify-between gap-2 border-b border-[#F1F5F9] last:border-0 ${i === quickIndex ? "bg-[#F1F5F9]" : ""}`}
                >
                    <span className="font-medium text-[#1E293B] shrink-0">/{qr.shortCut}</span>
                    <span className="truncate text-[#64748B] flex-1 min-w-0 text-xs">{qr.text}</span>
                </button>
                ))}
            </div>
        )}

        <textarea
          value={sendValue}
          onChange={(e) => {
              const v = e.target.value;
              setSendValue(v);
              const lastLine = v.split('\n').pop() || '';
              if (lastLine.trim().startsWith("/")) {
                  setQuickSearch(lastLine.trim().slice(1));
                  setQuickIndex(0);
              } else {
                  setQuickSearch(null);
              }
          }}
          onKeyDown={(e) => {
              if (quickSearch !== null && filteredQuickReplies.length > 0) {
                  if (e.key === "ArrowUp") {
                      e.preventDefault();
                      setQuickIndex((i) => Math.max(0, i - 1));
                      return;
                  } else if (e.key === "ArrowDown") {
                      e.preventDefault();
                      setQuickIndex((i) => Math.min(filteredQuickReplies.length - 1, i + 1));
                      return;
                  } else if (e.key === "Enter" || e.key === "Tab") {
                      e.preventDefault();
                      selectQuickReply(filteredQuickReplies[quickIndex]);
                      return;
                  } else if (e.key === "Escape") {
                      e.preventDefault();
                      setQuickSearch(null);
                      return;
                  }
              }

              if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  if (sendValue.trim() && !sending && !isLoading) handleSend(e);
              }
          }}
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
          placeholder={inputTab === 'note' ? "Escreva um comentário interno (não será enviado ao cliente)..." : "Digite sua mensagem…"}
          className={`w-full resize-none border-0 p-4 text-sm text-[#1E293B] placeholder-[#94A3B8] focus:ring-0 min-h-[56px] focus:outline-none ${inputTab === 'note' ? 'bg-purple-50' : 'bg-[#F0FDF4]'}`}
          disabled={sending || isLoading}
        />
        
        <div className={`flex items-center justify-between px-3 py-2 border-t border-[#E2E8F0] bg-[#F8FAFC]`}>
            <div className="flex items-center gap-2">
                 <div className="flex shrink-0 items-center gap-0.5 border border-[#E2E8F0] rounded-lg overflow-hidden bg-white">
                    <button
                        type="button"
                        onClick={() => setAttachOpen(!attachOpen)}
                        className="p-2 text-[#64748B] hover:bg-[#E2E8F0] transition-colors"
                        title="Anexar arquivo"
                        disabled={inputTab === 'note'}
                    >
                        <Paperclip className="h-5 w-5" />
                    </button>
                     {attachOpen && (
                        <div className="flex items-center border-l border-[#E2E8F0] flex-wrap">
                            <button type="button" onClick={() => { fileInputRef.current?.click(); setAttachOpen(false); }} className="px-3 py-1.5 text-xs text-[#64748B] hover:bg-[#F8FAFC] font-medium">Imagem</button>
                            <button type="button" onClick={() => { videoInputRef.current?.click(); setAttachOpen(false); }} className="px-3 py-1.5 text-xs text-[#64748B] hover:bg-[#F8FAFC] font-medium">Vídeo</button>
                            <button type="button" onClick={() => { startRecordingVideo(); }} className="px-3 py-1.5 text-xs text-[#64748B] hover:bg-[#F8FAFC] flex items-center gap-1 font-medium">
                                <Video className="h-3.5 w-3.5" /> Gravar vídeo
                            </button>
                            <button type="button" onClick={() => { audioInputRef.current?.click(); setAttachOpen(false); }} className="px-3 py-1.5 text-xs text-[#64748B] hover:bg-[#F8FAFC] font-medium">Áudio</button>
                            <button type="button" onClick={() => { docInputRef.current?.click(); setAttachOpen(false); }} className="px-3 py-1.5 text-xs text-[#64748B] hover:bg-[#F8FAFC] font-medium">Documento</button>
                        </div>
                    )}
                 </div>

                 <div className="relative">
                    <button
                        ref={inputEmojiButtonRef}
                        type="button"
                        onClick={() => setInputEmojiPickerOpen((v) => !v)}
                        className="p-2 text-[#64748B] hover:bg-[#E2E8F0] rounded-lg transition-colors"
                        title="Inserir emoji"
                    >
                        <Smile className="h-5 w-5" />
                    </button>
                    {inputEmojiPickerOpen && (
                        <div
                            ref={inputEmojiPickerRef}
                            className="absolute bottom-full left-0 mb-2 z-50 rounded-xl bg-white border border-[#E2E8F0] shadow-xl overflow-hidden w-[320px]"
                        >
                             <div className="max-h-[320px] overflow-auto">
                                <EmojiReactionPicker
                                    onSelect={(emoji) => {
                                        setSendValue((prev) => prev + emoji);
                                    }}
                                    onClose={() => setInputEmojiPickerOpen(false)}
                                />
                             </div>
                        </div>
                    )}
                 </div>

                 {!recording && (
                     <button
                        type="button"
                        onClick={startRecording}
                        className="p-2 text-[#64748B] hover:bg-[#E2E8F0] rounded-lg transition-colors"
                        title="Gravar áudio"
                     >
                         <Mic className="h-5 w-5" />
                     </button>
                 )}

                 <div className="h-5 w-px bg-[#E2E8F0] mx-1" />

                 <button
                    type="button"
                    onClick={handleAICorrection}
                    disabled={correctingText || !sendValue.trim()}
                    className="p-2 text-[#64748B] hover:text-clicvend-orange hover:bg-[#E2E8F0] rounded-lg transition-colors group disabled:opacity-50"
                    title="Corrigir com IA"
                 >
                     {correctingText ? <Loader2 className="h-5 w-5 animate-spin" /> : <Sparkles className="h-5 w-5" />}
                 </button>
            </div>

            <div className="flex items-center gap-2">
                 <button
            type="button"
            onClick={(e) => { if (sendValue.trim() && !sending && !isLoading) handleSend(e); }}
            disabled={!sendValue.trim() || sending || isLoading}
            className={`flex h-10 w-10 items-center justify-center rounded-full text-white transition-all shadow-sm disabled:cursor-not-allowed ${
              inputTab === 'note' 
                ? 'bg-purple-600 hover:bg-purple-700 disabled:bg-purple-300' 
                : 'bg-clicvend-orange hover:bg-clicvend-orange-dark disabled:bg-[#94A3B8]'
            }`}
            title={inputTab === 'note' ? "Salvar comentário" : "Enviar"}
          >
            {sending ? <Loader2 className="h-5 w-5 animate-spin" /> : <Send className="h-5 w-5 ml-0.5" />}
          </button>
            </div>
        </div>
      </>
    ) : (
       <div className="flex flex-col h-[300px]">
          <div className="flex-1 overflow-y-auto">
             {tabQuickReplies.length > 0 ? (
                 <table className="w-full text-sm text-left">
                     <thead className="text-xs text-[#64748B] uppercase bg-[#F8FAFC] sticky top-0 z-10">
                         <tr>
                             <th className="px-4 py-2 font-medium w-1/4">Atalho</th>
                             <th className="px-4 py-2 font-medium">Mensagem</th>
                             <th className="px-4 py-2 font-medium w-[140px]">Criado em</th>
                             <th className="px-4 py-2 font-medium w-[140px]">Atualizado em</th>
                             <th className="px-4 py-2 font-medium w-10"></th>
                         </tr>
                     </thead>
                     <tbody className="divide-y divide-[#F1F5F9]">
                         {tabQuickReplies.map((qr: any) => (
                             <tr 
                                 key={qr.id} 
                                 className="hover:bg-[#F1F5F9] cursor-pointer group transition-colors"
                                 onClick={() => {
                                     selectQuickReply(qr);
                                     setInputTab('write');
                                 }}
                             >
                                 <td className="px-4 py-2 font-medium text-[#1E293B]">
                                     <div className="flex items-center gap-2">
                                         <span>/{qr.shortCut}</span>
                                         <button
                                             type="button"
                                             onClick={(e) => {
                                                 e.stopPropagation();
                                                 navigator.clipboard.writeText(`/${qr.shortCut}`);
                                             }}
                                             className="text-[#94A3B8] hover:text-[#1E293B] opacity-0 group-hover:opacity-100 transition-opacity"
                                             title="Copiar atalho"
                                         >
                                             <Copy className="h-3.5 w-3.5" />
                                         </button>
                                     </div>
                                 </td>
                                 <td className="px-4 py-2 text-[#64748B]">
                                     <div className="relative group/tooltip">
                                         <span className="line-clamp-1 max-w-[300px]">{qr.text}</span>
                                         <div className="absolute left-0 bottom-full mb-2 hidden w-[300px] rounded-lg bg-[#1E293B] p-2 text-xs text-white shadow-lg group-hover/tooltip:block z-50 whitespace-pre-wrap">
                                             {qr.text}
                                             <div className="absolute -bottom-1 left-4 h-2 w-2 rotate-45 bg-[#1E293B]"></div>
                                         </div>
                                     </div>
                                 </td>
                                 <td className="px-4 py-2 text-xs text-[#64748B]">
                                     {qr.createdAt ? new Date(qr.createdAt).toLocaleDateString("pt-BR") : "—"}
                                 </td>
                                 <td className="px-4 py-2 text-xs text-[#64748B]">
                                     {qr.updatedAt ? new Date(qr.updatedAt).toLocaleDateString("pt-BR") : "—"}
                                 </td>
                                 <td className="px-4 py-2 text-right">
                                     <button type="button" className="text-clicvend-orange opacity-0 group-hover:opacity-100 transition-opacity" title="Usar resposta">
                                         <Check className="h-4 w-4" />
                                     </button>
                                 </td>
                             </tr>
                         ))}
                     </tbody>
                 </table>
             ) : (
                 <div className="flex flex-col items-center justify-center h-full text-[#94A3B8] text-sm gap-2">
                     <p>Nenhuma resposta encontrada.</p>
                 </div>
             )}
          </div>
       </div>
     )}
  </div>
</div>
          </>
          )}
        </div>
      </div>

      {/* Gravação de vídeo pela câmera: SideOver largo — Parar → depois Enviar ou Descartar */}
      <SideOver
        open={!!(recordingVideo || recordedVideoBlob)}
        onClose={() => {
          if (recordedVideoBlob) discardRecordedVideo();
          else if (recordingVideo) {
            discardVideoOnStopRef.current = true;
            stopRecordingVideo();
          }
        }}
        title={recordedVideoBlob ? "Revisar vídeo" : "Gravar vídeo"}
        width={640}
      >
        <div className="flex flex-col gap-4">
          <div className="rounded-xl overflow-hidden bg-[#0F172A] w-full aspect-video min-h-[280px] shadow-inner">
            {recordedVideoBlob ? (
              <video
                src={recordedVideoPreviewUrl ?? ""}
                controls
                playsInline
                className="w-full h-full min-h-[280px] object-contain"
              />
            ) : (
              <video
                ref={videoPreviewRef}
                autoPlay
                muted
                playsInline
                className="w-full h-full min-h-[280px] object-cover"
              />
            )}
          </div>
          <div className="flex flex-col gap-2">
            {recordedVideoBlob ? (
              <>
                {error && (
                  <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
                    {error}
                  </div>
                )}
                <p className="text-sm text-gray-600">
                  Revise o vídeo e clique em Enviar ou Descartar.
                </p>
                <div className="flex items-center gap-3 flex-wrap">
                  <button
                    type="button"
                    onClick={sendRecordedVideo}
                    disabled={sending}
                    className="inline-flex items-center gap-2 rounded-xl bg-clicvend-orange px-5 py-3 text-base font-semibold text-white hover:bg-clicvend-orange-dark disabled:opacity-50 shadow-md hover:shadow-lg transition-all"
                  >
                    {sending ? <Loader2 className="h-5 w-5 animate-spin" /> : <Send className="h-5 w-5" />}
                    Enviar vídeo
                  </button>
                  <button
                    type="button"
                    onClick={discardRecordedVideo}
                    className="inline-flex items-center gap-2 rounded-xl border-2 border-gray-300 px-5 py-3 text-base font-medium text-gray-700 hover:bg-gray-100"
                  >
                    Descartar
                  </button>
                </div>
              </>
            ) : (
              <>
                <p className="text-sm text-gray-600">
                  Grave seu vídeo e clique em Parar para revisar.
                </p>
                <button
                  type="button"
                  onClick={stopRecordingVideo}
                  className="inline-flex items-center justify-center gap-2 rounded-xl bg-red-500 px-5 py-3 text-base font-semibold text-white hover:bg-red-600 shadow-md"
                >
                  <Square className="h-5 w-5" /> Parar gravação
                </button>
              </>
            )}
          </div>
        </div>
      </SideOver>

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

                {tabulationLoading ? (
                  <div className="flex items-center gap-2 py-2 text-sm text-[#64748B]">
                    <Loader2 className="h-4 w-4 animate-spin text-clicvend-orange" />
                    Carregando tags e formulários…
                  </div>
                ) : (
                  <>
                    <div className="space-y-2 border-b border-[#E2E8F0] pb-4">
                      <h3 className="text-xs font-semibold uppercase tracking-wider text-[#64748B] flex items-center gap-1.5">
                        <Tag className="h-3.5 w-3.5" />
                        Tags do contato
                      </h3>
                      {contactTags.length === 0 && contactTagIds.length === 0 ? (
                        <p className="text-sm text-[#94A3B8]">Nenhuma tag de contato. Edite em Contatos.</p>
                      ) : (
                        <div className="flex flex-wrap gap-1.5">
                          {contactTags.filter((t) => contactTagIds.includes(t.id)).map((t) => (
                            <span
                              key={t.id}
                              className="inline-flex items-center rounded-full border border-transparent px-2.5 py-0.5 text-xs font-medium text-white"
                              style={{ backgroundColor: t.color_hex || "#94A3B8" }}
                            >
                              {t.name}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>

                    <div className="space-y-2 border-b border-[#E2E8F0] pb-4">
                      <h3 className="text-xs font-semibold uppercase tracking-wider text-[#64748B] flex items-center gap-1.5">
                        <Tag className="h-3.5 w-3.5" />
                        Tags do atendimento
                      </h3>
                      {convTags.length === 0 ? (
                        <p className="text-sm text-[#94A3B8]">Nenhuma tag da fila disponível.</p>
                      ) : (
                        <>
                          <div className="flex flex-wrap gap-1.5">
                            {convTags.map((t) => {
                              const on = convTagIdsDraft.includes(t.id);
                              return (
                                <button
                                  key={t.id}
                                  type="button"
                                  onClick={() => {
                                    setConvTagIdsDraft((prev) =>
                                      on ? prev.filter((id) => id !== t.id) : [...prev, t.id]
                                    );
                                  }}
                                  className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors ${
                                    on ? "border-transparent text-white" : "border-[#E2E8F0] bg-white text-[#64748B] hover:bg-[#F8FAFC]"
                                  }`}
                                  style={on && t.color_hex ? { backgroundColor: t.color_hex } : undefined}
                                >
                                  {t.name}
                                </button>
                              );
                            })}
                          </div>
                          <button
                            type="button"
                            disabled={savingConvTags}
                            onClick={async () => {
                              if (!resolved?.id || !apiHeaders) return;
                              setSavingConvTags(true);
                              try {
                                const res = await fetch(`/api/conversations/${resolved.id}/tags`, {
                                  method: "POST",
                                  credentials: "include",
                                  headers: { "Content-Type": "application/json", ...apiHeaders },
                                  body: JSON.stringify({ tag_ids: convTagIdsDraft }),
                                });
                                if (res.ok) setConvTagIds(convTagIdsDraft);
                              } finally {
                                setSavingConvTags(false);
                              }
                            }}
                            className="mt-2 inline-flex items-center gap-1.5 rounded-lg bg-clicvend-orange px-3 py-1.5 text-xs font-medium text-white hover:bg-clicvend-orange-dark disabled:opacity-60"
                          >
                            {savingConvTags ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
                            Salvar tags
                          </button>
                        </>
                      )}
                    </div>

                    <div className="space-y-2 border-b border-[#E2E8F0] pb-4">
                      <h3 className="text-xs font-semibold uppercase tracking-wider text-[#64748B] flex items-center gap-1.5">
                        <FileText className="h-3.5 w-3.5" />
                        Formulários de tabulação
                      </h3>
                      {tabulationForms.length === 0 ? (
                        <p className="text-sm text-[#94A3B8]">Nenhum formulário vinculado à fila.</p>
                      ) : (
                        <ul className="space-y-2">
                          {tabulationForms.map((form) => {
                            const answered = tabulationAnswers[form.id];
                            const isOpen = formAnswerOpen === form.id;
                            return (
                              <li key={form.id} className="rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] p-2">
                                <div className="flex items-center justify-between gap-2">
                                  <span className="text-sm font-medium text-[#1E293B]">{form.name}</span>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setFormAnswerOpen(isOpen ? null : form.id);
                                      if (!isOpen && answered) setFormAnswerDraft(answered.answers as Record<string, unknown>);
                                      else if (!isOpen) setFormAnswerDraft({});
                                    }}
                                    className="text-xs font-medium text-clicvend-orange hover:underline"
                                  >
                                    {answered ? "Ver / Editar" : "Preencher"}
                                  </button>
                                </div>
                                {answered && !isOpen && (
                                  <p className="mt-1 text-[11px] text-[#64748B]">
                                    Preenchido em {new Date(answered.created_at).toLocaleString("pt-BR")}
                                  </p>
                                )}
                                {isOpen && (
                                  <div className="mt-3 space-y-2 border-t border-[#E2E8F0] pt-2">
                                    {form.fields.map((field) => (
                                      <div key={field.id}>
                                        <label className="block text-xs font-medium text-[#64748B]">{field.label}{field.required ? " *" : ""}</label>
                                        {field.type === "text" || field.type === "number" ? (
                                          <input
                                            type={field.type}
                                            value={String(formAnswerDraft[field.id] ?? "")}
                                            onChange={(e) => setFormAnswerDraft((d) => ({ ...d, [field.id]: e.target.value }))}
                                            className="mt-0.5 w-full rounded border border-[#E2E8F0] px-2 py-1.5 text-sm"
                                          />
                                        ) : (
                                          <select
                                            value={String(formAnswerDraft[field.id] ?? "")}
                                            onChange={(e) => setFormAnswerDraft((d) => ({ ...d, [field.id]: e.target.value }))}
                                            className="mt-0.5 w-full rounded border border-[#E2E8F0] px-2 py-1.5 text-sm"
                                          >
                                            <option value="">Selecione</option>
                                            {(field.options ?? []).map((opt) => (
                                              <option key={opt} value={opt}>{opt}</option>
                                            ))}
                                          </select>
                                        )}
                                      </div>
                                    ))}
                                    <div className="flex gap-2 pt-1">
                                      <button
                                        type="button"
                                        onClick={() => { setFormAnswerOpen(null); setFormAnswerDraft({}); }}
                                        className="rounded border border-[#E2E8F0] px-2 py-1 text-xs font-medium text-[#64748B] hover:bg-[#F1F5F9]"
                                      >
                                        Cancelar
                                      </button>
                                      <button
                                        type="button"
                                        disabled={savingFormAnswer}
                                        onClick={async () => {
                                          if (!resolved?.id || !apiHeaders) return;
                                          setSavingFormAnswer(true);
                                          try {
                                            const res = await fetch(`/api/conversations/${resolved.id}/form-answers`, {
                                              method: "POST",
                                              credentials: "include",
                                              headers: { "Content-Type": "application/json", ...apiHeaders },
                                              body: JSON.stringify({ tag_form_id: form.id, answers: formAnswerDraft }),
                                            });
                                            if (res.ok) {
                                              setTabulationAnswers((a) => ({ ...a, [form.id]: { answers: formAnswerDraft, created_at: new Date().toISOString() } }));
                                              setFormAnswerOpen(null);
                                              setFormAnswerDraft({});
                                            }
                                          } finally {
                                            setSavingFormAnswer(false);
                                          }
                                        }}
                                        className="inline-flex items-center gap-1 rounded bg-clicvend-orange px-2 py-1 text-xs font-medium text-white hover:bg-clicvend-orange-dark disabled:opacity-60"
                                      >
                                        {savingFormAnswer ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
                                        Salvar
                                      </button>
                                    </div>
                                  </div>
                                )}
                              </li>
                            );
                          })}
                        </ul>
                      )}
                    </div>
                  </>
                )}

                <div className="space-y-3">
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-[#64748B]">Mídias e documentos</h3>
                  {(() => {
                    const mediaList = getMediaMessages(conv?.messages);
                    if (mediaList.length === 0) {
                      return <p className="text-sm text-[#94A3B8]">Nenhuma mídia ou documento nesta conversa.</p>;
                    }
                    return (
                      <div className="space-y-2">
                        <p className="text-sm text-[#64748B]">{mediaList.length} {mediaList.length === 1 ? "arquivo" : "arquivos"}</p>
                        <ul className="space-y-1.5 max-h-48 overflow-y-auto">
                          {mediaList.map((msg) => {
                            const type = inferDisplayType(msg.message_type, msg.content ?? "", msg);
                            const label = type === "document" ? (msg.file_name || "Documento") : mediaTypeLabel(type);
                            const Icon = type === "image" ? Image : type === "video" ? Video : type === "document" ? FileText : Music;
                            return (
                              <li key={msg.id} className="flex items-center gap-2 rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] px-2 py-1.5 text-sm">
                                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded bg-[#E2E8F0] text-[#64748B]">
                                  <Icon className="h-4 w-4" />
                                </div>
                                <span className="min-w-0 flex-1 truncate text-[#1E293B]" title={label}>{label}</span>
                                <span className="text-xs text-[#94A3B8] shrink-0">
                                  {new Date(msg.sent_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                                </span>
                                <a
                                  href="#"
                                  onClick={async (e) => {
                                    e.preventDefault();
                                    if (!resolved?.id || !apiHeaders) return;
                                    try {
                                      const res = await fetch(`/api/conversations/${resolved.id}/messages/${msg.id}/download`, { credentials: "include", headers: apiHeaders });
                                      const data = await res.json().catch(() => ({}));
                                      if (data?.fileURL) window.open(data.fileURL, "_blank", "noopener,noreferrer");
                                    } catch {
                                      // ignorar
                                    }
                                  }}
                                  className="shrink-0 rounded p-1 text-[#64748B] hover:bg-[#E2E8F0] hover:text-clicvend-orange transition-colors"
                                  title="Ver e baixar"
                                >
                                  <Download className="h-4 w-4" />
                                </a>
                              </li>
                            );
                          })}
                        </ul>
                      </div>
                    );
                  })()}
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
