/**
 * Testa a conexão com o Redis usando as variáveis do .env
 * Uso: npm run test:redis   ou   node scripts/test-redis.mjs (a partir da raiz do projeto)
 */
import { createClient } from "redis";
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

const host = process.env.REDIS_HOST || "redis-15295.c98.us-east-1-4.ec2.cloud.redislabs.com";
const port = Number(process.env.REDIS_PORT || "15295");
const username = process.env.REDIS_USERNAME || "default";
const password = process.env.REDIS_PASSWORD || "";

if (!password) {
  console.error("REDIS_PASSWORD não definido no .env");
  process.exit(1);
}

const client = createClient({
  username,
  password,
  socket: { host, port },
});

client.on("error", (err) => console.error("Redis Client Error", err));

async function main() {
  try {
    await client.connect();
    console.log("Conectado ao Redis:", `${host}:${port}`);

    await client.set("foo", "bar");
    const result = await client.get("foo");
    console.log("get('foo') =>", result);

    if (result === "bar") {
      console.log("OK — Conexão com Redis funcionando.");
    } else {
      console.log("ERRO — Valor inesperado.");
    }
  } catch (err) {
    console.error("Falha:", err.message);
    process.exit(1);
  } finally {
    await client.quit();
  }
}

main();
