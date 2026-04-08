"use client";

import { useEffect, useRef, useCallback, useMemo } from "react";
import { usePathname } from "next/navigation";
import { useQueryClient, useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { BRAND_NAME } from "@/lib/brand";
import { queryKeys } from "@/lib/query-keys";
import {
  getDesktopNotifyEnabled,
  requestNotificationPermission,
  showIncomingChatDesktopNotification,
} from "@/lib/browser-desktop-notification";

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
 * Escuta `conversations` (debounce) para invalidar listas/contagens.
 * Aviso sonoro + notificação nativa: apenas em INSERT em `messages` com direction=in
 * (evita bip ao enviar menu de consentimento, respostas do painel, etc.).
 *
 * Som respeita inbox.mute_new_message_sound e inbox.hide_new_notifications.
 * Notificação nativa só com Notification.permission === "granted".
 *
 * Supabase: replicação de `conversations` e `messages` para postgres_changes.
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
  const muteIncomingSound = useMemo(() => {
    const list = (permissionsData as { permissions?: string[] } | undefined)?.permissions;
    return Array.isArray(list) && list.includes("inbox.mute_new_message_sound");
  }, [permissionsData]);
  const hideNewNotifications = useMemo(() => {
    const list = (permissionsData as { permissions?: string[] } | undefined)?.permissions;
    return Array.isArray(list) && list.includes("inbox.hide_new_notifications");
  }, [permissionsData]);
  const channelRef = useRef<ReturnType<ReturnType<typeof createClient>["channel"]> | null>(null);
  const messagesChannelRef = useRef<ReturnType<ReturnType<typeof createClient>["channel"]> | null>(null);

  // Desbloqueia áudio no primeiro clique + pede permissão de notificação uma vez (sem UI no sino).
  useEffect(() => {
    const unlock = () => {
      if (typeof window === "undefined") return;
      const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctx) return;
      const ctx = new Ctx();
      if (ctx.state === "suspended") ctx.resume();
      if (typeof Notification !== "undefined" && Notification.permission === "default") {
        void requestNotificationPermission();
      }
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
        (payload: {
          new?: {
            id?: string;
            last_message_at?: string;
            assigned_to?: string | null;
            customer_name?: string | null;
            customer_phone?: string | null;
          };
          old?: { last_message_at?: string };
        }) => {
          const newRow = payload?.new as
            | {
                id?: string;
                last_message_at?: string;
                assigned_to?: string | null;
                customer_name?: string | null;
                customer_phone?: string | null;
              }
            | undefined;
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
            if (!muteIncomingSound) playNewMessageSound();
            if (id && slug && getDesktopNotifyEnabled()) {
              const displayName =
                (newRow?.customer_name && String(newRow.customer_name).trim()) ||
                (newRow?.customer_phone && String(newRow.customer_phone).trim()) ||
                "Nova mensagem";
              const bodyHint = isUnassignedNew
                ? `Novo na fila — abra o chat no ${BRAND_NAME}.`
                : `Nova mensagem — abra o chat no ${BRAND_NAME}.`;
              showIncomingChatDesktopNotification({
                slug,
                conversationId: id,
                title: displayName,
                body: bodyHint,
              });
            }
            if (typeof window !== "undefined") {
              window.dispatchEvent(new CustomEvent("clicvend:notifications-refresh"));
            }
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

    const messagesChannel = supabase
      .channel(`messages-incoming:${companyId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages" },
        (payload: {
          new?: {
            conversation_id?: string;
            direction?: string;
            sent_at?: string;
            message_type?: string;
          };
        }) => {
          const row = payload.new;
          if (!row?.conversation_id || row.direction !== "in") return;
          if (String(row.message_type ?? "").toLowerCase() === "internal_note") return;

          const msgTime = row.sent_at ? new Date(row.sent_at).getTime() : 0;
          if (!msgTime || Date.now() - msgTime > RECENT_MESSAGE_MS) return;
          if (row.conversation_id === openConversationId) return;

          void (async () => {
            const { data: conv, error } = await supabase
              .from("conversations")
              .select("id, company_id, assigned_to, customer_name, customer_phone")
              .eq("id", row.conversation_id!)
              .maybeSingle();
            if (error || !conv || String((conv as { company_id?: string }).company_id) !== companyId) return;

            const assignedTo = (conv as { assigned_to?: string | null }).assigned_to ?? null;
            const isMyConversation = Boolean(currentUserId && assignedTo === currentUserId);
            const isUnassignedNew = assignedTo == null || assignedTo === "";
            if (!isMyConversation && !isUnassignedNew) return;

            const allowSound =
              !muteIncomingSound && !hideNewNotifications && typeof window !== "undefined";
            if (allowSound) playNewMessageSound();

            if (slug && getDesktopNotifyEnabled() && !hideNewNotifications) {
              const displayName =
                (conv as { customer_name?: string | null }).customer_name?.trim() ||
                (conv as { customer_phone?: string | null }).customer_phone?.trim() ||
                "Nova mensagem";
              const bodyHint = isUnassignedNew
                ? `Novo na fila — abra o chat no ${BRAND_NAME}.`
                : `Nova mensagem — abra o chat no ${BRAND_NAME}.`;
              showIncomingChatDesktopNotification({
                slug,
                conversationId: row.conversation_id!,
                title: displayName,
                body: bodyHint,
              });
            }
            if (typeof window !== "undefined") {
              window.dispatchEvent(new CustomEvent("clicvend:notifications-refresh"));
            }
          })();
        }
      )
      .subscribe();

    messagesChannelRef.current = messagesChannel;

    return () => {
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
      if (mineDebounceRef.current) clearTimeout(mineDebounceRef.current);
      debounceTimerRef.current = null;
      mineDebounceRef.current = null;
      supabase.removeChannel(channel);
      supabase.removeChannel(messagesChannel);
      channelRef.current = null;
      messagesChannelRef.current = null;
    };
  }, [
    slug,
    companyId,
    currentUserId,
    queryClient,
    doInvalidate,
    openConversationId,
    muteIncomingSound,
    hideNewNotifications,
  ]);

  return null;
}
