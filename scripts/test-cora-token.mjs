#!/usr/bin/env node
/**
 * Testa a conexão com a Cora (token mTLS) em produção.
 * Uso: node --env-file=.env scripts/test-cora-token.mjs
 * Ou: node scripts/test-cora-token.mjs (carrega .env manualmente)
 */
import https from "https";
import fs from "fs";
import path from "path";

try {
  const envPath = path.join(process.cwd(), ".env");
  if (fs.existsSync(envPath)) {
    const content = fs.readFileSync(envPath, "utf8");
    for (const line of content.split("\n")) {
      if (!line || line.startsWith("#")) continue;
      const eq = line.indexOf("=");
      if (eq < 0) continue;
      const key = line.slice(0, eq).trim();
      let val = line.slice(eq + 1).trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      process.env[key] = val;
    }
  }
} catch {}

const CORA_CLIENT_ID = process.env.CORA_CLIENT_ID;
const CORA_TOKEN_URL = process.env.CORA_TOKEN_URL ?? "https://matls-clients.api.cora.com.br";
const CORA_CERT_PEM = process.env.CORA_CERT_PEM;
const CORA_PRIVATE_KEY_PEM = process.env.CORA_PRIVATE_KEY_PEM;

function decodePem(value) {
  if (!value?.trim()) return undefined;
  const s = value.trim();
  if (s.startsWith("-----")) return s.replace(/\\n/g, "\n");
  try {
    return Buffer.from(s, "base64").toString("utf8");
  } catch {
    return s.replace(/\\n/g, "\n");
  }
}

async function main() {
  console.log("Testando Cora (produção)...\n");
  console.log("CORA_CLIENT_ID:", CORA_CLIENT_ID ? "OK" : "FALTANDO");
  console.log("CORA_CERT_PEM:", CORA_CERT_PEM ? `${CORA_CERT_PEM.length} chars` + (CORA_CERT_PEM.includes("...") ? " - INCOMPLETO (contém ...)" : " - OK") : "FALTANDO");
  console.log("CORA_PRIVATE_KEY_PEM:", CORA_PRIVATE_KEY_PEM ? `${CORA_PRIVATE_KEY_PEM.length} chars` + (CORA_PRIVATE_KEY_PEM.includes("...") ? " - INCOMPLETO (contém ...)" : " - OK") : "FALTANDO");
  console.log("");

  if (!CORA_CLIENT_ID || !CORA_CERT_PEM || !CORA_PRIVATE_KEY_PEM) {
    console.error("Configure CORA_CLIENT_ID, CORA_CERT_PEM e CORA_PRIVATE_KEY_PEM no .env");
    process.exit(1);
  }
  if (CORA_CERT_PEM.includes("...") || CORA_PRIVATE_KEY_PEM.includes("...")) {
    console.error("Os valores estão incompletos (contêm ...). Rode:");
    console.error("  node scripts/encode-cora-pems.mjs <pasta_com_cert_e_key>");
    console.error("E cole os valores completos no .env");
    process.exit(1);
  }

  const cert = decodePem(CORA_CERT_PEM);
  const key = decodePem(CORA_PRIVATE_KEY_PEM);
  const tokenUrl = new URL("/token", CORA_TOKEN_URL.startsWith("http") ? CORA_TOKEN_URL : `https://${CORA_TOKEN_URL}`);
  const body = `grant_type=client_credentials&client_id=${encodeURIComponent(CORA_CLIENT_ID)}`;

  console.log("Requisitando token em", tokenUrl.toString(), "...");

  return new Promise((resolve, reject) => {
    const req = https.request(
      tokenUrl.toString(),
      {
        method: "POST",
        cert,
        key,
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "Content-Length": Buffer.byteLength(body),
        },
      },
      (res) => {
        let data = "";
        res.on("data", (chunk) => (data += chunk));
        res.on("end", () => {
          if (res.statusCode === 200) {
            const json = JSON.parse(data);
            console.log("SUCESSO! Token obtido.");
            console.log("access_token:", json.access_token?.slice(0, 50) + "...");
            resolve();
          } else {
            console.error("FALHA:", res.statusCode);
            console.error("Resposta:", data?.slice?.(0, 500) || data);
            reject(new Error(data));
          }
        });
      }
    );
    req.on("error", (err) => {
      console.error("Erro de conexão:", err.message);
      if (err.code) console.error("Código:", err.code);
      reject(err);
    });
    req.write(body);
    req.end();
  });
}

main().catch(() => process.exit(1));
