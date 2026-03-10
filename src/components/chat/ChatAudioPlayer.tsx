"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import { Play, Pause, Loader2 } from "lucide-react";

/** Formata segundos em mm:ss */
function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

/**
 * Mini player de áudio na conversa — play, linha fina de progresso (permite voltar/avançar) e tempo.
 * Enviadas: degradê roxo suave. Recebidas: degradê verde suave.
 */
export function ChatAudioPlayer({
  src,
  onDownload,
  isLoading,
  direction = "in",
}: {
  src: string | null;
  onDownload?: () => void;
  isLoading?: boolean;
  /** "in" = recebido (roxo), "out" = enviado (verde) */
  direction?: "in" | "out";
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

  const handleSeek = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      const el = audioRef.current;
      if (!el || !duration) return;
      const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
      const x = e.clientX - rect.left;
      const pct = Math.max(0, Math.min(1, x / rect.width));
      el.currentTime = pct * el.duration;
      setCurrentTime(el.currentTime);
    },
    [duration]
  );

  const isOut = direction === "out";
  // Enviadas (out): roxo suave; Recebidas (in): verde suave
  const gradientClasses = isOut
    ? "bg-gradient-to-r from-violet-200 via-purple-100 to-fuchsia-100 text-violet-900/90"
    : "bg-gradient-to-r from-emerald-200 via-green-100 to-teal-100 text-emerald-900/90";
  const loadingBarBg = "bg-white/40";
  const textClasses = isOut ? "text-violet-800/90" : "text-emerald-800/90";
  const btnClasses = isOut
    ? "bg-white text-violet-500 shadow-sm hover:scale-105"
    : "bg-white text-emerald-500 shadow-sm hover:scale-105";

  if (isLoading || !src) {
    return (
      <div className={`flex items-center gap-2 rounded-xl ${gradientClasses} px-4 py-3 w-full shadow-sm`}>
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/25">
          <Loader2 className="h-3.5 w-3.5 animate-spin text-white" />
        </div>
        <div className="flex-1 min-w-0">
          <div className={`h-1 w-full rounded-full ${loadingBarBg} overflow-hidden`} />
          <p className={`mt-1 text-[10px] ${textClasses}`}>Carregando…</p>
        </div>
      </div>
    );
  }

  return (
    <div className={`flex items-center gap-3 rounded-xl ${gradientClasses} px-4 py-3 w-full shadow-sm hover:shadow-md transition-shadow`}>
      {src && <audio ref={audioRef} src={src} preload="auto" className="hidden" />}
      <button
        type="button"
        onClick={togglePlay}
        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${btnClasses} transition-transform focus:outline-none focus:ring-2 focus:ring-white/50`}
        aria-label={playing ? "Pausar" : "Reproduzir"}
      >
        {playing ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5 ml-0.5" />}
      </button>
      <div className="flex-1 min-w-0">
        <div className={`flex items-center justify-between text-[11px] tabular-nums ${textClasses}`}>
          <span>{formatDuration(currentTime)}</span>
          <span>{loaded ? formatDuration(duration) : "–:––"}</span>
        </div>
        <div
          className="mt-1 h-1 w-full rounded-full bg-white/40 overflow-hidden cursor-pointer"
          onClick={handleSeek}
          role="slider"
          aria-label="Posição do áudio"
          aria-valuenow={progress}
          aria-valuemin={0}
          aria-valuemax={100}
        >
          <div
            className="h-full rounded-full bg-white/90 shadow-[0_0_2px_rgba(255,255,255,0.8)] transition-all duration-150"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>
    </div>
  );
}
