/**
 * Módulos contratáveis por empresa (`companies.enabled_modules`).
 * Chaves ausentes no JSON são preenchidas com true ao normalizar (exceto se quisermos alterar no futuro).
 */

export const DEFAULT_ENABLED_MODULES: Record<string, boolean> = {
  crm: true,
  tags: true,
  filas: true,
  perfil: true,
  tickets: true,
  conexoes: true,
  contatos: true,
  conversas: true,
  super_admin: true,
  multicalculo: true,
  cargos_usuarios: true,
  respostas_rapidas: true,
  campanhas: true,
  copilot: true,
};

/** Rótulos para o Super Admin (ordem de exibição). */
export const COMPANY_MODULE_LABELS: { key: string; label: string; description?: string }[] = [
  { key: "conversas", label: "Conversas", description: "Inbox e chats" },
  { key: "tickets", label: "Tickets", description: "Kanban / tickets" },
  { key: "conexoes", label: "Conexões", description: "WhatsApp / canais" },
  { key: "filas", label: "Filas", description: "Filas de atendimento" },
  { key: "crm", label: "CRM", description: "CRM comercial" },
  { key: "contatos", label: "Contatos", description: "Lista de contatos" },
  { key: "respostas_rapidas", label: "Respostas rápidas", description: "Atalhos de mensagem" },
  { key: "tags", label: "Tags", description: "Tags e formulários" },
  { key: "campanhas", label: "Campanhas", description: "Disparos em massa" },
  { key: "cargos_usuarios", label: "Cargos e usuários", description: "Equipe e permissões" },
  { key: "copilot", label: "Copiloto", description: "Assistente IA (Mistral)" },
  { key: "perfil", label: "Perfil", description: "Dados da empresa e usuário" },
  { key: "super_admin", label: "Super Admin (tenant)", description: "Aba interna na empresa (quem tem acesso de plataforma)" },
];

export function normalizeEnabledModules(raw: unknown): Record<string, boolean> {
  const out = { ...DEFAULT_ENABLED_MODULES };
  if (raw != null && typeof raw === "object" && !Array.isArray(raw)) {
    const o = raw as Record<string, unknown>;
    for (const key of Object.keys(out)) {
      if (key in o) out[key] = o[key] !== false;
    }
  }
  return out;
}

export function mergeEnabledModulesPatch(
  current: Record<string, boolean>,
  patch: Record<string, boolean>
): Record<string, boolean> {
  return { ...current, ...patch };
}
