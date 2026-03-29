"use client";

import {
  isServer,
  QueryClient,
  QueryClientProvider,
} from "@tanstack/react-query";
import { useEffect } from "react";
import { queryKeys } from "@/lib/query-keys";

function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 90 * 1000,
        gcTime: 10 * 60 * 1000,
        retry: 2,
        retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 10000),
        refetchOnWindowFocus: false,
      },
    },
  });
}

let browserQueryClient: QueryClient | undefined;

/** SSR: novo cliente por render. Cliente: um singleton (evita useRef + dispatcher nulo no RSC). */
function getQueryClient() {
  if (isServer) {
    return makeQueryClient();
  }
  if (!browserQueryClient) {
    browserQueryClient = makeQueryClient();
  }
  return browserQueryClient;
}

type InitialData = {
  slug: string;
  permissions?: Record<string, unknown>;
  counts?: Record<string, unknown>;
  queues?: { id: string; name: string }[];
};

type Props = {
  children: React.ReactNode;
  /** Dados pré-buscados no servidor (layout) para primeiro paint rápido */
  initialData?: InitialData | null;
};

export function QueryProvider({ children, initialData }: Props) {
  const queryClient = getQueryClient();

  useEffect(() => {
    if (!initialData?.slug) return;
    if (initialData.permissions != null) {
      queryClient.setQueryData(queryKeys.permissions(initialData.slug), initialData.permissions);
    }
    if (initialData.counts != null) {
      queryClient.setQueryData(queryKeys.counts(initialData.slug), initialData.counts);
    }
    if (initialData.queues != null) {
      queryClient.setQueryData(queryKeys.queues(initialData.slug), initialData.queues);
    }
  }, [initialData?.slug, initialData?.permissions, initialData?.counts, initialData?.queues, queryClient]);

  return (
    <QueryClientProvider client={queryClient}>
      {children}
    </QueryClientProvider>
  );
}
