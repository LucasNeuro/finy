"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import { Play, Pause, Volume2, Download, Loader2, MoreVertical } from "lucide-react";

/** Formata segundos em mm:ss */
function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

/**
 * Mini player de áudio na conversa (enviados e recebidos).
 * Estilo compacto: play/pause, tempo, barra de progresso, volume, menu.
 */
export function ChatAudioPlayer({
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
  const [volume, setVolume] = useState(1);
  const [menuOpen, setMenuOpen] = useState(false);

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

  useEffect(() => {
    const el = audioRef.current;
    if (el) el.volume = volume;
  }, [volume]);

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;

  if (isLoading || !src) {
    return (
      <div className="flex items-center gap-3 rounded-xl bg-[#F8FAFC] border border-[#E2E8F0] px-4 py-3 w-full max-w-[min(100%,260px)] shadow-sm">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#E2E8F0]">
          <Loader2 className="h-5 w-5 animate-spin text-clicvend-orange" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="h-2.5 w-full rounded-full bg-[#E2E8F0] overflow-hidden" />
          <p className="mt-1.5 text-xs text-[#64748B]">Carregando áudio…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-3 rounded-xl bg-[#F8FAFC] border border-[#E2E8F0] px-4 py-3 w-full max-w-[min(100%,260px)] shadow-sm hover:border-[#CBD5E1] transition-colors">
      {src && <audio ref={audioRef} src={src} preload="metadata" className="hidden" />}
      <button
        type="button"
        onClick={togglePlay}
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-clicvend-orange text-white hover:bg-clicvend-orange-dark active:scale-95 transition-all focus:outline-none focus:ring-2 focus:ring-clicvend-orange focus:ring-offset-2"
        aria-label={playing ? "Pausar" : "Reproduzir"}
      >
        {playing ? <Pause className="h-5 w-5" /> : <Play className="h-5 w-5 ml-0.5" />}
      </button>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-[#475569] tabular-nums">
          {formatDuration(currentTime)} / {loaded ? formatDuration(duration) : "–:––"}
        </p>
        <div
          className="h-2.5 w-full rounded-full bg-[#E2E8F0] overflow-hidden cursor-pointer mt-1.5"
          onClick={(e) => {
            const el = audioRef.current;
            if (!el) return;
            const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
            const x = e.clientX - rect.left;
            const pct = Math.max(0, Math.min(1, x / rect.width));
            el.currentTime = pct * el.duration;
            setCurrentTime(el.currentTime);
          }}
        >
          <div
            className="h-full rounded-full bg-clicvend-orange transition-all duration-150 ease-out"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>
      <div className="flex items-center gap-0.5 shrink-0">
        <div className="flex items-center gap-1" title="Volume">
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={volume}
            onChange={(e) => setVolume(parseFloat(e.target.value))}
            className="w-14 h-2 accent-clicvend-orange cursor-pointer"
            aria-label="Volume"
          />
          <span className="text-[#64748B]" aria-hidden>
            <Volume2 className="h-4 w-4" />
          </span>
        </div>
        <div className="relative">
          <button
            type="button"
            onClick={() => setMenuOpen((o) => !o)}
            className="p-1.5 rounded-full text-[#64748B] hover:bg-[#E2E8F0] hover:text-[#1E293B] transition-colors"
            aria-label="Opções"
          >
            <MoreVertical className="h-4 w-4" />
          </button>
          {menuOpen && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} aria-hidden />
              <div className="absolute right-0 top-full mt-1 z-20 rounded-lg border border-[#E2E8F0] bg-white shadow-lg py-1 min-w-[120px]">
                {onDownload && (
                  <button
                    type="button"
                    onClick={() => { onDownload(); setMenuOpen(false); }}
                    className="w-full flex items-center gap-2 px-3 py-2 text-sm text-[#64748B] hover:bg-[#F1F5F9] hover:text-clicvend-orange text-left"
                  >
                    <Download className="h-4 w-4" /> Baixar
                  </button>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
