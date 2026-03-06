"use client";

import { SWRConfig } from "swr";

type Props = {
  children: React.ReactNode;
  /** Fallback pré-buscado no Server Component (layout). Chaves serializadas com unstable_serialize. */
  fallback?: Record<string, unknown>;
};

/**
 * Envolve a árvore com SWRConfig para que os Client Components
 * recebam os dados já pré-buscados no servidor (sem loading inicial).
 */
export function SWRProviderWithPrefetch({ children, fallback }: Props) {
  return (
    <SWRConfig value={{ fallback: fallback ?? {} }}>
      {children}
    </SWRConfig>
  );
}
