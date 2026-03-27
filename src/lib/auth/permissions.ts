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
    /** Ver contagem de "Novos" (não atribuídos) no sino do header; pode ser desativado por cargo */
    show_new_notifications: "inbox.show_new_notifications",
    /** Ocultar sino de notificações de novos no header (quando marcado, o sino não aparece) */
    hide_new_notifications: "inbox.hide_new_notifications",
    /** Ações no módulo Tickets: ver todos, reatribuir, mudar status (visão Kanban gerencial) */
    manage_tickets: "inbox.manage_tickets",
  },
  // Módulo Tickets (quadro Kanban por status)
  tickets: { view: "tickets.view" },
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
  // Campanhas
  campaigns: { view: "campaigns.view", manage: "campaigns.manage" },
  // Perfil (próprio perfil / link de acesso / foto)
  profile: { view: "profile.view" },
} as const;

export type PermissionKey =
  | (typeof PERMISSIONS)["inbox"][keyof (typeof PERMISSIONS)["inbox"]]
  | (typeof PERMISSIONS)["tickets"][keyof (typeof PERMISSIONS)["tickets"]]
  | (typeof PERMISSIONS)["channels"][keyof (typeof PERMISSIONS)["channels"]]
  | (typeof PERMISSIONS)["queues"][keyof (typeof PERMISSIONS)["queues"]]
  | (typeof PERMISSIONS)["users"][keyof (typeof PERMISSIONS)["users"]]
  | (typeof PERMISSIONS)["reports"][keyof (typeof PERMISSIONS)["reports"]]
  | (typeof PERMISSIONS)["contacts"][keyof (typeof PERMISSIONS)["contacts"]]
  | (typeof PERMISSIONS)["quickreplies"][keyof (typeof PERMISSIONS)["quickreplies"]]
  | (typeof PERMISSIONS)["tags"][keyof (typeof PERMISSIONS)["tags"]]
  | (typeof PERMISSIONS)["campaigns"][keyof (typeof PERMISSIONS)["campaigns"]]
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
  PERMISSIONS.inbox.show_new_notifications,
  PERMISSIONS.inbox.hide_new_notifications,
  PERMISSIONS.inbox.manage_tickets,
  PERMISSIONS.tickets.view,
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
  PERMISSIONS.campaigns.view,
  PERMISSIONS.campaigns.manage,
  PERMISSIONS.profile.view,
];

export function getAllPermissionKeys(): PermissionKey[] {
  return [...ALL_PERMISSION_KEYS];
}

/** Grupos para exibir na UI (Cargo SideOver) — módulos e ações detalhados */
export const PERMISSION_GROUPS: { label: string; keys: PermissionKey[] }[] = [
  {
    label: "Módulo Conversas (acesso e ações no chat)",
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
      PERMISSIONS.inbox.show_new_notifications,
      PERMISSIONS.inbox.hide_new_notifications,
    ],
  },
  {
    label: "Módulo Tickets (quadro Kanban por status)",
    keys: [PERMISSIONS.tickets.view, PERMISSIONS.inbox.manage_tickets],
  },
  {
    label: "Módulo Conexões",
    keys: [PERMISSIONS.channels.view, PERMISSIONS.channels.manage],
  },
  {
    label: "Módulo Filas (caixas de entrada)",
    keys: [PERMISSIONS.queues.view, PERMISSIONS.queues.manage],
  },
  {
    label: "Módulo Cargos e usuários",
    keys: [PERMISSIONS.users.view, PERMISSIONS.users.manage],
  },
  {
    label: "Módulo Relatórios",
    keys: [PERMISSIONS.reports.view, PERMISSIONS.reports.export],
  },
  {
    label: "Módulo Contatos",
    keys: [PERMISSIONS.contacts.view, PERMISSIONS.contacts.manage],
  },
  {
    label: "Módulo Respostas rápidas",
    keys: [PERMISSIONS.quickreplies.view, PERMISSIONS.quickreplies.manage],
  },
  {
    label: "Módulo Tags",
    keys: [PERMISSIONS.tags.view, PERMISSIONS.tags.manage],
  },
  {
    label: "Módulo Campanhas",
    keys: [PERMISSIONS.campaigns.view, PERMISSIONS.campaigns.manage],
  },
  {
    label: "Perfil (próprio perfil da empresa)",
    keys: [PERMISSIONS.profile.view],
  },
];

export const PERMISSION_LABELS: Record<PermissionKey, string> = {
  [PERMISSIONS.inbox.read]: "Acesso: ver conversas e chat",
  [PERMISSIONS.inbox.reply]: "Ação: responder conversas",
  [PERMISSIONS.inbox.transfer]: "Ação: transferir atendimento",
  [PERMISSIONS.inbox.assign]: "Ação: atribuir atendimento a outro agente",
  [PERMISSIONS.inbox.claim]: "Ação: pegar chamado da fila (botão + no card)",
  [PERMISSIONS.inbox.close]: "Ação: encerrar atendimento",
  [PERMISSIONS.inbox.reopen]: "Ação: reabrir conversa",
  [PERMISSIONS.inbox.see_all]: "Ação: ver todas as conversas (todas as caixas)",
  [PERMISSIONS.inbox.export]: "Ação: exportar conversas",
  [PERMISSIONS.inbox.show_new_notifications]: "Ver notificações de novos (sino no header)",
  [PERMISSIONS.inbox.hide_new_notifications]: "Ocultar notificações de novos (sino no header)",
  [PERMISSIONS.inbox.manage_tickets]: "Ações no Tickets: ver todos os tickets, reatribuir, mudar status (arrastar, modal)",
  [PERMISSIONS.tickets.view]: "Acesso: ver módulo Tickets (quadro Kanban por status)",
  [PERMISSIONS.channels.view]: "Acesso: ver Conexões",
  [PERMISSIONS.channels.manage]: "Ação: gerenciar Conexões",
  [PERMISSIONS.queues.view]: "Acesso: ver Filas",
  [PERMISSIONS.queues.manage]: "Ação: gerenciar Filas",
  [PERMISSIONS.users.view]: "Acesso: ver Cargos e usuários",
  [PERMISSIONS.users.manage]: "Ação: gerenciar Cargos e usuários",
  [PERMISSIONS.reports.view]: "Acesso: ver Relatórios",
  [PERMISSIONS.reports.export]: "Ação: exportar Relatórios",
  [PERMISSIONS.contacts.view]: "Acesso: ver Contatos",
  [PERMISSIONS.contacts.manage]: "Ação: gerenciar Contatos",
  [PERMISSIONS.quickreplies.view]: "Acesso: ver Respostas rápidas",
  [PERMISSIONS.quickreplies.manage]: "Ação: gerenciar Respostas rápidas",
  [PERMISSIONS.tags.view]: "Acesso: ver Tags",
  [PERMISSIONS.tags.manage]: "Ação: gerenciar Tags",
  [PERMISSIONS.campaigns.view]: "Acesso: ver Campanhas",
  [PERMISSIONS.campaigns.manage]: "Ação: gerenciar Campanhas",
  [PERMISSIONS.profile.view]: "Acesso: ver Perfil (próprio perfil, link de acesso, foto)",
};

export function hasPermission(permissions: string[] | null | undefined, key: PermissionKey): boolean {
  if (!Array.isArray(permissions)) return false;
  return permissions.includes(key);
}
