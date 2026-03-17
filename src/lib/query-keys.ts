/**
 * Chaves centralizadas para TanStack Query (inbox).
 * Evita duplicação de requests e permite invalidação precisa.
 */
export const queryKeys = {
  permissions: (slug: string) => ["inbox", "permissions", slug] as const,
  counts: (slug: string) => ["inbox", "counts", slug] as const,
  conversationListInfinite: (slug: string, viewMode: "mine" | "queues" | "unassigned" | "mine_closed") =>
    ["inbox", "conversations", slug, viewMode] as const,
  conversation: (id: string) => ["inbox", "conversation", id] as const,
  contacts: (slug: string) => ["inbox", "contacts", slug] as const,
  groups: (slug: string) => ["inbox", "groups", slug] as const,
  broadcastQueue: (slug: string, status?: string) =>
    ["inbox", "broadcast-queue", slug, status ?? "pending"] as const,
  broadcastPipelines: (slug: string) => ["inbox", "broadcast-pipelines", slug] as const,
  roles: (slug: string) => ["inbox", "roles", slug] as const,
  // Tickets
  queues: (slug: string) => ["tickets", "queues", slug] as const,
  ticketStatuses: (slug: string, queueId?: string) =>
    ["tickets", "statuses", slug, queueId ?? "all"] as const,
  ticketsList: (slug: string, queueId: string, onlyMine: boolean) =>
    ["tickets", "list", slug, queueId, onlyMine ? "mine" : "all"] as const,
};
