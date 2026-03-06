"use client";

import { useEffect } from "react";

function isAbortOrLockError(e: unknown): boolean {
  if (e instanceof Error) {
    if (e.name === "AbortError") return true;
    if (e.message?.includes("Lock broken") || e.message?.includes("steal")) return true;
  }
  if (e && typeof e === "object" && "name" in e && (e as Error).name === "AbortError") return true;
  if (e && typeof e === "object" && "message" in e && String((e as Error).message).includes("Lock broken")) return true;
  return false;
}

/**
 * Evita que AbortError e "Lock broken by another request with the 'steal' option"
 * disparem o overlay de erro do Next.js (conflito de cache/prefetch no dev).
 */
export function AbortErrorHandler() {
  useEffect(() => {
    function onError(event: ErrorEvent) {
      const msg = event.message ?? "";
      if (event.error?.name === "AbortError" || msg.includes("Lock broken") || msg.includes("steal")) {
        event.preventDefault();
        event.stopImmediatePropagation?.();
        return true;
      }
    }

    function onUnhandledRejection(event: PromiseRejectionEvent) {
      if (isAbortOrLockError(event.reason)) {
        event.preventDefault();
        return;
      }
    }

    window.addEventListener("error", onError, true);
    window.addEventListener("unhandledrejection", onUnhandledRejection, true);
    return () => {
      window.removeEventListener("error", onError, true);
      window.removeEventListener("unhandledrejection", onUnhandledRejection, true);
    };
  }, []);

  return null;
}
