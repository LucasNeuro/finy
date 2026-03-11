import { getCompanyIdFromRequest } from "@/lib/auth/get-company";
import { NextResponse } from "next/server";

const AI_BASE_URL = process.env.AI_BASE_URL?.replace(/\/+$/, "") || "https://api.mistral.ai/v1";
const AI_COMPLETIONS_URL = `${AI_BASE_URL}/chat/completions`;
const DEFAULT_AI_MODEL = "ministral-3b-latest";

export async function POST(request: Request) {
  const companyId = await getCompanyIdFromRequest(request);
  if (!companyId) {
    return NextResponse.json(
      { error: "Não autorizado. Verifique se está logado e com a empresa selecionada." },
      { status: 401 }
    );
  }

  const apiKey = process.env.AI_API_KEY?.trim() || process.env.MISTRAL_API_KEY?.trim();
  const isLocal = AI_BASE_URL.includes("localhost") || AI_BASE_URL.includes("127.0.0.1");
  
  if (!apiKey && !isLocal) {
    return NextResponse.json(
      {
        error: "AI_API_KEY ou MISTRAL_API_KEY não configurada. Adicione no .env e reinicie o servidor.",
      },
      { status: 503 }
    );
  }

  let body: { text?: string; instruction?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const text = typeof body?.text === "string" ? body.text.trim() : "";
  if (!text) {
    return NextResponse.json(
      { error: "Texto vazio." },
      { status: 400 }
    );
  }

  const systemContent = `You are a helpful writing assistant for customer support agents.
Your task is to correct grammar, spelling, and improve the tone of the user's message.
The target language is Brazilian Portuguese.
Maintain a professional, polite, and helpful tone.
Do not change the meaning of the message.
Return ONLY the corrected text. Do not add quotes or explanations.`;

  const userContent = `Original text: "${text}"
${body.instruction ? `Instruction: ${body.instruction}` : ""}

Corrected text:`;

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
        temperature: 0.3,
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      const errJson = await (async () => {
        try { return JSON.parse(errText); } catch { return null; }
      })();
      const detail = errJson?.detail ?? errJson?.message ?? errJson?.error ?? errJson?.msg;
      const detailStr = typeof detail === "string" ? detail : JSON.stringify(detail ?? errText);
      const isUnauthorized = res.status === 401 || (typeof detailStr === "string" && /unauthorized|invalid.*key|invalid.*token/i.test(detailStr));
      const message = isUnauthorized
        ? `Chave da API AI recusada (${res.status}). Verifique suas credenciais.`
        : (detailStr || errText || `AI API ${res.status}`).slice(0, 300);
      
      return NextResponse.json(
        { error: `Falha ao corrigir: ${message}` },
        { status: res.status >= 500 ? 502 : 400 }
      );
    }

    const data = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const corrected = data?.choices?.[0]?.message?.content?.trim() ?? "";

    // Remover aspas se a IA adicionou por engano
    const cleanCorrected = corrected.replace(/^"|"$/g, "");

    return NextResponse.json({ corrected: cleanCorrected });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Erro ao chamar IA";
    return NextResponse.json(
      { error: `Erro ao corrigir: ${message}` },
      { status: 502 }
    );
  }
}
