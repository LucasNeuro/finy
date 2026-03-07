"use client";

import { useEffect, useId, useRef } from "react";
import { X } from "lucide-react";

export interface SideOverProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  /** Largura em px ou rem. Padrão: 680px */
  width?: string | number;
}

export function SideOver({
  open,
  onClose,
  title,
  children,
  width = "680px",
}: SideOverProps) {
  const titleId = useId();
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);
  const prevOpenRef = useRef(false);

  useEffect(() => {
    if (!open) {
      prevOpenRef.current = false;
      document.body.style.overflow = "";
      return;
    }
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleEscape);
    document.body.style.overflow = "hidden";
    // Foca o botão de fechar apenas quando o painel abre (transição false -> true), não a cada re-render
    if (!prevOpenRef.current && closeButtonRef.current) {
      closeButtonRef.current.focus();
    }
    prevOpenRef.current = true;
    return () => {
      document.removeEventListener("keydown", handleEscape);
      document.body.style.overflow = "";
    };
  }, [open, onClose]);

  const w = typeof width === "number" ? `${width}px` : width;

  return (
    <>
      {/* Backdrop */}
      <div
        role="presentation"
        aria-hidden={!open}
        className={`fixed inset-0 z-40 bg-black/30 transition-opacity duration-200 ${
          open ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
        onClick={onClose}
      />
      {/* Panel */}
      <aside
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={`fixed right-0 top-0 z-50 flex h-full flex-col bg-white shadow-xl transition-transform duration-300 ease-out ${
          open ? "translate-x-0" : "translate-x-full"
        }`}
        style={{ width: w, maxWidth: "100vw" }}
      >
        <header className="flex shrink-0 items-center justify-between border-b border-gray-200 px-6 py-4">
          <h2 id={titleId} className="text-lg font-semibold text-gray-900">
            {title}
          </h2>
          <button
            type="button"
            ref={closeButtonRef}
            onClick={onClose}
            className="rounded-lg p-2 text-gray-500 hover:bg-gray-100 hover:text-gray-700"
            aria-label="Fechar painel"
          >
            <X className="h-5 w-5" />
          </button>
        </header>
        <div className="flex-1 overflow-y-auto px-6 py-4">{children}</div>
      </aside>
    </>
  );
}
