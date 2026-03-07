import { getCompanyIdFromRequest } from "@/lib/auth/get-company";
import { NextResponse } from "next/server";

const MISTRAL_URL = "https://api.mistral.ai/v1/chat/completions";
const MAX_DESCRIPTION_LENGTH = 512;
const MAX_GROUP_NAME_LENGTH = 25;
const MAX_COMMUNITY_NAME_LENGTH = 100;
const MAX_INSTANCE_NAME_LENGTH = 80;

type EntityType = "community" | "group" | "instance";
type FieldType = "description" | "name";

/**
 * Conforme documentação Mistral: system message define papel e regras;
 * user message traz o input concreto. Isso melhora a qualidade da resposta.
 */
function buildMessages(
  type: EntityType,
  field: FieldType,
  name: string,
  context: string
): Array<{ role: "system" | "user"; content: string }> {
  const entityLabels = {
    community: {
      name: "comunidade no WhatsApp (reúne vários grupos sob um tema)",
      description: "descrição curta para a comunidade, explicando o propósito e quem deve participar",
    },
    group: {
      name: "grupo no WhatsApp (chat em grupo)",
      description: "descrição curta para o grupo, explicando o tema ou regras em uma frase",
    },
    instance: {
      name: "instância/conexão WhatsApp (número usado para atendimento, vendas ou suporte)",
      description: "descrição curta para a instância, explicando o uso desse número (ex: atendimento, vendas, suporte)",
    },
  }[type];

  if (field === "name") {
    const maxLen =
      type === "group"
        ? MAX_GROUP_NAME_LENGTH
        : type === "community"
          ? MAX_COMMUNITY_NAME_LENGTH
          : MAX_INSTANCE_NAME_LENGTH;
    const systemContent = `You are a copywriter. Your task is to generate a single name in Brazilian Portuguese.

# Role
You generate only one short name, suitable for WhatsApp. No explanations, no quotes, no punctuation at the end.

# Output format
- Reply with ONLY the generated name.
- Maximum ${maxLen} characters.
- Clear and professional.`;

    const userParts: string[] = [`Generate one name for: ${entityLabels.name}.`];
    if (name) userParts.push(`Existing suggestion or theme: "${name}". Use as inspiration if it fits.`);
    if (context) userParts.push(`Context: ${context}`);
    userParts.push("\nReply with only the name, nothing else.");

    return [
      { role: "system", content: systemContent },
      { role: "user", content: userParts.join("\n") },
    ];
  }

  // field === "description"
  const systemContent = `You are a copywriter. Your task is to generate a single description in Brazilian Portuguese.

# Role
You generate only one short description for WhatsApp. No explanations, no quotes, no "Description:" title.

# Output format
- Reply with ONLY the description text.
- Maximum ${MAX_DESCRIPTION_LENGTH} characters.
- One or two objective sentences, professional and clear tone.`;

  const userParts: string[] = [`Generate one description for: ${entityLabels.description}.`];
  if (name) userParts.push(`Name already set: "${name}". The description should match this name.`);
  if (context) userParts.push(`Additional context: ${context}`);
  userParts.push("\nReply with only the description text, nothing else.");

  return [
    { role: "system", content: systemContent },
    { role: "user", content: userParts.join("\n") },
  ];
}

/**
 * POST /api/ai/generate-description
 * Gera nome ou descrição em português via Mistral AI para comunidade, grupo ou instância.
 * Usa system + user messages conforme documentação Mistral.
 * Body: { type: "community" | "group" | "instance", field?: "description" | "name", name?: string, context?: string }
 */
export async function POST(request: Request) {
  const companyId = await getCompanyIdFromRequest(request);
  if (!companyId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const apiKey = process.env.MISTRAL_API_KEY?.trim();
  if (!apiKey) {
    return NextResponse.json(
      {
        error:
          "MISTRAL_API_KEY não configurada. Adicione no .env e reinicie o servidor (npm run dev).",
      },
      { status: 503 }
    );
  }

  let body: { type?: string; field?: string; name?: string; context?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const type: EntityType =
    body?.type === "community" || body?.type === "group" || body?.type === "instance"
      ? body.type
      : "group";
  const field: FieldType = body?.field === "name" ? "name" : "description";
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  const context = typeof body?.context === "string" ? body.context.trim() : "";

  const messages = buildMessages(type, field, name, context);

  const maxLength =
    field === "name"
      ? type === "group"
        ? MAX_GROUP_NAME_LENGTH
        : type === "community"
          ? MAX_COMMUNITY_NAME_LENGTH
          : MAX_INSTANCE_NAME_LENGTH
      : MAX_DESCRIPTION_LENGTH;

  try {
    const res = await fetch(MISTRAL_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "mistral-small-latest",
        messages,
        max_tokens: field === "name" ? 60 : 256,
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
      const message =
        errJson?.message ?? errJson?.error ?? errText ?? `Mistral API ${res.status}`;
      return NextResponse.json(
        { error: `Falha ao gerar: ${message}` },
        { status: res.status >= 500 ? 502 : 400 }
      );
    }

    const data = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const raw = data?.choices?.[0]?.message?.content?.trim() ?? "";
    const text = raw.slice(0, maxLength);
    return NextResponse.json({ text });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Erro ao chamar Mistral";
    return NextResponse.json(
      { error: `Erro ao gerar: ${message}` },
      { status: 502 }
    );
  }
}
