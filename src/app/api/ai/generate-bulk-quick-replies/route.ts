import { getCompanyIdFromRequest } from "@/lib/auth/get-company";
import { NextResponse } from "next/server";

const AI_BASE_URL = process.env.AI_BASE_URL?.replace(/\/+$/, "") || "https://api.mistral.ai/v1";
const AI_COMPLETIONS_URL = `${AI_BASE_URL}/chat/completions`;
const DEFAULT_AI_MODEL = "ministral-3b-latest";
const MAX_QUICK_REPLY_LENGTH = 400;

/**
 * POST /api/ai/generate-bulk-quick-replies
 * Gera várias sugestões de respostas rápidas a partir de uma ideia (ex.: "saudação, estoque, horário de atendimento").
 * Body: { idea: string, count?: number }
 * Retorna: { suggestions: { shortCut: string, type: string, text: string }[] }
 */
export async function POST(request: Request) {
  const companyId = await getCompanyIdFromRequest(request);
  if (!companyId) {
    return NextResponse.json(
      { error: "Não autorizado. Verifique se está logado e com a empresa selecionada." },
      { status: 401 }
    );
  }

  const apiKey =
    process.env.AI_API_KEY?.trim() ||
    process.env.MISTRAL_API_KEY?.trim() ||
    process.env.MISTARL_API_KEY?.trim();
  // Se for OpenAI-compatible local (ex: Ollama), pode não precisar de chave, mas vamos avisar se não tiver nenhuma configurada e não for localhost
  const isLocal = AI_BASE_URL.includes("localhost") || AI_BASE_URL.includes("127.0.0.1");
  
  if (!apiKey && !isLocal) {
    return NextResponse.json(
      {
        error:
          "AI_API_KEY ou MISTRAL_API_KEY não configurada. Adicione no .env e reinicie o servidor.",
      },
      { status: 503 }
    );
  }

  let body: { idea?: string; count?: number };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const idea = typeof body?.idea === "string" ? body.idea.trim() : "";
  const count = typeof body?.count === "number" && body.count >= 1 && body.count <= 15
    ? Math.floor(body.count)
    : 5;

  if (!idea) {
    return NextResponse.json(
      { error: "Envie 'idea' com a descrição das respostas que deseja (ex.: saudação, estoque, horário de atendimento)." },
      { status: 400 }
    );
  }

  const systemContent = `You are a helpful assistant that generates JSON only.

# Task
Generate a JSON array of quick reply suggestions for WhatsApp based on the user's idea.

# Rules
- Output MUST be a valid JSON array.
- DO NOT write any text before or after the JSON array.
- No markdown formatting (no \`\`\`json blocks).
- Keys must be exactly: "atalho" (lowercase, no spaces) and "texto" (max ${MAX_QUICK_REPLY_LENGTH} chars).
- Language: Brazilian Portuguese.`;

  const userContent = `Idea: "${idea}"
Count: ${count}

Example output:
[{"atalho":"saudacao","texto":"Olá! Como posso ajudar?"},{"atalho":"estoque","texto":"Temos em estoque."}]`;

  try {
    const res = await fetch(AI_COMPLETIONS_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        Authorization: apiKey ? `Bearer ${apiKey}` : "",
      },
      body: JSON.stringify({
        model: process.env.AI_MODEL?.trim() || process.env.MISTRAL_MODEL?.trim() || DEFAULT_AI_MODEL,
        messages: [
          { role: "system", content: systemContent },
          { role: "user", content: userContent },
        ],
        max_tokens: 1024,
        temperature: 0.5,
      }),
    });

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
      const isUnauthorized = res.status === 401 || (typeof detailStr === "string" && /unauthorized|invalid.*key|invalid.*token/i.test(detailStr));
      const message = isUnauthorized
        ? `Chave da API AI recusada (${res.status}). ${detailStr || "Verifique AI_API_KEY no .env."} Reinicie o servidor após configurar.`
        : (detailStr || errText || `AI API ${res.status}`).slice(0, 300);
      return NextResponse.json(
        {
          error: `Falha ao gerar: ${message}`,
        },
        { status: res.status >= 500 ? 502 : 400 }
      );
    }

    const data = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const raw = data?.choices?.[0]?.message?.content?.trim() ?? "";
    const cleaned = raw.replace(/^```\w*\n?|\n?```$/g, "").trim();
    let arr: Array<{ atalho?: string; texto?: string }>;
    try {
      arr = JSON.parse(cleaned);
    } catch {
      return NextResponse.json(
        { error: "A IA não retornou um JSON válido. Tente outra ideia." },
        { status: 502 }
      );
    }

    if (!Array.isArray(arr)) {
      return NextResponse.json(
        { error: "A IA não retornou uma lista. Tente outra ideia." },
        { status: 502 }
      );
    }

    const suggestions = arr
      .filter((o) => o && typeof o.atalho === "string" && typeof o.texto === "string")
      .slice(0, count)
      .map((o) => ({
        shortCut: String(o.atalho).trim().slice(0, 80) || "resposta",
        type: "text" as const,
        text: String(o.texto).trim().slice(0, MAX_QUICK_REPLY_LENGTH),
      }));

    return NextResponse.json({ suggestions });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Erro ao chamar Mistral";
    return NextResponse.json(
      { error: `Erro ao gerar: ${message}` },
      { status: 502 }
    );
  }
}
