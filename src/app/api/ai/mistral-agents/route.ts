import { getCompanyIdFromRequest } from "@/lib/auth/get-company";
import { requirePermission } from "@/lib/auth/get-profile";
import { PERMISSIONS } from "@/lib/auth/permissions";
import {
  getMistralPlatformApiKey,
  MISTRAL_PLATFORM_KEY_HINT,
} from "@/lib/ai/server-api-key";
import { mistralAgentCreate } from "@/lib/ai/mistral-conversations";
import { NextResponse } from "next/server";

const AI_BASE_URL =
  process.env.AI_BASE_URL?.replace(/\/+$/, "") ||
  process.env.MISTRAL_BASE_URL?.replace(/\/+$/, "") ||
  "https://api.mistral.ai/v1";

const DEFAULT_MODEL = "mistral-medium-latest";

/**
 * Cria um agente na Mistral (POST /v1/agents). Requer copilot.manage e MISTRAL_API_KEY (ou AI_API_KEY só se AI_BASE_URL for Mistral).
 */
export async function POST(request: Request) {
  const companyId = await getCompanyIdFromRequest(request);
  if (!companyId) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }
  const permErr = await requirePermission(companyId, PERMISSIONS.copilot.manage);
  if (permErr) {
    return NextResponse.json({ error: permErr.error }, { status: permErr.status });
  }

  const apiKey = getMistralPlatformApiKey();
  if (!apiKey) {
    return NextResponse.json({ error: MISTRAL_PLATFORM_KEY_HINT }, { status: 503 });
  }

  let body: {
    name?: string;
    description?: string;
    instructions?: string;
    model?: string;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const name = typeof body.name === "string" ? body.name.trim() : "";
  const description = typeof body.description === "string" ? body.description.trim() : "";
  if (!name || !description) {
    return NextResponse.json({ error: "name e description são obrigatórios." }, { status: 400 });
  }

  const model =
    typeof body.model === "string" && body.model.trim() ? body.model.trim() : DEFAULT_MODEL;
  const instructions = typeof body.instructions === "string" ? body.instructions : "";

  try {
    const created = await mistralAgentCreate({
      apiKey,
      baseUrl: AI_BASE_URL,
      name,
      description,
      instructions: instructions.trim() || undefined,
      model,
    });
    return NextResponse.json({
      id: created.id,
      version: created.version ?? 0,
      message:
        "Agente criado na Mistral. Para vincular à conexão/fila pela interface, use Copiloto → Novo agente → Salvar regra (POST /api/companies/copilot-agents/provision), ou cole o ID numa regra legado Conversations.",
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Falha ao criar agente";
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
