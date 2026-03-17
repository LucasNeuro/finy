/**
 * Testa a chave da API Mistral (Chat Completions).
 *
 * Uso:
 *   npm run test:mistral
 *   node scripts/test-mistral.mjs
 */
import { readFileSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

function loadEnv() {
  const envPath = join(__dirname, "..", ".env");
  if (!existsSync(envPath)) {
    console.warn(".env não encontrado em", envPath);
    return;
  }
  const content = readFileSync(envPath, "utf8");
  content.split(/\r?\n/).forEach((line) => {
    const m = line.match(/^([^#=]+)=(.*)$/);
    if (m) process.env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, "");
  });
}

loadEnv();

const apiKey = (process.env.AI_API_KEY || process.env.MISTRAL_API_KEY || "")
  .trim()
  .replace(/\r?\n/g, "");
const baseUrl =
  process.env.AI_BASE_URL?.replace(/\/+$/, "") ||
  process.env.MISTRAL_BASE_URL?.replace(/\/+$/, "") ||
  "https://api.mistral.ai/v1";
const model = process.env.AI_MODEL?.trim() || process.env.MISTRAL_MODEL?.trim() || "mistral-small-latest";

const url = `${baseUrl}/chat/completions`;

async function main() {
  console.log("Testando Mistral API");
  console.log("URL:", url);
  console.log("Model:", model);
  console.log("API Key:", apiKey ? `${apiKey.slice(0, 8)}...` : "(não definida)");
  console.log("");

  if (!apiKey) {
    console.error("ERRO: MISTRAL_API_KEY ou AI_API_KEY não definida no .env");
    process.exit(1);
  }

  try {
    const res = await fetch(url, {
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

    if (res.ok) {
      const text = data?.choices?.[0]?.message?.content ?? "(vazio)";
      console.log("OK — Chave válida!");
      console.log("Resposta:", text);
    } else {
      console.error("ERRO:", res.status);
      console.error("Mensagem:", data?.message ?? data?.detail ?? data?.error ?? JSON.stringify(data));
      if (res.status === 401) {
        console.error("\nDica: Crie a chave em console.mistral.ai, aguarde 1-2 min, reinicie o servidor.");
      }
      process.exit(1);
    }
  } catch (err) {
    console.error("Falha:", err.message);
    process.exit(1);
  }
}

main();
