"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { useQueryClient, useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { queryKeys } from "@/lib/query-keys";

/**
 * Escuta mudanças na tabela conversations via Supabase Realtime e invalida
 * lista e contagens para a lista/badges atualizarem sem recarregar.
 * Só ativo quando há slug e company_id (vindo das permissions).
 *
 * No Supabase: ative a replicação da tabela `conversations` em
 * Database > Replication para que postgres_changes funcione.
 */
export function RealtimeConversations() {
  const pathname = usePathname();
  const queryClient = useQueryClient();
  const slug = pathname?.split("/").filter(Boolean)[0] ?? "";
  const apiHeaders = slug ? { "X-Company-Slug": slug } : undefined;

  const { data: permissionsData } = useQuery({
    queryKey: queryKeys.permissions(slug),
    queryFn: () =>
      fetch("/api/auth/permissions", { credentials: "include", headers: apiHeaders }).then((r) => r.json()),
    enabled: !!slug,
    staleTime: 5 * 60 * 1000,
  });

  const companyId = (permissionsData as { company_id?: string } | undefined)?.company_id ?? null;
  const channelRef = useRef<ReturnType<ReturnType<typeof createClient>["channel"]> | null>(null);

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
        () => {
          queryClient.invalidateQueries({ queryKey: queryKeys.conversationListInfinite(slug, "queues") });
          queryClient.invalidateQueries({ queryKey: queryKeys.conversationListInfinite(slug, "mine") });
          queryClient.invalidateQueries({ queryKey: queryKeys.counts(slug) });
          queryClient.invalidateQueries({ queryKey: ["tickets", "list"] });
        }
      )
      .subscribe();

    channelRef.current = channel;

    return () => {
      supabase.removeChannel(channel);
      channelRef.current = null;
    };
  }, [slug, companyId, queryClient]);

  return null;
}
