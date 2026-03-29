import { mistralApiV1Base } from "@/lib/ai/mistral-conversations";

type ChatMsg = { role: "system" | "user" | "assistant"; content: string };

function parseErr(data: { detail?: unknown; message?: string }, status: number): string {
  if (typeof data.detail === "string") return data.detail;
  if (typeof data.message === "string") return data.message;
  return `HTTP ${status}`;
}

/**
 * Uma chamada a POST /v1/chat/completions (mesma chave que correct-text / test:mistral).
 */
export async function mistralChatCompletion(params: {
  apiKey: string;
  baseUrl: string;
  model: string;
  messages: ChatMsg[];
  maxTokens?: number;
  temperature?: number;
}): Promise<string> {
  const base = mistralApiV1Base(params.baseUrl);
  const res = await fetch(`${base}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${params.apiKey}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      model: params.model.trim(),
      messages: params.messages,
      max_tokens: params.maxTokens ?? 2048,
      temperature: params.temperature ?? 0.4,
    }),
  });
  const data = (await res.json().catch(() => ({}))) as {
    choices?: Array<{ message?: { content?: string } }>;
    detail?: unknown;
    message?: string;
  };
  if (!res.ok) {
    const raw = parseErr(data, res.status);
    if (res.status === 401 || res.status === 403 || /unauthorized/i.test(raw)) {
      throw new Error(
        `Chave Mistral recusada (chat completions). Detalhe: ${raw}. ` +
          `Não precisa “trocar de chave em ciclo”: use uma chave válida de console.mistral.ai uma vez. ` +
          `Se existirem AI_API_KEY e MISTRAL_API_KEY, o servidor usa sempre AI_API_KEY primeiro — apague a linha errada ou deixe só uma. ` +
          `Reinicie o npm run dev após editar o .env. Teste: npm run test:mistral.`
      );
    }
    throw new Error(raw);
  }
  const text = data?.choices?.[0]?.message?.content?.trim() ?? "";
  return text || "(sem texto)";
}
