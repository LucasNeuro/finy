/**
 * Testa a chave da API Mistral (Chat Completions + Agents).
 *
 * Uso:
 *   npm run test:mistral
 *   node scripts/test-mistral.mjs
 *
 * Carrega .env e depois .env.local (como o Next.js: o local sobrescreve).
 */
import { readFileSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

function loadEnvFile(rel) {
  const envPath = join(__dirname, "..", rel);
  if (!existsSync(envPath)) return;
  const content = readFileSync(envPath, "utf8");
  content.split(/\r?\n/).forEach((line) => {
    const m = line.match(/^([^#=]+)=(.*)$/);
    if (m) process.env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, "");
  });
}

loadEnvFile(".env");
loadEnvFile(".env.local");

function cleanKey(s) {
  if (!s) return "";
  let t = String(s).trim().replace(/\r?\n/g, "").replace(/^\uFEFF/, "");
  if ((t.startsWith('"') && t.endsWith('"')) || (t.startsWith("'") && t.endsWith("'"))) {
    t = t.slice(1, -1).trim();
  }
  return t;
}

// Mesma prioridade que getServerAiApiKey / provision com chat Mistral
const apiKey =
  cleanKey(process.env.AI_API_KEY) ||
  cleanKey(process.env.MISTRAL_API_KEY) ||
  cleanKey(process.env.MISTARL_API_KEY) ||
  "";
let baseUrl =
  process.env.AI_BASE_URL?.replace(/\/+$/, "") ||
  process.env.MISTRAL_BASE_URL?.replace(/\/+$/, "") ||
  "https://api.mistral.ai/v1";
if (!/\/v1$/i.test(baseUrl)) {
  try {
    const u = new URL(baseUrl);
    if (u.hostname === "api.mistral.ai" && (u.pathname === "/" || u.pathname === "")) {
      baseUrl = `${u.origin}/v1`;
    }
  } catch {
    /* ignore */
  }
}
const model = process.env.AI_MODEL?.trim() || process.env.MISTRAL_MODEL?.trim() || "mistral-small-latest";

const chatUrl = `${baseUrl}/chat/completions`;
const agentsListUrl = `${baseUrl}/agents?page=0&page_size=1`;

async function main() {
  console.log("Testando Mistral API (mesma ordem de chaves que o app: AI_API_KEY → MISTRAL_API_KEY)");
  console.log("Chat URL:", chatUrl);
  console.log("Agents URL (list):", agentsListUrl);
  console.log("Model:", model);
  console.log("API Key:", apiKey ? `(definida, ${apiKey.length} caracteres — valor não exibido)` : "(não definida)");
  console.log("");

  if (!apiKey) {
    console.error("ERRO: defina AI_API_KEY ou MISTRAL_API_KEY em .env ou .env.local");
    process.exit(1);
  }

  try {
    const res = await fetch(chatUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: [{ role: "user", content: "Responda apenas: OK" }],
        max_tokens: 10,
      }),
    });

    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      console.error("ERRO (chat):", res.status);
      console.error("Mensagem:", data?.message ?? data?.detail ?? data?.error ?? JSON.stringify(data));
      if (res.status === 401) {
        console.error("\nDica: Chave inválida ou revogada. Gere em console.mistral.ai → API keys.");
      }
      process.exit(1);
    }

    const text = data?.choices?.[0]?.message?.content ?? "(vazio)";
    console.log("OK — Chat Completions aceitou a chave.");
    console.log("Resposta:", text);

    const ar = await fetch(agentsListUrl, {
      method: "GET",
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
    });
    const ad = await ar.json().catch(() => ({}));
    if (!ar.ok) {
      console.error("\nERRO (GET /v1/agents — necessário para criar copilotos):", ar.status);
      console.error("Mensagem:", ad?.message ?? ad?.detail ?? JSON.stringify(ad));
      if (ar.status === 401) {
        console.error(
          "\nSe o chat passou mas isto falhou, contacte o suporte Mistral (conta / permissões). " +
            "Se ambos falham 401, a chave está incorreta ou ainda não propagou (aguarde 1–2 min)."
        );
      }
      process.exit(1);
    }
    console.log("OK — Agents API aceitou a mesma chave (listagem).");
  } catch (err) {
    console.error("Falha:", err.message);
    process.exit(1);
  }
}

main();
