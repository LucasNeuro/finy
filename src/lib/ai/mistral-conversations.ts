/**
 * Mistral Agents & Conversations API (REST).
 * @see https://docs.mistral.ai/capabilities/agents/agents
 * @see https://docs.mistral.ai/api/endpoint/beta/agents — POST /v1/agents
 */

function extractAssistantReply(data: {
  outputs?: Array<{ content?: string; type?: string; role?: string }>;
}): string {
  const outs = data.outputs ?? [];
  for (let i = outs.length - 1; i >= 0; i--) {
    const o = outs[i];
    if (typeof o.content !== "string" || !o.content.trim()) continue;
    if (o.role === "assistant" || o.type === "message.output") return o.content.trim();
  }
  for (let i = outs.length - 1; i >= 0; i--) {
    const c = outs[i]?.content;
    if (typeof c === "string" && c.trim()) return c.trim();
  }
  return "";
}

export type MistralConvResult = {
  conversationId: string;
  reply: string;
};

/**
 * Garante base com sufixo /v1 para rotas documentadas (/v1/agents, /v1/conversations).
 * Se AI_BASE_URL for só https://api.mistral.ai (sem /v1), o fetch ia para /agents e falhava.
 */
export function mistralApiV1Base(baseUrl: string): string {
  const trimmed = baseUrl.replace(/\/+$/, "");
  if (/\/v1$/i.test(trimmed)) return trimmed;
  try {
    const u = new URL(trimmed);
    if (u.hostname === "api.mistral.ai") {
      const path = (u.pathname || "/").replace(/\/+$/, "") || "/";
      if (path === "/") return `${u.origin}/v1`;
    }
  } catch {
    /* base relativa ou inválida: usar como veio */
  }
  return trimmed;
}

type MistralErrJson = { detail?: unknown; message?: string };

function mistralErrorRaw(data: MistralErrJson, status: number): string {
  let raw =
    typeof data.detail === "string"
      ? data.detail
      : typeof data.message === "string"
        ? data.message
        : `HTTP ${status}`;
  if (Array.isArray(data.detail) && data.detail.length > 0) {
    const first = data.detail[0] as { msg?: string; message?: string };
    const piece =
      typeof first?.msg === "string" ? first.msg : typeof first?.message === "string" ? first.message : "";
    if (piece) raw = piece;
  }
  return raw;
}

function throwMistralHttpError(res: Response, data: MistralErrJson, endpointHint: string): never {
  const raw = mistralErrorRaw(data, res.status);
  if (res.status === 401 || res.status === 403 || /unauthorized/i.test(raw)) {
    const fromApi = raw && raw !== `HTTP ${res.status}` ? ` Detalhe da API: ${raw}` : "";
    throw new Error(
      `Chave Mistral recusada (${endpointHint}). Defina uma chave válida em AI_API_KEY ou MISTRAL_API_KEY no .env ou .env.local (sem aspas), reinicie o servidor e confira com npm run test:mistral.${fromApi}`
    );
  }
  throw new Error(raw);
}

export async function mistralConversationStart(params: {
  apiKey: string;
  baseUrl: string;
  agentId: string;
  agentVersion?: number;
  userContent: string;
}): Promise<MistralConvResult> {
  const base = mistralApiV1Base(params.baseUrl);
  const body: Record<string, unknown> = {
    inputs: [
      {
        role: "user",
        content: params.userContent,
        object: "entry",
        type: "message.input",
      },
    ],
    stream: false,
    agent_id: params.agentId,
    store: true,
  };
  if (typeof params.agentVersion === "number") body.agent_version = params.agentVersion;

  const res = await fetch(`${base}/conversations`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${params.apiKey}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(body),
  });
  const data = (await res.json().catch(() => ({}))) as {
    conversation_id?: string;
    outputs?: Array<{ content?: string; type?: string; role?: string }>;
    detail?: unknown;
    message?: string;
  };
  if (!res.ok) {
    throwMistralHttpError(res, data, "conversas do copiloto — POST /v1/conversations");
  }
  const cid = data.conversation_id;
  if (!cid || typeof cid !== "string") throw new Error("Resposta sem conversation_id");
  const reply = extractAssistantReply(data);
  return { conversationId: cid, reply };
}

export async function mistralConversationAppend(params: {
  apiKey: string;
  baseUrl: string;
  conversationId: string;
  userContent: string;
}): Promise<MistralConvResult> {
  const base = mistralApiV1Base(params.baseUrl);
  const res = await fetch(`${base}/conversations/${encodeURIComponent(params.conversationId)}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${params.apiKey}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      inputs: params.userContent,
      stream: false,
      store: true,
    }),
  });
  const data = (await res.json().catch(() => ({}))) as {
    conversation_id?: string;
    outputs?: Array<{ content?: string; type?: string; role?: string }>;
    detail?: unknown;
    message?: string;
  };
  if (!res.ok) {
    throwMistralHttpError(res, data, "continuar conversa — POST /v1/conversations/{id}");
  }
  const cid = typeof data.conversation_id === "string" ? data.conversation_id : params.conversationId;
  const reply = extractAssistantReply(data);
  return { conversationId: cid, reply };
}

export async function mistralAgentCreate(params: {
  apiKey: string;
  baseUrl: string;
  name: string;
  description: string;
  instructions?: string;
  model: string;
}): Promise<{ id: string; version?: number }> {
  const base = mistralApiV1Base(params.baseUrl);
  const body: Record<string, unknown> = {
    model: params.model,
    name: params.name,
    description: params.description,
  };
  if (params.instructions?.trim()) body.instructions = params.instructions.trim();

  const res = await fetch(`${base}/agents`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${params.apiKey}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(body),
  });
  const data = (await res.json().catch(() => ({}))) as {
    id?: string;
    version?: number;
    detail?: unknown;
    message?: string;
  };
  if (!res.ok) {
    const raw = mistralErrorRaw(data, res.status);
    if (res.status === 401 || /unauthorized/i.test(raw)) {
      const fromApi = raw && raw !== `HTTP ${res.status}` ? ` Resposta da API: ${raw}` : "";
      throw new Error(
        "Chave Mistral recusada (401) no POST /v1/agents (ver documentação: Agents & Conversations). " +
          "Confira AI_API_KEY / MISTRAL_API_KEY em console.mistral.ai → API keys, sem aspas no .env; use AI_BASE_URL=https://api.mistral.ai/v1 ou deixe em branco." +
          fromApi
      );
    }
    throw new Error(raw);
  }
  if (!data.id || typeof data.id !== "string") throw new Error("Resposta sem id do agente");
  return { id: data.id, version: typeof data.version === "number" ? data.version : undefined };
}
