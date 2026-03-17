"use client";

import { useEffect, useRef, useCallback } from "react";
import { usePathname } from "next/navigation";
import { useQueryClient, useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { queryKeys } from "@/lib/query-keys";

/** Debounce (ms): evita enxurrada de invalidações quando muitas mensagens entram. */
const INVALIDATE_DEBOUNCE_MS = 1200;
/** Invalidação na aba Meus quando chega mensagem na conversa do agente (para o card subir). */
const MINE_UPDATE_DEBOUNCE_MS = 200;
/** Janela (ms) para considerar "mensagem nova" para aviso sonoro e subir card. 60s para tolerar latência. */
const RECENT_MESSAGE_MS = 60_000;

/** URL do áudio para notificação (opcional). Se não existir, usa beep por Web Audio. */
const NOTIFICATION_SOUND_URL = "/sounds/new-message.mp3";

function playNewMessageSound() {
  try {
    const audio = new Audio(NOTIFICATION_SOUND_URL);
    audio.volume = 0.6;
    audio.play().catch(() => playBeepFallback());
  } catch {
    playBeepFallback();
  }
}

function playBeepFallback() {
  try {
    const Ctx = typeof window !== "undefined" && window.AudioContext ? window.AudioContext : (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const play = () => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.value = 800;
      osc.type = "sine";
      gain.gain.setValueAtTime(0.15, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.15);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.15);
    };
    if (ctx.state === "suspended") {
      ctx.resume().then(play).catch(() => {});
    } else {
      play();
    }
  } catch {
    // ignorar
  }
}

/**
 * Escuta mudanças na tabela conversations via Supabase Realtime e invalida
 * lista e contagens (com debounce).
 * Na aba Meus: toca aviso sonoro quando entra mensagem em conversa atribuída ao agente
 * e invalida a lista na hora para o card da conversa subir (priorizar resposta).
 *
 * No Supabase: ative a replicação da tabela `conversations` em
 * Database > Replication para que postgres_changes funcione.
 */
export function RealtimeConversations() {
  const pathname = usePathname();
  const queryClient = useQueryClient();
  const slug = pathname?.split("/").filter(Boolean)[0] ?? "";
  const apiHeaders = slug ? { "X-Company-Slug": slug } : undefined;
  /** ID da conversa aberta na URL (para não tocar som na conversa atual). */
  const openConversationId = pathname?.includes("/conversas/")
    ? pathname.split("/conversas/")[1]?.split("/")[0] ?? null
    : null;

  const { data: permissionsData } = useQuery({
    queryKey: queryKeys.permissions(slug),
    queryFn: () =>
      fetch("/api/auth/permissions", { credentials: "include", headers: apiHeaders }).then((r) => r.json()),
    enabled: !!slug,
    staleTime: 5 * 60 * 1000,
  });

  const companyId = (permissionsData as { company_id?: string } | undefined)?.company_id ?? null;
  const currentUserId = (permissionsData as { user_id?: string } | undefined)?.user_id ?? null;
  const channelRef = useRef<ReturnType<ReturnType<typeof createClient>["channel"]> | null>(null);

  // Desbloqueia áudio no primeiro clique (política de autoplay do navegador)
  useEffect(() => {
    const unlock = () => {
      if (typeof window === "undefined") return;
      const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctx) return;
      const ctx = new Ctx();
      if (ctx.state === "suspended") ctx.resume();
    };
    window.addEventListener("click", unlock, { once: true });
    window.addEventListener("keydown", unlock, { once: true });
    return () => {
      window.removeEventListener("click", unlock);
      window.removeEventListener("keydown", unlock);
    };
  }, []);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mineDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastInvalidateRef = useRef(0);

  const doInvalidate = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: queryKeys.conversationListInfinite(slug, "queues") });
    queryClient.invalidateQueries({ queryKey: queryKeys.conversationListInfinite(slug, "mine") });
    queryClient.invalidateQueries({ queryKey: queryKeys.conversationListInfinite(slug, "unassigned") });
    queryClient.invalidateQueries({ queryKey: queryKeys.counts(slug) });
    queryClient.invalidateQueries({ queryKey: ["tickets", "list"] });
    lastInvalidateRef.current = Date.now();
  }, [queryClient, slug]);

  useEffect(() => {
    if (!slug || !companyId) return;

    const supabase = createClient();
    const channel = supabase
      .channel(`conversations:${companyId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "conversations",
          filter: `company_id=eq.${companyId}`,
        },
        (payload: { new?: { id?: string; last_message_at?: string; assigned_to?: string | null }; old?: { last_message_at?: string } }) => {
          const newRow = payload?.new as { id?: string; last_message_at?: string; assigned_to?: string | null } | undefined;
          const id = newRow?.id;
          const lastMsgAt = newRow?.last_message_at;
          const assignedTo = newRow?.assigned_to ?? null;
          const now = new Date();
          const msgTime = lastMsgAt ? new Date(lastMsgAt).getTime() : 0;
          const isRecentMessage = lastMsgAt && now.getTime() - msgTime < RECENT_MESSAGE_MS;
          const isOtherConversation = id && id !== openConversationId;
          const isMyConversation = currentUserId && assignedTo === currentUserId;
          const isUnassignedNew = assignedTo == null || assignedTo === "";

          if (isRecentMessage && isOtherConversation && (isMyConversation || isUnassignedNew)) {
            playNewMessageSound();
            if (mineDebounceRef.current) clearTimeout(mineDebounceRef.current);
            mineDebounceRef.current = setTimeout(() => {
              mineDebounceRef.current = null;
              if (isMyConversation) {
                queryClient.invalidateQueries({ queryKey: queryKeys.conversationListInfinite(slug, "mine") });
              }
              if (isUnassignedNew) {
                queryClient.invalidateQueries({ queryKey: queryKeys.conversationListInfinite(slug, "unassigned") });
              }
              queryClient.invalidateQueries({ queryKey: queryKeys.counts(slug) });
            }, MINE_UPDATE_DEBOUNCE_MS);
          }

          if (id) {
            queryClient.invalidateQueries({ queryKey: queryKeys.conversation(id) });
          }
          if (typeof window !== "undefined") {
            window.dispatchEvent(new CustomEvent("conversations-status-reset"));
          }
          if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
          debounceTimerRef.current = setTimeout(() => {
            debounceTimerRef.current = null;
            doInvalidate();
          }, INVALIDATE_DEBOUNCE_MS);
        }
      )
      .subscribe();

    channelRef.current = channel;

    return () => {
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
      if (mineDebounceRef.current) clearTimeout(mineDebounceRef.current);
      debounceTimerRef.current = null;
      mineDebounceRef.current = null;
      supabase.removeChannel(channel);
      channelRef.current = null;
    };
  }, [slug, companyId, currentUserId, queryClient, doInvalidate, openConversationId]);

  return null;
}
