
"use client";

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  Send,
  Paperclip,
  Mic,
  Smile,
  Loader2,
  Users,
  Square,
  Play,
  Pause,
  Trash2,
  MessageSquare,
  Zap,
  FileText,
  Check,
  Copy,
  Sparkles,
  ZapOff,
  GitBranch,
  PlayCircle,
  Clock,
  FolderOpen,
  Power,
  PowerOff,
  Pencil,
  XCircle,
} from "lucide-react";
import { queryKeys } from "@/lib/query-keys";
import { useBroadcastStore } from "@/stores/broadcast-store";
import { EmojiReactionPicker } from "@/components/EmojiReactionPicker";
import { ChannelIcon } from "@/components/ChannelIcon";
import { BroadcastFlowCanvas, type BroadcastFlowConfig } from "@/components/BroadcastFlowCanvas";

const BROADCAST_DELAY_MS = 35000;

const FLOW_NODES = [
  { id: "lista", label: "Lista", desc: "Contatos" },
  { id: "horario", label: "Horário", desc: "Envio" },
  { id: "delay", label: "Cadência", desc: "Delay" },
  { id: "mensagem", label: "Mensagem", desc: "Texto" },
  { id: "envio", label: "Envio", desc: "Final" },
];

type Status = "draft" | "scheduled" | "running" | "completed" | "failed";

const STAGE_INTERVAL_MS = 1800;

function PipelineFlowMini({ status, isRunning }: { status?: string; isRunning?: boolean }) {
  const s = (status ?? "draft") as Status;
  const running = isRunning ?? (s === "running");
  const effectiveStatus = running ? "running" : s;

  // Feedback em tempo real: avança etapa a cada ~2.2s enquanto está rodando
  const [animatedStage, setAnimatedStage] = useState(0);
  useEffect(() => {
    if (!running || effectiveStatus !== "running") {
      setAnimatedStage(0);
      return;
    }
    setAnimatedStage(0);
    const t = setInterval(() => {
      setAnimatedStage((prev) => (prev < 4 ? prev + 1 : prev));
    }, STAGE_INTERVAL_MS);
    return () => clearInterval(t);
  }, [running, effectiveStatus]);

  const getStageState = (index: number): "completed" | "active" | "failed" | "pending" => {
    if (effectiveStatus === "completed") return "completed";
    if (effectiveStatus === "failed") return index < 4 ? "completed" : index === 4 ? "failed" : "pending";
    if (effectiveStatus === "running") {
      if (index < animatedStage) return "completed";
      if (index === animatedStage) return "active";
      return "pending";
    }
    return "pending";
  };

  const getConnectorColor = (nextState: string) => {
    if (nextState === "completed") return "bg-emerald-400";
    if (nextState === "active") return "bg-blue-500";
    if (nextState === "failed") return "bg-red-400";
    return "bg-[#E2E8F0]";
  };

  return (
    <div className="flex w-full min-w-0 items-start" role="img" aria-label="Etapas do fluxo">
      {FLOW_NODES.map((node, i) => {
        const state = getStageState(i);
        const isLast = i === FLOW_NODES.length - 1;
        const nextState = !isLast ? getStageState(i + 1) : null;
        const badgeText =
          state === "completed"
            ? "Concluído"
            : state === "active"
              ? "Em execução"
              : state === "failed"
                ? "Falhou"
                : "Pendente";
        return (
          <div key={node.id} className="contents">
            <div className="flex flex-col items-center shrink-0">
              <div
                className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full border-2 border-white shadow-md transition-all duration-300 ${
                  state === "completed"
                    ? "bg-emerald-400"
                    : state === "active"
                      ? "bg-blue-600"
                      : state === "failed"
                        ? "bg-red-500"
                        : "bg-[#94A3B8]"
                } ${state === "active" ? "ring-2 ring-blue-300 ring-offset-2 animate-pulse" : ""}`}
              >
                {state === "completed" ? (
                  <Check className="h-5 w-5 text-white" strokeWidth={3} />
                ) : state === "active" ? (
                  <Loader2 className="h-5 w-5 text-white animate-spin" />
                ) : state === "failed" ? (
                  <XCircle className="h-5 w-5 text-white" strokeWidth={2.5} />
                ) : (
                  <span className="text-sm font-bold text-white">{i + 1}</span>
                )}
              </div>
              <p className="mt-1.5 text-[10px] font-bold uppercase tracking-wide text-[#64748B] text-center whitespace-nowrap">
                {node.label}
              </p>
              <span
                className={`mt-0.5 px-1.5 py-0.5 rounded text-[9px] font-medium ${
                  state === "completed"
                    ? "bg-emerald-100 text-emerald-700"
                    : state === "active"
                      ? "bg-blue-100 text-blue-700"
                      : state === "failed"
                        ? "bg-red-100 text-red-700"
                        : "bg-[#F1F5F9] text-[#64748B]"
                }`}
              >
                {badgeText}
              </span>
            </div>
            {!isLast && (
              <div
                className={`h-0.5 flex-1 min-w-[12px] mx-1 mt-5 shrink-0 self-start transition-colors ${getConnectorColor(
                  nextState ?? "pending"
                )}`}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

function formatPhoneBrazil(raw: string | null | undefined): string {
  let s = (raw ?? "").trim().replace(/\D/g, "");
  if (!s) return "—";
  if (s.length >= 12 && s.startsWith("55")) {
    const digits = s.slice(2);
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
  }
  return s || "—";
}

function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

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
      el.play().then(() => setPlaying(true)).catch(() => setPlaying(false));
    }
  }, [playing, src]);

  const handleSeek = (e: React.MouseEvent<HTMLDivElement>) => {
    const el = audioRef.current;
    if (!el || !duration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
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
          <span className="text-sm font-semibold text-violet-900/90">Preparando áudio…</span>
        </div>
        <button type="button" onClick={onDiscard} className="rounded-full border border-white/60 px-4 py-1.5 text-xs font-medium text-violet-900/90 hover:bg-white/10">Cancelar</button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-4 rounded-xl bg-gradient-to-r from-violet-400 via-purple-300 to-fuchsia-300 px-5 py-3 shadow-lg text-white">
      {src && <audio ref={audioRef} src={src} preload="metadata" className="hidden" />}
      <button type="button" onClick={togglePlay} className="flex h-11 w-11 items-center justify-center rounded-full bg-white text-violet-600 shadow-md hover:scale-105 transition-transform" aria-label={playing ? "Pausar" : "Reproduzir"}>
        {playing ? <Pause className="h-5 w-5" /> : <Play className="h-5 w-5 ml-0.5" />}
      </button>
      <div className="flex-1 min-w-0">
        <p className="text-xs font-semibold uppercase tracking-wide text-violet-900/80">Pré-visualização do áudio</p>
        <div className="mt-1 flex items-center justify-between text-[11px] text-violet-800/90">
          <span>{formatDuration(currentTime)}</span>
          <span>{duration ? formatDuration(duration) : "–:––"}</span>
        </div>
        <div className="mt-1.5 h-1.5 w-full rounded-full bg-white/30 overflow-hidden cursor-pointer" onClick={handleSeek}>
          <div className="h-full rounded-full bg-white shadow-[0_0_8px_rgba(255,255,255,0.8)] transition-all" style={{ width: `${progress}%` }} />
        </div>
      </div>
      <div className="flex flex-col items-center gap-2 ml-1 shrink-0">
        <button type="button" onClick={onSend} disabled={sending} className="flex h-9 w-9 items-center justify-center rounded-full bg-white text-violet-600 shadow-md hover:bg-violet-50 disabled:opacity-60" title="Enviar áudio">
          {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
        </button>
        <button type="button" onClick={onDiscard} className="flex h-9 w-9 items-center justify-center rounded-full border border-white/70 text-white/90 hover:bg-white/10" title="Descartar">
          <Trash2 className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

function RecordingInProgressBar({ seconds, onStop }: { seconds: number; onStop: () => void }) {
  const [levels, setLevels] = useState<number[]>([0.4, 0.7, 0.5, 0.8, 0.6, 0.75]);
  useEffect(() => {
    const id = setInterval(() => setLevels((prev) => prev.map(() => 0.3 + Math.random() * 0.7)), 160);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="flex items-center gap-4 rounded-xl bg-gradient-to-r from-violet-500 via-purple-400 to-fuchsia-400 px-5 py-3 shadow-lg text-white">
      <div className="flex items-center gap-3">
        <button type="button" onClick={onStop} className="flex h-11 w-11 items-center justify-center rounded-full bg-white text-violet-600 shadow-md hover:bg-violet-50" aria-label="Parar gravação">
          <Square className="h-5 w-5" />
        </button>
        <div className="flex flex-col gap-1">
          <span className="text-xs font-semibold uppercase tracking-wide text-violet-100/90">Gravando áudio…</span>
          <span className="text-sm font-medium text-white">{formatDuration(seconds)}</span>
        </div>
      </div>
      <div className="flex-1 flex items-center justify-center">
        <div className="flex items-end gap-1 h-8 w-full max-w-xs">
          {levels.map((h, idx) => (
            <div key={idx} className="flex-1 rounded-full bg-white/40 transition-all" style={{ height: `${h * 100}%` }} />
          ))}
        </div>
      </div>
    </div>
  );
}

export default function BroadcastPage() {
  const pathname = usePathname();
  const router = useRouter();
  const segments = pathname?.split("/").filter(Boolean) ?? [];
  const slug = segments[0];
  const base = slug ? `/${slug}` : "";
  const apiHeaders = slug ? { "X-Company-Slug": slug } : undefined;
  const queryClient = useQueryClient();
  const searchParams = useSearchParams();

  const selectedIds = useBroadcastStore((s) => s.selectedQueueItemIds);

  const { data: permissionsData } = useQuery({
    queryKey: queryKeys.permissions(slug ?? ""),
    queryFn: () =>
      fetch("/api/auth/permissions", { credentials: "include", headers: apiHeaders }).then((r) => r.json()),
    enabled: !!slug,
    staleTime: 5 * 60 * 1000,
  });
  const permissions = Array.isArray(permissionsData?.permissions) ? permissionsData.permissions : [];
  const canAccessBroadcast = permissions.includes("broadcast.view") || permissions.includes("broadcast.manage");
  const canManageBroadcast = permissions.includes("broadcast.manage");

  useEffect(() => {
    if (slug && permissionsData !== undefined && !canAccessBroadcast) {
      router.replace(`${base}/conversas`);
    }
  }, [slug, base, permissionsData, canAccessBroadcast, router]);

  const selectAllQueueItems = useBroadcastStore((s) => s.selectAllQueueItems);

  const { data: queueData } = useQuery({
    queryKey: queryKeys.broadcastQueue(slug ?? ""),
    queryFn: () =>
      fetch("/api/broadcast-queue?status=pending", { credentials: "include", headers: apiHeaders }).then((r) => r.json()),
    enabled: !!slug,
    staleTime: 10 * 1000,
  });

  const [runningPipelineId, setRunningPipelineId] = useState<string | null>(null);

  const { data: pipelinesData, error: pipelinesErrDetail } = useQuery({
    queryKey: queryKeys.broadcastPipelines(slug ?? ""),
    queryFn: async () => {
      const r = await fetch("/api/broadcast-pipelines", { credentials: "include", headers: apiHeaders });
      const json = await r.json();
      if (!r.ok) throw new Error(json?.error ?? "Erro ao carregar fluxos");
      return json;
    },
    enabled: !!slug,
    staleTime: 15 * 1000,
    refetchInterval: (query) => {
      if (runningPipelineId) return 2000;
      const pipelines = query.state.data?.pipelines ?? [];
      const hasRunning = pipelines.some((p: { status?: string }) => p.status === "running");
      const hasScheduled = pipelines.some((p: { status?: string }) => p.status === "scheduled");
      return hasRunning || hasScheduled ? 2000 : false;
    },
  });

  const pipelines = Array.isArray(pipelinesData?.pipelines) ? pipelinesData.pipelines : [];
  const pipelinesLoadError = pipelinesErrDetail?.message;

  const { data: quickReplies } = useQuery({
    queryKey: ["quick-replies", slug],
    queryFn: () =>
      fetch("/api/quick-replies", { headers: apiHeaders })
        .then((r) => r.json())
        .then((json) => (Array.isArray(json?.data) ? json.data : [])),
    enabled: !!slug,
    staleTime: 5 * 60 * 1000,
  });

  const allItems = Array.isArray(queueData?.items) ? queueData.items : [];
  const selectedItems = allItems.filter((i: { id: string }) => selectedIds.has(i.id));

  const urlParamsReplaced = useRef(false);
  useEffect(() => {
    if (!searchParams) return;
    const openFlow = searchParams.get("openFlow") === "1";
    const autoSelect = searchParams.get("autoSelect") === "1";
    if (openFlow) setViewTab("fluxo");
    if (autoSelect && allItems.length > 0 && selectedIds.size === 0) {
      selectAllQueueItems(allItems.map((i: { id: string }) => i.id));
    }
    if ((openFlow || autoSelect) && !urlParamsReplaced.current) {
      urlParamsReplaced.current = true;
      router.replace(`${base}/conversas/broadcast`, { scroll: false });
    }
  }, [searchParams, allItems, selectedIds.size, selectAllQueueItems, base, router]);

  // Input state — idêntico ao chat normal
  const [sendValue, setSendValue] = useState("");
  const [sending, setSending] = useState(false);
  const [sendProgress, setSendProgress] = useState({ current: 0, total: 0, error: "" });
  const [attachOpen, setAttachOpen] = useState(false);
  const [inputEmojiPickerOpen, setInputEmojiPickerOpen] = useState(false);
  const [inputTab, setInputTab] = useState<"write" | "quick" | "note">("write");
  const [quickSearch, setQuickSearch] = useState<string | null>(null);
  const [quickIndex, setQuickIndex] = useState(0);
  const [quickReplySearch, setQuickReplySearch] = useState("");
  const [correctingText, setCorrectingText] = useState(false);
  const [useUazapiQueue, setUseUazapiQueue] = useState(true);
  const [viewTab, setViewTab] = useState<"fluxo" | "envio" | "fluxos">("fluxo");
  const [pipelineName, setPipelineName] = useState("");
  const [editingPipelineId, setEditingPipelineId] = useState<string | null>(null);
  const [editingPipelineConfig, setEditingPipelineConfig] = useState<Record<string, unknown> | null>(null);
  const [flowSaveStatus, setFlowSaveStatus] = useState<"idle" | "saving" | "success" | "error">("idle");
  const [flowSaveError, setFlowSaveError] = useState<string | null>(null);
  const [pendingMedia, setPendingMedia] = useState<{
    type: string;
    file: string;
    caption?: string;
    docName?: string;
  } | null>(null);

  // Audio recording
  const [recording, setRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [recordedAudioBlob, setRecordedAudioBlob] = useState<Blob | null>(null);
  const [recordedAudioPreviewUrl, setRecordedAudioPreviewUrl] = useState<string | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Refs
  const fileInputRef = useRef<HTMLInputElement>(null);
  const audioInputRef = useRef<HTMLInputElement>(null);
  const docInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);
  const inputEmojiButtonRef = useRef<HTMLButtonElement>(null);
  const inputEmojiPickerRef = useRef<HTMLDivElement>(null);

  // Quick replies filtered
  const filteredQuickReplies = useMemo(() => {
    if (quickSearch === null || !Array.isArray(quickReplies)) return [];
    const term = quickSearch.toLowerCase();
    return (quickReplies as Array<{ id: string; shortCut: string; text: string; queueIds?: string[] }>)
      .filter((qr) => term === "" || qr.shortCut?.toLowerCase().includes(term) || qr.text?.toLowerCase().includes(term))
      .slice(0, 50);
  }, [quickReplies, quickSearch]);

  const tabQuickReplies = useMemo(() => {
    if (!Array.isArray(quickReplies)) return [];
    const term = quickReplySearch.toLowerCase();
    return (quickReplies as Array<{ id: string; shortCut: string; text: string; queueIds?: string[]; createdAt?: string; updatedAt?: string }>)
      .filter((qr) => term === "" || qr.shortCut?.toLowerCase().includes(term) || qr.text?.toLowerCase().includes(term));
  }, [quickReplies, quickReplySearch]);

  function selectQuickReply(qr: { text?: string }) {
    if (qr.text) setSendValue(qr.text);
    setQuickSearch(null);
    setQuickIndex(0);
  }

  // Recording timer
  useEffect(() => {
    if (recording) {
      setRecordingSeconds(0);
      recordingTimerRef.current = setInterval(() => setRecordingSeconds((s) => s + 1), 1000);
    } else {
      if (recordingTimerRef.current) clearInterval(recordingTimerRef.current);
    }
    return () => { if (recordingTimerRef.current) clearInterval(recordingTimerRef.current); };
  }, [recording]);

  useEffect(() => {
    if (!recordedAudioBlob) { setRecordedAudioPreviewUrl(null); return; }
    const url = URL.createObjectURL(recordedAudioBlob);
    setRecordedAudioPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [recordedAudioBlob]);

  // Close emoji picker on outside click
  useEffect(() => {
    if (!inputEmojiPickerOpen) return;
    const handler = (e: MouseEvent) => {
      if (
        inputEmojiPickerRef.current && !inputEmojiPickerRef.current.contains(e.target as Node) &&
        inputEmojiButtonRef.current && !inputEmojiButtonRef.current.contains(e.target as Node)
      ) setInputEmojiPickerOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [inputEmojiPickerOpen]);

  async function startRecording() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      const chunks: BlobPart[] = [];
      recorder.ondataavailable = (ev) => ev.data.size && chunks.push(ev.data);
      recorder.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        setRecordedAudioBlob(new Blob(chunks, { type: "audio/ogg; codecs=opus" }));
        setRecording(false);
      };
      recorder.start();
      mediaRecorderRef.current = recorder;
      setRecording(true);
    } catch {
      setSendProgress((p) => ({ ...p, error: "Não foi possível acessar o microfone" }));
    }
  }

  function stopRecording() {
    if (mediaRecorderRef.current && recording) {
      mediaRecorderRef.current.stop();
      mediaRecorderRef.current = null;
    }
  }

  function discardRecordedAudio() {
    setRecordedAudioBlob(null);
  }

  function fileToBase64(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result as string;
        resolve(result.includes(",") ? result.split(",")[1]! : result);
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  async function onFileChoose(type: "image" | "document" | "audio" | "video", e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";
    try {
      const base64 = await fileToBase64(file);
      setPendingMedia({ type, file: base64, docName: type === "document" ? file.name : undefined });
      setAttachOpen(false);
    } catch {
      setSendProgress((p) => ({ ...p, error: "Falha ao ler arquivo" }));
    }
  }

  async function handleAICorrection() {
    if (!sendValue.trim() || correctingText) return;
    setCorrectingText(true);
    try {
      const res = await fetch("/api/ai/correct-text", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json", ...apiHeaders },
        body: JSON.stringify({ text: sendValue }),
      });
      if (res.ok) {
        const data = await res.json().catch(() => ({}));
        if (data?.corrected) setSendValue(data.corrected);
      }
    } catch {
      // silently ignore
    } finally {
      setCorrectingText(false);
    }
  }

  const canSend = (sendValue.trim() || pendingMedia || recordedAudioBlob) && selectedItems.length > 0 && !sending;

  function handleEditFlow(p: { id: string; name: string; config?: Record<string, unknown> }) {
    setEditingPipelineId(p.id);
    setPipelineName(p.name);
    setEditingPipelineConfig((p.config ?? {}) as Record<string, unknown>);
    setViewTab("fluxo");
  }

  function clearEditFlow() {
    setEditingPipelineId(null);
    setPipelineName("");
    setEditingPipelineConfig(null);
  }

  async function handleSaveFlow(
    payload: { name: string; config: Record<string, unknown> },
    options?: { schedule?: boolean }
  ) {
    if (!apiHeaders || !payload.name.trim()) {
      setFlowSaveStatus("error");
      setFlowSaveError("Informe o nome do pipeline");
      return;
    }
    setFlowSaveStatus("saving");
    setFlowSaveError(null);
    const body = {
      name: payload.name,
      config: payload.config,
      queue_item_ids: selectedItems.map((i: { id: string }) => i.id),
      status: options?.schedule ? "scheduled" : "draft",
    };
    const isEdit = !!editingPipelineId;
    try {
      const res = isEdit
        ? await fetch(`/api/broadcast-pipelines/${editingPipelineId}`, {
            method: "PATCH",
            credentials: "include",
            headers: { "Content-Type": "application/json", ...apiHeaders },
            body: JSON.stringify(body),
          })
        : await fetch("/api/broadcast-pipelines", {
            method: "POST",
            credentials: "include",
            headers: { "Content-Type": "application/json", ...apiHeaders },
            body: JSON.stringify(body),
          });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setFlowSaveStatus("success");
        clearEditFlow();
        setViewTab("fluxos");
        setTimeout(() => setFlowSaveStatus("idle"), 3000);
        queryClient.invalidateQueries({ queryKey: queryKeys.broadcastPipelines(slug ?? "") });
      } else {
        setFlowSaveStatus("error");
        setFlowSaveError(typeof data?.error === "string" ? data.error : "Erro ao salvar fluxo");
      }
    } catch {
      setFlowSaveStatus("error");
      setFlowSaveError("Erro de conexão ao salvar fluxo");
    }
  }

  async function handleSend() {
    if (!canSend || !apiHeaders) return;

    const content = sendValue.trim();
    const isAudio = !!recordedAudioBlob;
    const isMedia = !!pendingMedia;

    if (!isAudio && !isMedia && !content) return;

    let audioBase64: string | null = null;
    if (isAudio && recordedAudioBlob) {
      audioBase64 = await new Promise<string>((res, rej) => {
        const r = new FileReader();
        r.onload = () => res((r.result as string).split(",")[1] || "");
        r.onerror = rej;
        r.readAsDataURL(recordedAudioBlob);
      });
    }

    setSending(true);
    setSendProgress({ current: 0, total: selectedItems.length, error: "" });

    if (useUazapiQueue) {
      const body: Record<string, unknown> = {
        item_ids: selectedItems.map((i: { id: string }) => i.id),
        content,
      };
      if (isAudio && audioBase64) {
        body.type = "ptt";
        body.file = audioBase64;
      } else if (isMedia) {
        body.type = pendingMedia!.type;
        body.file = pendingMedia!.file;
        body.caption = pendingMedia!.caption || content || undefined;
        body.docName = pendingMedia!.docName;
      }

      const res = await fetch("/api/broadcast-queue/send-via-uazapi", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json", ...apiHeaders },
        body: JSON.stringify(body),
      });

      const data = await res.json().catch(() => ({}));
      setSending(false);
      setSendValue("");
      setPendingMedia(null);
      setRecordedAudioBlob(null);
      queryClient.invalidateQueries({ queryKey: queryKeys.broadcastQueue(slug ?? "") });

      if (res.ok) {
        setSendProgress({ current: 0, total: 0, error: "" });
      } else {
        setSendProgress((p) => ({ ...p, error: data?.error ?? "Falha ao enviar campanha" }));
      }
      return;
    }

    let successCount = 0;
    let failCount = 0;

    for (let i = 0; i < selectedItems.length; i++) {
      setSendProgress({ current: i + 1, total: selectedItems.length, error: "" });

      let body: Record<string, unknown>;
      if (isAudio && audioBase64) {
        body = { item_id: selectedItems[i].id, type: "ptt", file: audioBase64 };
      } else if (isMedia) {
        body = {
          item_id: selectedItems[i].id,
          type: pendingMedia!.type,
          file: pendingMedia!.file,
          caption: pendingMedia!.caption || content || undefined,
          docName: pendingMedia!.docName,
        };
      } else {
        body = { item_id: selectedItems[i].id, content };
      }

      const res = await fetch("/api/broadcast-queue/send", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json", ...apiHeaders },
        body: JSON.stringify(body),
      });

      if (res.ok) {
        successCount++;
      } else {
        const err = await res.json().catch(() => ({}));
        const msg = typeof err?.error === "string" ? err.error : `Erro ${res.status}: ${res.statusText}`;
        setSendProgress((p) => ({ ...p, error: msg }));
        failCount++;
      }

      if (i < selectedItems.length - 1) {
        await new Promise((r) => setTimeout(r, BROADCAST_DELAY_MS));
      }
    }

    setSending(false);
    setSendValue("");
    setPendingMedia(null);
    setRecordedAudioBlob(null);
    queryClient.invalidateQueries({ queryKey: queryKeys.broadcastQueue(slug ?? "") });

    if (failCount === 0) {
      setSendProgress({ current: 0, total: 0, error: "" });
    } else {
      setSendProgress((p) => ({ ...p, error: `${successCount} enviado(s), ${failCount} falha(s).` }));
    }
  }

  async function sendRecordedAudio() {
    await handleSend();
  }

  async function handleRunPipeline(pipelineId: string) {
    if (!apiHeaders) return;
    setRunningPipelineId(pipelineId);
    try {
      const res = await fetch(`/api/broadcast-pipelines/${pipelineId}/run`, {
        method: "POST",
        credentials: "include",
        headers: apiHeaders,
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        queryClient.invalidateQueries({ queryKey: queryKeys.broadcastPipelines(slug ?? "") });
        queryClient.invalidateQueries({ queryKey: queryKeys.broadcastQueue(slug ?? "") });
      } else {
        setFlowSaveError(data?.error ?? "Erro ao executar fluxo");
      }
    } catch {
      setFlowSaveError("Erro de conexão ao executar fluxo");
    } finally {
      setRunningPipelineId(null);
    }
  }

  async function handleTogglePipeline(pipelineId: string, currentStatus: string) {
    if (!apiHeaders) return;
    const newStatus = currentStatus === "scheduled" ? "draft" : "scheduled";
    try {
      const res = await fetch(`/api/broadcast-pipelines/${pipelineId}`, {
        method: "PATCH",
        credentials: "include",
        headers: { ...apiHeaders, "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });
      if (res.ok) {
        queryClient.invalidateQueries({ queryKey: queryKeys.broadcastPipelines(slug ?? "") });
      } else {
        const data = await res.json().catch(() => ({}));
        setFlowSaveError(data?.error ?? "Erro ao atualizar");
      }
    } catch {
      setFlowSaveError("Erro de conexão");
    }
  }

  async function handleDeletePipeline(pipelineId: string, name: string) {
    if (!apiHeaders || !confirm(`Excluir o fluxo "${name}"? Esta ação não pode ser desfeita.`)) return;
    try {
      const res = await fetch(`/api/broadcast-pipelines/${pipelineId}`, {
        method: "DELETE",
        credentials: "include",
        headers: apiHeaders,
      });
      if (res.ok) {
        queryClient.invalidateQueries({ queryKey: queryKeys.broadcastPipelines(slug ?? "") });
      } else {
        const data = await res.json().catch(() => ({}));
        setFlowSaveError(data?.error ?? "Erro ao excluir");
      }
    } catch {
      setFlowSaveError("Erro de conexão");
    }
  }

  if (slug && permissionsData !== undefined && !canAccessBroadcast) {
    return null;
  }

  return (
    <div className="flex h-full flex-col bg-white">
      {/* Header */}
      <header className="flex shrink-0 items-center gap-3 border-b border-[#E2E8F0] px-4 py-3">
        <button
          type="button"
          onClick={() => router.push(`${base}/conversas`)}
          className="rounded-lg p-2 text-[#64748B] hover:bg-[#F1F5F9] hover:text-[#1E293B]"
          aria-label="Voltar"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-blue-100 text-blue-600">
          <Users className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-lg font-semibold text-[#1E293B]">Fluxo de envio</h1>
          <p className="truncate text-sm text-[#64748B]">
            {selectedItems.length} contato(s) selecionado(s)
            {useUazapiQueue ? " · envio otimizado (delay 25–45s)" : " · envio manual (~35s)"}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1 rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] p-1">
          <button
            type="button"
            onClick={() => setViewTab("fluxo")}
            className={`flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors ${viewTab === "fluxo" ? "bg-white text-[#1E293B] shadow-sm" : "text-[#64748B] hover:text-[#1E293B]"}`}
          >
            <GitBranch className="h-4 w-4" />
            Fluxo
          </button>
          <button
            type="button"
            onClick={() => setViewTab("envio")}
            className={`flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors ${viewTab === "envio" ? "bg-white text-[#1E293B] shadow-sm" : "text-[#64748B] hover:text-[#1E293B]"}`}
          >
            <Send className="h-4 w-4" />
            Envio rápido
          </button>
          <button
            type="button"
            onClick={() => { setViewTab("fluxos"); setFlowSaveError(null); }}
            className={`flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors ${viewTab === "fluxos" ? "bg-white text-[#1E293B] shadow-sm" : "text-[#64748B] hover:text-[#1E293B]"}`}
          >
            <FolderOpen className="h-4 w-4" />
            Fluxos salvos
            {pipelines.length > 0 && (
              <span className="rounded-full bg-clicvend-orange/20 px-1.5 py-0.5 text-[10px] font-semibold text-clicvend-orange">
                {pipelines.length}
              </span>
            )}
          </button>
        </div>
      </header>

      {/* Body */}
      <div className="flex-1 overflow-y-auto min-h-0 flex flex-col">
        {selectedItems.length > 0 && viewTab === "fluxo" && (
          <div className="flex-1 flex flex-col p-4 min-h-0">
            {editingPipelineId && (
              <div className="mb-4 flex items-center justify-between rounded-lg bg-amber-50 px-4 py-2 text-sm text-amber-800 border border-amber-200">
                <span>Editando fluxo existente — alterações serão salvas no mesmo fluxo.</span>
                <button
                  type="button"
                  onClick={clearEditFlow}
                  className="text-amber-700 hover:text-amber-900 underline"
                >
                  Cancelar edição
                </button>
              </div>
            )}
            {flowSaveStatus === "success" && (
              <div className="mb-4 rounded-lg bg-emerald-50 px-4 py-2 text-sm text-emerald-800 border border-emerald-200">
                Fluxo salvo com sucesso.
              </div>
            )}
            {flowSaveStatus === "error" && flowSaveError && (
              <div className="mb-4 rounded-lg bg-red-50 px-4 py-2 text-sm text-red-700 border border-red-200">
                {flowSaveError}
              </div>
            )}
            <BroadcastFlowCanvas
              key={editingPipelineId ?? "new"}
              recipientCount={selectedItems.length}
              pipelineName={pipelineName}
              onPipelineNameChange={setPipelineName}
              onSave={handleSaveFlow}
              saving={flowSaveStatus === "saving"}
              apiHeaders={apiHeaders}
              className="flex-1 min-h-0"
              initialConfig={editingPipelineConfig ? (editingPipelineConfig as BroadcastFlowConfig) : undefined}
            />
          </div>
        )}

        {selectedItems.length > 0 && viewTab === "envio" && (
          <>
            <div className="border-b border-[#E2E8F0] px-4 py-3">
              <div className="mb-2 flex items-center justify-between">
                <p className="text-xs font-semibold uppercase tracking-wider text-[#64748B]">
                  Destinatários ({selectedItems.length})
                </p>
                <label className="flex cursor-pointer items-center gap-2 text-xs text-[#64748B]">
                  <input
                    type="checkbox"
                    checked={useUazapiQueue}
                    onChange={(e) => setUseUazapiQueue(e.target.checked)}
                    className="h-4 w-4 rounded border-[#E2E8F0] text-clicvend-orange focus:ring-clicvend-orange"
                  />
                  <span className="flex items-center gap-1">
                    {useUazapiQueue ? <Zap className="h-4 w-4 text-amber-500" /> : <ZapOff className="h-4 w-4" />}
                    Envio otimizado (recomendado)
                  </span>
                </label>
              </div>
              <div className="flex flex-wrap gap-2">
                {selectedItems.map((item: { id: string; channel_name?: string | null; contact?: { contact_name?: string | null; first_name?: string | null; phone?: string | null; jid?: string | null } | null }) => (
                  <span
                    key={item.id}
                    className="inline-flex items-center gap-1.5 rounded-full bg-white border border-[#E2E8F0] px-3 py-1.5 text-sm text-[#334155] shadow-sm"
                  >
                    <ChannelIcon variant="outline" provider="generic" channelName={item.channel_name} size={16} />
                    {item.contact?.contact_name || item.contact?.first_name || formatPhoneBrazil(item.contact?.phone ?? item.contact?.jid)}
                  </span>
                ))}
              </div>
            </div>

            {sendProgress.error && (
              <div className="mx-4 mt-2 rounded-lg bg-red-50 px-4 py-2 text-sm text-red-700">
                {sendProgress.error}
              </div>
            )}

            {sending && (
              <div className="mx-4 mt-2 flex items-center gap-2 rounded-lg bg-blue-50 px-4 py-2 text-sm text-blue-800">
                <Loader2 className="h-4 w-4 animate-spin" />
                Enviando {sendProgress.current} de {sendProgress.total}…
              </div>
            )}
          </>
        )}

        {viewTab === "fluxos" && (
          <div className="flex-1 p-4">
            {(flowSaveError || pipelinesLoadError) && (
              <div className="mb-4 rounded-lg bg-red-50 px-4 py-2 text-sm text-red-700 border border-red-200">
                <p>{flowSaveError ?? pipelinesLoadError}</p>
                {(pipelinesLoadError?.includes("status") ?? flowSaveError?.includes("status")) && (
                  <p className="mt-2 text-xs">
                    Execute a migration no Supabase: <code className="rounded bg-red-100 px-1">npx supabase db push</code> ou rode o SQL da migration 20260319000001 no SQL Editor.
                  </p>
                )}
              </div>
            )}
            <h2 className="text-sm font-semibold text-[#334155] mb-3">Fluxos salvos</h2>
            <p className="text-sm text-[#64748B] mb-4">
              Clique em &quot;Executar&quot; para enviar agora. Para envio automático no horário configurado, marque &quot;Agendar execução no horário configurado&quot; ao salvar. O horário é em Brasília.
            </p>
            <p className="text-xs text-[#94A3B8] mb-4">
              O status &quot;Enviado para fila&quot; significa que as mensagens foram aceitas pelo WhatsApp. A entrega pode levar alguns minutos e pode falhar em alguns casos (número não cadastrado, bloqueado, etc.).
            </p>
            {pipelines.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center rounded-lg border border-[#E2E8F0] bg-[#F8FAFC]">
                <GitBranch className="h-12 w-12 text-[#94A3B8] mb-3" />
                <p className="text-sm font-medium text-[#64748B]">Nenhum fluxo salvo</p>
                <p className="text-xs text-[#94A3B8] mt-1">
                  Configure um fluxo na aba &quot;Fluxo&quot; e clique em &quot;Salvar fluxo&quot;.
                </p>
              </div>
            ) : (
              <div className="space-y-5">
                {pipelines.map((p: { id: string; name: string; status?: string; config?: Record<string, unknown>; queue_item_ids?: string[]; created_at?: string; updated_at?: string }) => {
                  const horario = (p.config?.horario ?? {}) as Record<string, string>;
                  const count = Array.isArray(p.queue_item_ids) ? p.queue_item_ids.length : 0;
                  const canRun = ["draft", "scheduled", "failed"].includes(p.status ?? "draft") && count > 0;
                  const canEdit = ["draft", "scheduled", "failed"].includes(p.status ?? "draft");
                  const isRunning = runningPipelineId === p.id;
                  const isScheduled = p.status === "scheduled";
                  const canToggle = !["running", "completed"].includes(p.status ?? "");
                  return (
                    <div
                      key={p.id}
                      className={`rounded-xl border overflow-hidden shadow-sm transition-all ${
                        isRunning ? "border-clicvend-orange bg-orange-50/30" : "border-[#E2E8F0] bg-white"
                      }`}
                    >
                      {/* Header: título + botões */}
                      <div className="flex items-center justify-between gap-4 px-4 py-3 border-b border-[#E2E8F0] bg-[#F8FAFC]">
                        <h3 className="font-semibold text-[#1E293B] truncate">{p.name}</h3>
                        <div className="flex shrink-0 items-center gap-1">
                          {canManageBroadcast && canEdit && (
                            <button
                              type="button"
                              onClick={() => handleEditFlow({ id: p.id, name: p.name, config: p.config })}
                              title="Editar fluxo"
                              className="flex items-center justify-center rounded-lg p-2 text-[#64748B] hover:bg-white hover:text-clicvend-orange transition-colors"
                            >
                              <Pencil className="h-4 w-4" />
                            </button>
                          )}
                          {canManageBroadcast && canToggle && (
                            <button
                              type="button"
                              onClick={() => handleTogglePipeline(p.id, p.status ?? "draft")}
                              title={isScheduled ? "Desativar agendamento" : "Ativar agendamento"}
                              className={`flex items-center justify-center rounded-lg p-2 transition-colors ${
                                isScheduled
                                  ? "bg-amber-100 text-amber-800 hover:bg-amber-200"
                                  : "text-[#64748B] hover:bg-white hover:text-[#1E293B]"
                              }`}
                            >
                              {isScheduled ? <Power className="h-4 w-4" /> : <PowerOff className="h-4 w-4" />}
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => handleRunPipeline(p.id)}
                            disabled={!canRun || isRunning}
                            title="Executar"
                            className="flex items-center justify-center rounded-lg p-2 bg-clicvend-orange text-white hover:bg-clicvend-orange-dark disabled:opacity-60 disabled:cursor-not-allowed shadow-sm"
                          >
                            {isRunning ? <Loader2 className="h-4 w-4 animate-spin" /> : <PlayCircle className="h-4 w-4" />}
                          </button>
                          {canManageBroadcast && (
                            <button
                              type="button"
                              onClick={() => handleDeletePipeline(p.id, p.name)}
                              title="Excluir fluxo"
                              className="flex items-center justify-center rounded-lg p-2 text-[#94A3B8] hover:bg-white hover:text-red-600 transition-colors"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          )}
                        </div>
                      </div>
                      {/* Conteúdo: stepper + resumo */}
                      <div className="p-4">
                        <PipelineFlowMini status={p.status} isRunning={isRunning} />
                        <p className="text-xs text-[#64748B] mt-4">
                          {count} contato(s) · {horario.inicio && horario.fim ? `${horario.inicio}–${horario.fim}` : "Sem horário"}
                          {p.status === "scheduled" && (
                            <span className="ml-2 inline-flex items-center gap-1 text-amber-600">
                              <Clock className="h-3 w-3" />
                              Agendado
                            </span>
                          )}
                          {p.status === "completed" && (
                            <span
                              className="ml-2 text-emerald-600"
                              title="As mensagens foram enviadas para a fila do WhatsApp. A entrega pode levar alguns minutos e pode falhar em alguns casos (ex.: número não está no WhatsApp)."
                            >
                              Enviado para fila
                            </span>
                          )}
                          {p.status === "running" && (
                            <span className="ml-2 text-blue-600 font-medium">Em execução</span>
                          )}
                          {p.status === "failed" && (
                            <span className="ml-2 text-red-600">Falhou</span>
                          )}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {selectedItems.length === 0 && viewTab !== "fluxos" && (
          <div className="flex flex-col items-center justify-center p-12 text-center">
            <Users className="h-16 w-16 text-[#E2E8F0]" />
            <p className="mt-4 text-lg font-medium text-[#64748B]">Nenhum contato selecionado</p>
            <p className="mt-2 text-sm text-[#94A3B8]">
              Na lista à esquerda, marque os checkboxes dos contatos que deseja enviar.
            </p>
          </div>
        )}
      </div>

      {/* Input area — apenas na aba Envio rápido */}
      {selectedItems.length > 0 && viewTab === "envio" && (
      <div className="shrink-0 border-t border-[#E2E8F0] p-0 bg-white">
        {recording ? (
          <RecordingInProgressBar seconds={recordingSeconds} onStop={stopRecording} />
        ) : recordedAudioBlob ? (
          <RecordingPreviewBar
            src={recordedAudioPreviewUrl}
            isLoading={!!recordedAudioBlob && !recordedAudioPreviewUrl}
            sending={sending}
            onSend={sendRecordedAudio}
            onDiscard={discardRecordedAudio}
          />
        ) : (
          <div className="flex flex-col bg-white overflow-hidden">
            {/* Tabs */}
            <div className="flex items-center border-b border-[#E2E8F0] bg-[#F8FAFC]">
              <button
                type="button"
                onClick={() => setInputTab("write")}
                className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 flex items-center gap-2 ${inputTab === "write" ? "border-clicvend-orange text-clicvend-orange bg-white" : "border-transparent text-[#64748B] hover:text-[#1E293B] hover:bg-gray-50"}`}
              >
                <MessageSquare className="h-4 w-4" />
                Responder
              </button>
              <button
                type="button"
                onClick={() => setInputTab("quick")}
                className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 flex items-center gap-2 ${inputTab === "quick" ? "border-clicvend-orange text-clicvend-orange bg-white" : "border-transparent text-[#64748B] hover:text-[#1E293B] hover:bg-gray-50"}`}
              >
                <Zap className="h-4 w-4" />
                Respostas Rápidas
              </button>
              <button
                type="button"
                onClick={() => setInputTab("note")}
                className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 flex items-center gap-2 ${inputTab === "note" ? "border-purple-500 text-purple-600 bg-purple-50" : "border-transparent text-[#64748B] hover:text-[#1E293B] hover:bg-gray-50"}`}
              >
                <FileText className="h-4 w-4" />
                Comentário Interno
              </button>
            </div>

            <div className="p-0 relative bg-white">
              {inputTab === "write" || inputTab === "note" ? (
                <>
                  {/* Hidden file inputs */}
                  <input type="file" ref={fileInputRef} accept="image/*" className="hidden" onChange={(e) => onFileChoose("image", e)} />
                  <input type="file" ref={audioInputRef} accept="audio/*" className="hidden" onChange={(e) => onFileChoose("audio", e)} />
                  <input type="file" ref={docInputRef} accept=".pdf,.doc,.docx,.xls,.xlsx" className="hidden" onChange={(e) => onFileChoose("document", e)} />
                  <input type="file" ref={videoInputRef} accept="video/*" className="hidden" onChange={(e) => onFileChoose("video", e)} />

                  {/* Pending media badge */}
                  {pendingMedia && (
                    <div className="flex items-center justify-between border-b border-[#E2E8F0] px-4 py-2 bg-[#F8FAFC]">
                      <span className="text-sm text-[#64748B]">
                        Anexo: {pendingMedia.type} {pendingMedia.docName ? `(${pendingMedia.docName})` : ""}
                      </span>
                      <button type="button" onClick={() => setPendingMedia(null)} className="text-xs text-red-600 hover:underline">Remover</button>
                    </div>
                  )}

                  {/* Quick reply autocomplete */}
                  {quickSearch !== null && filteredQuickReplies.length > 0 && (
                    <div className="absolute bottom-full left-0 mb-2 w-full rounded-xl bg-white border border-[#E2E8F0] shadow-xl overflow-hidden max-h-[300px] overflow-y-auto z-50">
                      {filteredQuickReplies.map((qr, i) => (
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
                      const lastLine = v.split("\n").pop() || "";
                      if (lastLine.trim().startsWith("/")) {
                        setQuickSearch(lastLine.trim().slice(1));
                        setQuickIndex(0);
                      } else {
                        setQuickSearch(null);
                      }
                    }}
                    onKeyDown={(e) => {
                      if (quickSearch !== null && filteredQuickReplies.length > 0) {
                        if (e.key === "ArrowUp") { e.preventDefault(); setQuickIndex((i) => Math.max(0, i - 1)); return; }
                        if (e.key === "ArrowDown") { e.preventDefault(); setQuickIndex((i) => Math.min(filteredQuickReplies.length - 1, i + 1)); return; }
                        if (e.key === "Enter" || e.key === "Tab") { e.preventDefault(); selectQuickReply(filteredQuickReplies[quickIndex]!); return; }
                        if (e.key === "Escape") { e.preventDefault(); setQuickSearch(null); return; }
                      }
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        if (canSend) handleSend();
                      }
                    }}
                    placeholder={inputTab === "note" ? "Escreva um comentário interno (não será enviado ao cliente)..." : "Digite sua mensagem…"}
                    className={`w-full resize-none border-0 p-4 text-sm text-[#1E293B] placeholder-[#94A3B8] focus:ring-0 min-h-[56px] focus:outline-none ${inputTab === "note" ? "bg-purple-50" : "bg-[#F0FDF4]"}`}
                    disabled={sending}
                  />

                  <div className="flex items-center justify-between px-3 py-2 border-t border-[#E2E8F0] bg-[#F8FAFC]">
                    <div className="flex items-center gap-2">
                      <div className="flex shrink-0 items-center gap-0.5 border border-[#E2E8F0] rounded-lg overflow-hidden bg-white">
                        <button
                          type="button"
                          onClick={() => setAttachOpen(!attachOpen)}
                          className="p-2 text-[#64748B] hover:bg-[#E2E8F0] transition-colors"
                          title="Anexar arquivo"
                          disabled={inputTab === "note"}
                        >
                          <Paperclip className="h-5 w-5" />
                        </button>
                        {attachOpen && (
                          <div className="flex items-center border-l border-[#E2E8F0] flex-wrap">
                            <button type="button" onClick={() => { fileInputRef.current?.click(); setAttachOpen(false); }} className="px-3 py-1.5 text-xs text-[#64748B] hover:bg-[#F8FAFC] font-medium">Imagem</button>
                            <button type="button" onClick={() => { videoInputRef.current?.click(); setAttachOpen(false); }} className="px-3 py-1.5 text-xs text-[#64748B] hover:bg-[#F8FAFC] font-medium">Vídeo</button>
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
                          <div ref={inputEmojiPickerRef} className="absolute bottom-full left-0 mb-2 z-50 rounded-xl bg-white border border-[#E2E8F0] shadow-xl overflow-hidden w-[320px]">
                            <div className="max-h-[320px] overflow-auto">
                              <EmojiReactionPicker onSelect={(emoji) => setSendValue((prev) => prev + emoji)} onClose={() => setInputEmojiPickerOpen(false)} />
                            </div>
                          </div>
                        )}
                      </div>

                      {!recording && inputTab !== "note" && (
                        <button type="button" onClick={startRecording} className="p-2 text-[#64748B] hover:bg-[#E2E8F0] rounded-lg transition-colors" title="Gravar áudio">
                          <Mic className="h-5 w-5" />
                        </button>
                      )}

                      <div className="h-5 w-px bg-[#E2E8F0] mx-1" />

                      <button
                        type="button"
                        onClick={handleAICorrection}
                        disabled={correctingText || !sendValue.trim()}
                        className="p-2 text-[#64748B] hover:text-clicvend-orange hover:bg-[#E2E8F0] rounded-lg transition-colors disabled:opacity-50"
                        title="Corrigir com IA"
                      >
                        {correctingText ? <Loader2 className="h-5 w-5 animate-spin" /> : <Sparkles className="h-5 w-5" />}
                      </button>
                    </div>

                    <button
                      type="button"
                      onClick={handleSend}
                      disabled={!canSend}
                      className={`flex h-10 w-10 items-center justify-center rounded-full text-white transition-all shadow-sm disabled:cursor-not-allowed ${
                        inputTab === "note"
                          ? "bg-purple-600 hover:bg-purple-700 disabled:bg-purple-300"
                          : "bg-clicvend-orange hover:bg-clicvend-orange-dark disabled:bg-[#94A3B8]"
                      }`}
                      title={inputTab === "note" ? "Salvar comentário" : "Enviar para todos"}
                    >
                      {sending ? <Loader2 className="h-5 w-5 animate-spin" /> : <Send className="h-5 w-5 ml-0.5" />}
                    </button>
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
                            <th className="px-4 py-2 font-medium w-10"></th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[#F1F5F9]">
                          {tabQuickReplies.map((qr) => (
                            <tr
                              key={qr.id}
                              className="hover:bg-[#F1F5F9] cursor-pointer group transition-colors"
                              onClick={() => { selectQuickReply(qr); setInputTab("write"); }}
                            >
                              <td className="px-4 py-2 font-medium text-[#1E293B]">
                                <div className="flex items-center gap-2">
                                  <span>/{qr.shortCut}</span>
                                  <button
                                    type="button"
                                    onClick={(e) => { e.stopPropagation(); navigator.clipboard.writeText(`/${qr.shortCut}`); }}
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
        )}
      </div>
      )}
    </div>
  );
}
