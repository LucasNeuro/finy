/**
 * Executa o cron de broadcast manualmente (pipelines agendados).
 * Útil para testar sem esperar o cron do Render/Supabase.
 *
 * Uso:
 *   npm run run-broadcast-cron
 *   node scripts/run-broadcast-cron.mjs
 *
 * Requer: servidor rodando (npm run dev) ou APP_URL apontando para produção.
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

const APP_URL = process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
const CRON_SECRET = process.env.CRON_SECRET;

const url = `${APP_URL.replace(/\/$/, "")}/api/cron/broadcast-pipelines`;

async function main() {
  console.log("Chamando:", url);
  console.log("CRON_SECRET:", CRON_SECRET ? "***" : "(não definido)");

  if (!CRON_SECRET) {
    console.error("ERRO: CRON_SECRET não definido no .env");
    process.exit(1);
  }

  try {
    const res = await fetch(url, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${CRON_SECRET}`,
      },
    });

    const data = await res.json().catch(() => ({}));

    if (res.ok) {
      console.log("OK — Resposta:", JSON.stringify(data, null, 2));
      if (data.run > 0) {
        console.log(`\n${data.run} pipeline(s) executado(s).`);
      } else {
        console.log("\nNenhum pipeline no horário para executar.");
      }
    } else {
      console.error("ERRO:", res.status, data?.error || res.statusText);
      process.exit(1);
    }
  } catch (err) {
    console.error("Falha:", err.message);
    if (err.cause) console.error("Causa:", err.cause);
    process.exit(1);
  }
}

main();
