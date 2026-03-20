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

function parseRedisHost(hostStr) {
  const trimmed = String(hostStr || "").trim();
  const idx = trimmed.lastIndexOf(":");
  if (idx > 0) {
    const host = trimmed.slice(0, idx);
    const port = parseInt(trimmed.slice(idx + 1), 10);
    if (!Number.isNaN(port)) return { host, port };
  }
  return {
    host: trimmed,
    port: Number(process.env.REDIS_PORT || "6379"),
  };
}

const hostRaw =
  process.env.REDIS_HOST || "redis-15295.c98.us-east-1-4.ec2.cloud.redislabs.com:15295";
const { host, port } = parseRedisHost(hostRaw);
const username = String(process.env.REDIS_USERNAME || "default").trim();
const password = (process.env.REDIS_PASSWORD || "").trim();

if (!password) {
  console.error("REDIS_PASSWORD não definido no .env");
  process.exit(1);
}

async function tryConnect(label, clientOptions) {
  const client = createClient(clientOptions);
  client.on("error", (err) => console.error(`[${label}] Redis Client Error`, err));

  try {
    await client.connect();
    console.log(`[${label}] Conectado ao Redis: ${host}:${port}`);

    await client.set("foo", "bar");
    const result = await client.get("foo");
    console.log(`[${label}] get('foo') =>`, result);
  } catch (err) {
    console.error(`[${label}] Falha:`, err && err.message ? err.message : err);
    throw err;
  } finally {
    try {
      await client.quit();
    } catch (_) {}
  }
}

async function main() {
  // 1) Com username explícito (como a app faz)
  try {
    await tryConnect("username+password", {
      username,
      password,
      socket: { host, port },
    });
    return;
  } catch {}

  // 2) Sem username (alguns setups aceitam AUTH só com senha)
  await tryConnect("password_only", {
    password,
    socket: { host, port },
  });
}

main().catch(() => process.exit(1));
