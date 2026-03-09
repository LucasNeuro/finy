"use client";

import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { queryKeys } from "@/lib/query-keys";

type Message = {
  id: string;
  conversation_id?: string;
  direction: "in" | "out";
  content: string;
  sent_at: string;
  message_type?: string;
  media_url?: string | null;
  caption?: string | null;
  file_name?: string | null;
  external_id?: string | null;
  reaction?: string | null;
};

type ConversationDetail = {
  id: string;
  messages: Message[];
  [key: string]: unknown;
};

/**
 * Escuta mudanças na tabela messages via Supabase Realtime e atualiza
 * as mensagens da conversa em tempo real sem refetch completo.
 *
 * No Supabase: ative a replicação da tabela `messages` em
 * Database > Replication para que postgres_changes funcione.
 */
export function RealtimeMessages({ conversationId }: { conversationId: string }) {
  const [mounted, setMounted] = useState(false);
  const queryClient = useQueryClient();
  const channelRef = useRef<ReturnType<ReturnType<typeof createClient>["channel"]> | null>(null);
  const isUserScrollingRef = useRef(false);
  const scrollCheckTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Garantir que só renderiza no cliente
  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!conversationId || !mounted) return;

    const supabase = createClient();
    const channel = supabase
      .channel(`messages:${conversationId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
          filter: `conversation_id=eq.${conversationId}`,
        },
        (payload: { new?: Message }) => {
          const newMessage = payload?.new as Message | undefined;
          if (!newMessage) return;

          // Atualizar cache da conversa adicionando a nova mensagem
          queryClient.setQueryData<ConversationDetail>(
            queryKeys.conversation(conversationId),
            (oldData) => {
              if (!oldData) return oldData;

              // Verificar se a mensagem já existe (evitar duplicatas por id ou external_id+sent_at+direction)
          const existingMessages = Array.isArray(oldData.messages) ? oldData.messages : [];
          const messageExists =
            existingMessages.some((m) => m.id === newMessage.id) ||
            (newMessage.external_id &&
              existingMessages.some(
                (m) =>
                  (m as { external_id?: string }).external_id === newMessage.external_id &&
                  m.sent_at === newMessage.sent_at &&
                  m.direction === newMessage.direction
              ));
          if (messageExists) return oldData;

              // Adicionar nova mensagem no final (mensagens já vêm ordenadas por sent_at)
              return {
                ...oldData,
                messages: [...existingMessages, newMessage],
                last_message_at: newMessage.sent_at,
              };
            }
          );

          // Verificar se o usuário está próximo do final do scroll (dentro de 300px)
          // Se sim, fazer scroll automático para a nova mensagem
          requestAnimationFrame(() => {
            const scrollContainer = document.querySelector('[data-messages-scroll]') as HTMLElement;
            if (scrollContainer) {
              const { scrollTop, scrollHeight, clientHeight } = scrollContainer;
              const isNearBottom = scrollHeight - scrollTop - clientHeight < 300;
              
              if (isNearBottom) {
                // Scroll automático após garantir que o DOM foi atualizado
                requestAnimationFrame(() => {
                  const messagesEnd = document.querySelector('[data-messages-end]') as HTMLElement;
                  if (messagesEnd) {
                    messagesEnd.scrollIntoView({ behavior: "smooth", block: "end" });
                  }
                });
              }
            }
          });
        }
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "messages",
          filter: `conversation_id=eq.${conversationId}`,
        },
        (payload: { new?: Message }) => {
          const updatedMessage = payload?.new as Message | undefined;
          if (!updatedMessage) return;

          // Atualizar mensagem existente no cache
          queryClient.setQueryData<ConversationDetail>(
            queryKeys.conversation(conversationId),
            (oldData) => {
              if (!oldData) return oldData;
              const existingMessages = Array.isArray(oldData.messages) ? oldData.messages : [];
              const updatedMessages = existingMessages.map((m) =>
                m.id === updatedMessage.id ? { ...m, ...updatedMessage } : m
              );
              return {
                ...oldData,
                messages: updatedMessages,
              };
            }
          );
        }
      )
      .subscribe();

    channelRef.current = channel;

    return () => {
      supabase.removeChannel(channel);
      channelRef.current = null;
      if (scrollCheckTimerRef.current) {
        clearTimeout(scrollCheckTimerRef.current);
      }
    };
  }, [conversationId, queryClient, mounted]);

  if (!mounted) return null;
  return null;
}
