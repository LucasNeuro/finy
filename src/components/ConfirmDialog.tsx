"use client";

import { useEffect } from "react";
import { AlertTriangle } from "lucide-react";

export type ConfirmVariant = "primary" | "danger" | "warning";

export interface ConfirmDialogProps {
  open: boolean;
  onClose: () => void;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel?: () => void;
  variant?: ConfirmVariant;
  /** Se true, mostra apenas o botão de confirmar (estilo alert) */
  alertOnly?: boolean;
}

export function ConfirmDialog({
  open,
  onClose,
  title,
  message,
  confirmLabel = "Confirmar",
  cancelLabel = "Cancelar",
  onConfirm,
  onCancel,
  variant = "primary",
  alertOnly = false,
}: ConfirmDialogProps) {
  useEffect(() => {
    if (!open) return;
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (alertOnly) onConfirm();
        else (onCancel ?? onClose)();
      }
    };
    document.addEventListener("keydown", handleEscape);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", handleEscape);
      document.body.style.overflow = "";
    };
  }, [open, onClose, onConfirm, onCancel, alertOnly]);

  if (!open) return null;

  const handleConfirm = () => {
    onConfirm();
    onClose();
  };

  const handleCancel = () => {
    onCancel?.();
    onClose();
  };

  const confirmClass =
    variant === "danger"
      ? "bg-red-600 text-white hover:bg-red-700 focus:ring-red-500"
      : variant === "warning"
        ? "bg-amber-600 text-white hover:bg-amber-700 focus:ring-amber-500"
        : "bg-clicvend-orange text-white hover:bg-clicvend-orange-dark focus:ring-clicvend-orange";

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-dialog-title"
      aria-describedby="confirm-dialog-desc"
      className="fixed inset-0 z-[100] flex items-center justify-center p-4"
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/40 transition-opacity"
        onClick={alertOnly ? handleConfirm : handleCancel}
        aria-hidden="true"
      />
      {/* Panel */}
      <div className="relative w-full max-w-md rounded-xl bg-white shadow-xl border border-[#E2E8F0] overflow-hidden">
        <div className="p-6">
          <div className="flex gap-4">
            <div
              className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${
                variant === "danger" ? "bg-red-100 text-red-600" : "bg-amber-100 text-amber-700"
              }`}
            >
              <AlertTriangle className="h-5 w-5" />
            </div>
            <div className="min-w-0 flex-1">
              <h2 id="confirm-dialog-title" className="text-lg font-semibold text-[#1E293B]">
                {title}
              </h2>
              <p id="confirm-dialog-desc" className="mt-1 text-sm text-[#64748B]">
                {message}
              </p>
            </div>
          </div>
          <div className={`mt-6 flex gap-3 ${alertOnly ? "justify-end" : "justify-end"}`}>
            {!alertOnly && (
              <button
                type="button"
                onClick={handleCancel}
                className="rounded-lg border border-[#E2E8F0] bg-white px-4 py-2 text-sm font-medium text-[#64748B] hover:bg-[#F8FAFC] focus:outline-none focus:ring-2 focus:ring-[#E2E8F0] focus:ring-offset-2"
              >
                {cancelLabel}
              </button>
            )}
            <button
              type="button"
              onClick={handleConfirm}
              className={`rounded-lg px-4 py-2 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-offset-2 ${confirmClass}`}
            >
              {confirmLabel}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
