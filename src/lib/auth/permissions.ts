/**
 * Permissões da plataforma por cargo.
 * Vários níveis para criar cargos com liberdade (operacionais + gestão).
 */
export const PERMISSIONS = {
  // Atendimento / Conversas
  inbox: {
    read: "inbox.read",
    reply: "inbox.reply",
    transfer: "inbox.transfer",
    assign: "inbox.assign",
    claim: "inbox.claim",
    close: "inbox.close",
    reopen: "inbox.reopen",
    see_all: "inbox.see_all",
    export: "inbox.export",
    /** Owner/Admin: ver todos os tickets, quem atende, data, mudar status e reatribuir (visão Kanban gerencial) */
    manage_tickets: "inbox.manage_tickets",
  },
  // Conexões
  channels: { view: "channels.view", manage: "channels.manage" },
  // Filas
  queues: { view: "queues.view", manage: "queues.manage" },
  // Cargos e usuários
  users: { view: "users.view", manage: "users.manage" },
  // Relatórios
  reports: { view: "reports.view", export: "reports.export" },
  // Contatos
  contacts: { view: "contacts.view", manage: "contacts.manage" },
  // Respostas rápidas
  quickreplies: { view: "quickreplies.view", manage: "quickreplies.manage" },
  // Tags
  tags: { view: "tags.view", manage: "tags.manage" },
  // Perfil (próprio perfil / link de acesso / foto)
  profile: { view: "profile.view" },
} as const;

export type PermissionKey =
  | (typeof PERMISSIONS)["inbox"][keyof (typeof PERMISSIONS)["inbox"]]
  | (typeof PERMISSIONS)["channels"][keyof (typeof PERMISSIONS)["channels"]]
  | (typeof PERMISSIONS)["queues"][keyof (typeof PERMISSIONS)["queues"]]
  | (typeof PERMISSIONS)["users"][keyof (typeof PERMISSIONS)["users"]]
  | (typeof PERMISSIONS)["reports"][keyof (typeof PERMISSIONS)["reports"]]
  | (typeof PERMISSIONS)["contacts"][keyof (typeof PERMISSIONS)["contacts"]]
  | (typeof PERMISSIONS)["quickreplies"][keyof (typeof PERMISSIONS)["quickreplies"]]
  | (typeof PERMISSIONS)["tags"][keyof (typeof PERMISSIONS)["tags"]]
  | (typeof PERMISSIONS)["profile"][keyof (typeof PERMISSIONS)["profile"]];

const ALL_PERMISSION_KEYS: PermissionKey[] = [
  PERMISSIONS.inbox.read,
  PERMISSIONS.inbox.reply,
  PERMISSIONS.inbox.transfer,
  PERMISSIONS.inbox.assign,
  PERMISSIONS.inbox.claim,
  PERMISSIONS.inbox.close,
  PERMISSIONS.inbox.reopen,
  PERMISSIONS.inbox.see_all,
  PERMISSIONS.inbox.export,
  PERMISSIONS.inbox.manage_tickets,
  PERMISSIONS.channels.view,
  PERMISSIONS.channels.manage,
  PERMISSIONS.queues.view,
  PERMISSIONS.queues.manage,
  PERMISSIONS.users.view,
  PERMISSIONS.users.manage,
  PERMISSIONS.reports.view,
  PERMISSIONS.reports.export,
  PERMISSIONS.contacts.view,
  PERMISSIONS.contacts.manage,
  PERMISSIONS.quickreplies.view,
  PERMISSIONS.quickreplies.manage,
  PERMISSIONS.tags.view,
  PERMISSIONS.tags.manage,
  PERMISSIONS.profile.view,
];

export function getAllPermissionKeys(): PermissionKey[] {
  return [...ALL_PERMISSION_KEYS];
}

/** Grupos para exibir na UI (Cargo SideOver) */
export const PERMISSION_GROUPS: { label: string; keys: PermissionKey[] }[] = [
  {
    label: "Atendimento / Conversas",
    keys: [
      PERMISSIONS.inbox.read,
      PERMISSIONS.inbox.reply,
      PERMISSIONS.inbox.claim,
      PERMISSIONS.inbox.transfer,
      PERMISSIONS.inbox.assign,
      PERMISSIONS.inbox.close,
      PERMISSIONS.inbox.reopen,
      PERMISSIONS.inbox.see_all,
      PERMISSIONS.inbox.export,
      PERMISSIONS.inbox.manage_tickets,
    ],
  },
  { label: "Conexões", keys: [PERMISSIONS.channels.view, PERMISSIONS.channels.manage] },
  { label: "Filas", keys: [PERMISSIONS.queues.view, PERMISSIONS.queues.manage] },
  { label: "Cargos e usuários", keys: [PERMISSIONS.users.view, PERMISSIONS.users.manage] },
  { label: "Relatórios", keys: [PERMISSIONS.reports.view, PERMISSIONS.reports.export] },
  { label: "Contatos", keys: [PERMISSIONS.contacts.view, PERMISSIONS.contacts.manage] },
  { label: "Respostas rápidas", keys: [PERMISSIONS.quickreplies.view, PERMISSIONS.quickreplies.manage] },
  { label: "Tags", keys: [PERMISSIONS.tags.view, PERMISSIONS.tags.manage] },
  { label: "Perfil", keys: [PERMISSIONS.profile.view] },
];

export const PERMISSION_LABELS: Record<PermissionKey, string> = {
  [PERMISSIONS.inbox.read]: "Ver conversas",
  [PERMISSIONS.inbox.reply]: "Responder conversas",
  [PERMISSIONS.inbox.transfer]: "Transferir atendimento",
  [PERMISSIONS.inbox.assign]: "Atribuir atendimento",
  [PERMISSIONS.inbox.claim]: "Pegar chamado da fila (atender)",
  [PERMISSIONS.inbox.close]: "Encerrar atendimento",
  [PERMISSIONS.inbox.reopen]: "Reabrir conversa",
  [PERMISSIONS.inbox.see_all]: "Ver todas as conversas (todas as caixas)",
  [PERMISSIONS.inbox.export]: "Exportar conversas",
  [PERMISSIONS.inbox.manage_tickets]: "Visão gerencial: ver todos os tickets, quem atende, data, mudar status e reatribuir",
  [PERMISSIONS.channels.view]: "Ver Conexões",
  [PERMISSIONS.channels.manage]: "Gerenciar Conexões",
  [PERMISSIONS.queues.view]: "Ver Filas",
  [PERMISSIONS.queues.manage]: "Gerenciar Filas",
  [PERMISSIONS.users.view]: "Ver Cargos e usuários",
  [PERMISSIONS.users.manage]: "Gerenciar Cargos e usuários",
  [PERMISSIONS.reports.view]: "Ver relatórios",
  [PERMISSIONS.reports.export]: "Exportar relatórios",
  [PERMISSIONS.contacts.view]: "Ver Contatos",
  [PERMISSIONS.contacts.manage]: "Gerenciar Contatos",
  [PERMISSIONS.quickreplies.view]: "Ver Respostas rápidas",
  [PERMISSIONS.quickreplies.manage]: "Gerenciar Respostas rápidas",
  [PERMISSIONS.tags.view]: "Ver Tags",
  [PERMISSIONS.tags.manage]: "Gerenciar Tags",
  [PERMISSIONS.profile.view]: "Ver Perfil (próprio perfil, link de acesso, foto)",
};

export function hasPermission(permissions: string[] | null | undefined, key: PermissionKey): boolean {
  if (!Array.isArray(permissions)) return false;
  return permissions.includes(key);
}
