"use client";

import React, { useState, useEffect, useRef } from "react";
import { X, Download, ZoomIn, ZoomOut, ExternalLink, Loader2 } from "lucide-react";

export interface DocumentViewerModalProps {
  open: boolean;
  onClose: () => void;
  /** URL do arquivo para exibir (quando já disponível). */
  fileUrl?: string | null;
  /** Se não tiver fileUrl, busca pelo endpoint de download. */
  fetchDownload?: () => Promise<string | null>;
  fileName?: string | null;
  /** Tipo do arquivo para decidir se usa iframe (pdf) ou download apenas. */
  mimeType?: string | null;
}

const ZOOM_STEP = 0.25;
const MIN_ZOOM = 0.5;
const MAX_ZOOM = 2.5;

/**
 * Modal de visualização de documento (PDF, etc.) no tom da aplicação.
 * Barra superior: zoom, download, abrir em nova aba, fechar.
 * Sem painel de IA — apenas visualizador e ações.
 */
export function DocumentViewerModal({
  open,
  onClose,
  fileUrl: initialFileUrl,
  fetchDownload,
  fileName,
  mimeType,
}: DocumentViewerModalProps) {
  const [fileUrl, setFileUrl] = useState<string | null>(initialFileUrl ?? null);
  const [loading, setLoading] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [zoom, setZoom] = useState(1);
  const containerRef = useRef<HTMLDivElement>(null);

  const isPdf = (mimeType ?? "").toLowerCase().includes("pdf") ||
    (fileName ?? "").toLowerCase().endsWith(".pdf");

  useEffect(() => {
    if (!open) {
      setFileUrl(initialFileUrl ?? null);
      setZoom(1);
      return;
    }
    if (initialFileUrl) {
      setFileUrl(initialFileUrl);
      return;
    }
    if (fetchDownload) {
      setLoading(true);
      setFileUrl(null);
      fetchDownload()
        .then((url) => setFileUrl(url ?? null))
        .finally(() => setLoading(false));
    }
  }, [open, initialFileUrl, fetchDownload]);

  const handleZoomIn = () => setZoom((z) => Math.min(MAX_ZOOM, z + ZOOM_STEP));
  const handleZoomOut = () => setZoom((z) => Math.max(MIN_ZOOM, z - ZOOM_STEP));
  const handleZoomReset = () => setZoom(1);

  const handleDownload = async () => {
    if (fileUrl) {
      window.open(fileUrl, "_blank", "noopener,noreferrer");
      return;
    }
    if (fetchDownload) {
      setDownloading(true);
      try {
        const url = await fetchDownload();
        if (url) {
          setFileUrl(url);
          window.open(url, "_blank", "noopener,noreferrer");
        }
      } finally {
        setDownloading(false);
      }
    }
  };

  const canDownload = !!fileUrl || !!fetchDownload;
  const downloadBusy = downloading;

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <>
      <div
        role="presentation"
        className="fixed inset-0 z-[100] bg-black/40"
        onClick={onClose}
        aria-hidden
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Visualizador de documento"
        className="fixed inset-4 z-[101] flex flex-col rounded-xl bg-white shadow-xl border border-[#E2E8F0] overflow-hidden md:inset-8"
      >
        {/* Toolbar */}
        <header className="flex shrink-0 items-center justify-between gap-2 border-b border-[#E2E8F0] bg-[#F8FAFC] px-4 py-2">
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-0.5 rounded-lg border border-[#E2E8F0] bg-white p-0.5">
              <button
                type="button"
                onClick={handleZoomOut}
                disabled={zoom <= MIN_ZOOM}
                className="rounded p-1.5 text-[#64748B] hover:bg-[#E2E8F0] hover:text-[#1E293B] disabled:opacity-40 disabled:pointer-events-none"
                aria-label="Diminuir zoom"
              >
                <ZoomOut className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={handleZoomReset}
                className="min-w-[3rem] rounded px-2 py-1.5 text-xs font-medium text-[#64748B] hover:bg-[#E2E8F0] hover:text-[#1E293B]"
              >
                {Math.round(zoom * 100)}%
              </button>
              <button
                type="button"
                onClick={handleZoomIn}
                disabled={zoom >= MAX_ZOOM}
                className="rounded p-1.5 text-[#64748B] hover:bg-[#E2E8F0] hover:text-[#1E293B] disabled:opacity-40 disabled:pointer-events-none"
                aria-label="Aumentar zoom"
              >
                <ZoomIn className="h-4 w-4" />
              </button>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={handleDownload}
              disabled={!canDownload || downloadBusy}
              className="inline-flex items-center gap-1.5 rounded-lg border border-[#E2E8F0] bg-white px-3 py-1.5 text-sm text-[#64748B] hover:bg-[#F1F5F9] hover:text-clicvend-orange disabled:opacity-50"
              title="Baixar arquivo"
            >
              {downloadBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
              Baixar
            </button>
            <button
              type="button"
              onClick={() => fileUrl && window.open(fileUrl, "_blank", "noopener,noreferrer")}
              disabled={!fileUrl}
              className="inline-flex items-center gap-1.5 rounded-lg border border-[#E2E8F0] bg-white px-3 py-1.5 text-sm text-[#64748B] hover:bg-[#F1F5F9] hover:text-clicvend-orange disabled:opacity-50"
              title="Abrir em nova aba"
            >
              <ExternalLink className="h-4 w-4" />
              Nova aba
            </button>
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg p-2 text-[#64748B] hover:bg-[#E2E8F0] hover:text-[#1E293B]"
              aria-label="Fechar"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </header>

        {/* Conteúdo */}
        <div
          ref={containerRef}
          className="flex-1 min-h-0 flex items-center justify-center overflow-auto bg-[#F1F5F9] p-4"
          onClick={(e) => e.stopPropagation()}
        >
          {loading && (
            <div className="flex flex-col items-center gap-3 text-[#64748B]">
              <Loader2 className="h-10 w-10 animate-spin text-clicvend-orange" />
              <p className="text-sm">Carregando documento…</p>
            </div>
          )}
          {!loading && !fileUrl && (
            <div className="text-center text-[#64748B]">
              <p className="text-sm">Não foi possível carregar o documento.</p>
              <p className="mt-1 text-xs">
                {fetchDownload
                  ? "Clique em Baixar acima para tentar obter o arquivo."
                  : "Use o botão Baixar no card da mensagem."}
              </p>
            </div>
          )}
          {!loading && fileUrl && isPdf && (
            <div
              className="overflow-auto rounded-lg border border-[#E2E8F0] bg-white shadow-sm"
              style={{
                transform: `scale(${zoom})`,
                transformOrigin: "top center",
              }}
            >
              <iframe
                src={fileUrl}
                title={fileName ?? "Documento"}
                className="h-[70vh] w-[min(90vw,800px)] border-0"
              />
            </div>
          )}
          {!loading && fileUrl && !isPdf && (
            <div className="text-center max-w-md">
              <p className="text-sm text-[#64748B]">
                Visualização em navegador disponível apenas para PDF.
              </p>
              <p className="mt-2 text-sm text-[#1E293B]">
                Use <strong>Baixar</strong> ou <strong>Nova aba</strong> para abrir o arquivo.
              </p>
              <button
                type="button"
                onClick={handleDownload}
                className="mt-4 inline-flex items-center gap-2 rounded-lg bg-clicvend-orange px-4 py-2 text-sm font-medium text-white hover:bg-clicvend-orange-dark"
              >
                <Download className="h-4 w-4" /> Baixar arquivo
              </button>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
