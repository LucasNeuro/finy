#!/usr/bin/env node
/**
 * Codifica certificate.pem e private-key.key em base64 para uso em variáveis de ambiente.
 * Uso: node scripts/encode-cora-pems.mjs [caminho/pasta]
 * Ex: node scripts/encode-cora-pems.mjs ./cert_key_cora_production
 *
 * Os arquivos devem se chamar certificate.pem e private-key.key
 */
import fs from "fs";
import path from "path";

const dir = process.argv[2] || ".";
const certPath =
  fs.existsSync(path.join(dir, "certificate.pem"))
    ? path.join(dir, "certificate.pem")
    : path.join(dir, "certificate");
const keyPath =
  fs.existsSync(path.join(dir, "private-key.key"))
    ? path.join(dir, "private-key.key")
    : path.join(dir, "private-key");

if (!fs.existsSync(certPath)) {
  console.error("Arquivo não encontrado: certificate ou certificate.pem em", dir);
  console.error("Uso: node scripts/encode-cora-pems.mjs [pasta_com_cert_e_key]");
  process.exit(1);
}
if (!fs.existsSync(keyPath)) {
  console.error("Arquivo não encontrado: private-key ou private-key.key em", dir);
  process.exit(1);
}

const cert = fs.readFileSync(certPath, "utf8").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
const key = fs.readFileSync(keyPath, "utf8").replace(/\r\n/g, "\n").replace(/\r/g, "\n");

const certB64 = Buffer.from(cert, "utf8").toString("base64");
const keyB64 = Buffer.from(key, "utf8").toString("base64");

console.log("\n=== Cole no Render (Environment Variables) ===\n");
console.log("CORA_CERT_PEM=" + certB64);
console.log("\nCORA_PRIVATE_KEY_PEM=" + keyB64);
console.log("\n=== Fim ===\n");
