"use client";

import { useEffect, useRef, useCallback } from "react";
import { usePathname } from "next/navigation";
import { useQueryClient, useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { queryKeys } from "@/lib/query-keys";

/** Debounce (ms): evita enxurrada de invalidações quando muitas mensagens entram. */
const INVALIDATE_DEBOUNCE_MS = 4000;

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
    const ctx = new (typeof window !== "undefined" && window.AudioContext ? window.AudioContext : (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext)();
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
  } catch {
    // ignorar
  }
}

/**
 * Escuta mudanças na tabela conversations via Supabase Realtime e invalida
 * lista e contagens (com debounce) para não travar a UI com centenas de refetches.
 * Reproduz som quando chega mensagem nova em outra conversa.
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
  const channelRef = useRef<ReturnType<ReturnType<typeof createClient>["channel"]> | null>(null);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
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
        (payload: { new?: { id?: string; last_message_at?: string }; old?: { last_message_at?: string } }) => {
          const newRow = payload?.new as { id?: string; last_message_at?: string } | undefined;
          const id = newRow?.id;
          const lastMsgAt = newRow?.last_message_at;
          const now = new Date();
          const msgTime = lastMsgAt ? new Date(lastMsgAt).getTime() : 0;
          const isRecentMessage = lastMsgAt && now.getTime() - msgTime < 60_000;
          const isOtherConversation = id && id !== openConversationId;
          if (isRecentMessage && isOtherConversation && pathname?.startsWith(`/${slug}/conversas`)) {
            playNewMessageSound();
          }

          if (id) {
            queryClient.invalidateQueries({ queryKey: queryKeys.conversation(id) });
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
      debounceTimerRef.current = null;
      supabase.removeChannel(channel);
      channelRef.current = null;
    };
  }, [slug, companyId, queryClient, doInvalidate, openConversationId, pathname]);

  return null;
}
