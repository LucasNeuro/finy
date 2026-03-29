import { getCompanyIdFromRequest } from "@/lib/auth/get-company";
import { getServerAiApiKey, SERVER_AI_KEY_ENV_HINT } from "@/lib/ai/server-api-key";
import { NextResponse } from "next/server";

// Mistral Chat Completions: https://api.mistral.ai/v1/chat/completions
// Auth: Authorization: Bearer <MISTRAL_API_KEY>
const AI_BASE_URL =
  process.env.AI_BASE_URL?.replace(/\/+$/, "") ||
  process.env.MISTRAL_BASE_URL?.replace(/\/+$/, "") ||
  "https://api.mistral.ai/v1";
const AI_COMPLETIONS_URL = `${AI_BASE_URL}/chat/completions`;
const DEFAULT_AI_MODEL = "mistral-small-latest";

export async function POST(request: Request) {
  const companyId = await getCompanyIdFromRequest(request);
  if (!companyId) {
    return NextResponse.json(
      { error: "Não autorizado. Verifique se está logado e com a empresa selecionada." },
      { status: 401 }
    );
  }

  const apiKey = getServerAiApiKey();
  const isLocal = AI_BASE_URL.includes("localhost") || AI_BASE_URL.includes("127.0.0.1");

  if (!apiKey && !isLocal) {
    return NextResponse.json({ error: SERVER_AI_KEY_ENV_HINT }, { status: 503 });
  }

  let body: { titulo?: string; text?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const titulo = typeof body?.titulo === "string" ? body.titulo.trim() : "";
  const text = typeof body?.text === "string" ? body.text.trim() : "";

  if (!text) {
    return NextResponse.json(
      { error: "Texto vazio. Cole ou digite o texto da mensagem." },
      { status: 400 }
    );
  }

  const systemContent = `Você é um copywriter especializado em mensagens para WhatsApp e campanhas de marketing.
Sua tarefa é sugerir melhorias no texto da mensagem com base no título/contexto fornecido.
O idioma alvo é português brasileiro.
Mantenha tom profissional, claro e adequado ao contexto.
Use formatação WhatsApp quando apropriado: *negrito*, _itálico_.
Retorne APENAS o texto melhorado, sem explicações, sem aspas extras.`;

  const userParts: string[] = [
    "Texto original da mensagem:",
    `"${text}"`,
  ];
  if (titulo) {
    userParts.unshift(`Título/contexto da mensagem: "${titulo}"`, "");
  }
  userParts.push("", "Texto melhorado:");

  const userContent = userParts.join("\n");

  const model =
    process.env.AI_MODEL?.trim() || process.env.MISTRAL_MODEL?.trim() || DEFAULT_AI_MODEL;

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: "application/json",
  };
  if (apiKey) {
    headers.Authorization = `Bearer ${apiKey}`;
  }

  const payload = {
    model,
    messages: [
      { role: "system", content: systemContent },
      { role: "user", content: userContent },
    ],
    max_tokens: 1024,
    temperature: 0.4,
  };

  /** Mensagem genérica para o usuário — nunca expor detalhes técnicos em produção */
  const USER_FRIENDLY_ERROR =
    "Sugestão temporariamente indisponível. Você pode editar o texto manualmente.";

  async function doFetch(): Promise<Response> {
    return fetch(AI_COMPLETIONS_URL, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
    });
  }

  try {
    let res = await doFetch();

    // Retry uma vez em erros transitórios (5xx, timeout, rede)
    if (!res.ok && res.status >= 500) {
      await new Promise((r) => setTimeout(r, 800));
      res = await doFetch();
    }

    if (!res.ok) {
      const errText = await res.text();
      const errJson = await (async () => {
        try {
          return JSON.parse(errText);
        } catch {
          return null;
        }
      })();
      const detail = errJson?.detail ?? errJson?.message ?? errJson?.error ?? errJson?.msg;
      const detailStr = typeof detail === "string" ? detail : JSON.stringify(detail ?? errText);
      // Log técnico apenas no servidor (para debug)
      if (process.env.NODE_ENV === "development") {
        console.error("[suggest-message] Mistral API error:", res.status, detailStr?.slice(0, 200));
        if (res.status === 401) {
          console.error(
            "[suggest-message] 401 = chave inválida ou expirada. Gere nova em console.mistral.ai e atualize MISTRAL_API_KEY no .env. Depois: npm run test:mistral"
          );
        }
      }
      return NextResponse.json(
        { error: USER_FRIENDLY_ERROR },
        { status: res.status >= 500 ? 502 : 400 }
      );
    }

    const data = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const suggested = data?.choices?.[0]?.message?.content?.trim() ?? "";

    const cleanSuggested = suggested.replace(/^"|"$/g, "");

    return NextResponse.json({ suggested: cleanSuggested });
  } catch (e) {
    if (process.env.NODE_ENV === "development") {
      console.error("[suggest-message] Fetch error:", e instanceof Error ? e.message : e);
    }
    return NextResponse.json(
      { error: USER_FRIENDLY_ERROR },
      { status: 502 }
    );
  }
}
