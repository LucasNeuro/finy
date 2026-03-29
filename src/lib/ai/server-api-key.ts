function cleanKey(s: string | undefined): string {
  let t = (s?.trim() || "").replace(/\r?\n/g, "").replace(/^\uFEFF/, "");
  if ((t.startsWith('"') && t.endsWith('"')) || (t.startsWith("'") && t.endsWith("'"))) {
    t = t.slice(1, -1).trim();
  }
  return t;
}

/**
 * Chave Mistral para chat/completions e rotas de IA (AI_BASE_URL padrão: api.mistral.ai).
 * Ordem: AI_API_KEY, MISTRAL_API_KEY, typo legado MISTARL_API_KEY.
 */
export function getServerAiApiKey(): string {
  return (
    cleanKey(process.env.AI_API_KEY) ||
    cleanKey(process.env.MISTRAL_API_KEY) ||
    cleanKey(process.env.MISTARL_API_KEY) ||
    ""
  );
}

export const SERVER_AI_KEY_ENV_HINT =
  "Defina AI_API_KEY ou MISTRAL_API_KEY no .env (chave em console.mistral.ai). " +
  "AI_BASE_URL deve ser https://api.mistral.ai/v1 (ou omita para usar o padrão). Reinicie o servidor após alterar.";

/** true quando o chat do app está configurado para Mistral (URL vazia = padrão api.mistral.ai nas rotas). */
function chatTargetIsMistral(): boolean {
  const base = (process.env.AI_BASE_URL || process.env.MISTRAL_BASE_URL || "").toLowerCase();
  if (!base) return true;
  return base.includes("mistral") || base.includes("api.mistral.ai");
}

/**
 * Chave para API de plataforma Mistral (POST /v1/agents).
 * Deve coincidir com a chave usada no chat quando o alvo é Mistral:
 * mesma ordem que getServerAiApiKey (AI_API_KEY primeiro), depois MISTRAL_*.
 * Evita 401 ao criar agente com MISTRAL_API_KEY antiga e AI_API_KEY válida.
 * Se AI_BASE_URL apontar para outro provedor, usa só MISTRAL_API_KEY / typo para não misturar chaves.
 */
export function getMistralPlatformApiKey(): string {
  const mistralNamed = cleanKey(process.env.MISTRAL_API_KEY) || cleanKey(process.env.MISTARL_API_KEY);
  const aiKey = cleanKey(process.env.AI_API_KEY);

  if (chatTargetIsMistral()) {
    return aiKey || mistralNamed || "";
  }

  return mistralNamed || "";
}

export const MISTRAL_PLATFORM_KEY_HINT =
  "Defina AI_API_KEY ou MISTRAL_API_KEY no .env (console.mistral.ai → API keys). " +
  "Se ambas existirem, o app usa AI_API_KEY primeiro quando o chat aponta para Mistral — remova ou atualize MISTRAL_API_KEY se estiver desatualizada. " +
  "Reinicie o servidor após alterar.";

/** Só para diagnóstico em dev (nunca expor o valor da chave). */
export function getCopilotMistralKeyDiagnostics(): {
  chatTargetIsMistral: boolean;
  platformKeySource: "AI_API_KEY" | "MISTRAL_API_KEY" | "MISTARL_API_KEY" | "none";
} {
  const aiKey = cleanKey(process.env.AI_API_KEY);
  const mk = cleanKey(process.env.MISTRAL_API_KEY);
  const typo = cleanKey(process.env.MISTARL_API_KEY);

  if (chatTargetIsMistral()) {
    if (aiKey) return { chatTargetIsMistral: true, platformKeySource: "AI_API_KEY" };
    if (mk) return { chatTargetIsMistral: true, platformKeySource: "MISTRAL_API_KEY" };
    if (typo) return { chatTargetIsMistral: true, platformKeySource: "MISTARL_API_KEY" };
    return { chatTargetIsMistral: true, platformKeySource: "none" };
  }
  if (mk) return { chatTargetIsMistral: false, platformKeySource: "MISTRAL_API_KEY" };
  if (typo) return { chatTargetIsMistral: false, platformKeySource: "MISTARL_API_KEY" };
  return { chatTargetIsMistral: false, platformKeySource: "none" };
}
