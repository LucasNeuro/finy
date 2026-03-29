/**
 * Mensagens claras para o painel quando chat/completions da Mistral retorna erro.
 */
export function mapAiHttpError(status: number, bodyText: string): string {
  let detail = "";
  try {
    const j = JSON.parse(bodyText) as {
      error?: { message?: string };
      message?: string;
      detail?: unknown;
    };
    const d = j?.detail;
    if (typeof d === "string") detail = d;
    else if (Array.isArray(d) && d[0] && typeof (d[0] as { msg?: string }).msg === "string")
      detail = (d[0] as { msg: string }).msg;
    if (!detail && typeof j?.error?.message === "string") detail = j.error.message;
    if (!detail && typeof j?.message === "string") detail = j.message;
  } catch {
    /* ignore */
  }

  if (status === 401 || status === 403) {
    return (
      "A Mistral recusou a chave (não autorizado). Confira AI_API_KEY ou MISTRAL_API_KEY e se AI_BASE_URL é " +
      "https://api.mistral.ai/v1. Chaves em console.mistral.ai. Reinicie o servidor após alterar o .env."
    );
  }
  if (status === 429) {
    return "Limite de uso da API de IA atingido. Aguarde alguns minutos e tente de novo.";
  }
  if (status === 404 && /model|not found/i.test(detail + bodyText)) {
    return "Modelo não encontrado na Mistral. Ajuste AI_MODEL ou MISTRAL_MODEL no .env (ex.: mistral-small-latest, ministral-3b-latest).";
  }
  if (status >= 500) {
    return "Copiloto temporariamente indisponível (erro no provedor de IA). Tente de novo em instantes.";
  }
  if (detail && detail.length < 280) {
    return `IA: ${detail}`;
  }
  return "Copiloto temporariamente indisponível. Tente de novo em instantes.";
}
