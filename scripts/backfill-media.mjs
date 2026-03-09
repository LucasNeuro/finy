#!/usr/bin/env node
/**
 * Backfill de mídias: migra mensagens antigas para o bucket whatsapp-media.
 * Chama POST /api/admin/backfill-media em loop até não haver mais nada.
 *
 * Uso:
 *   BACKFILL_SECRET=seu_secret APP_URL=http://localhost:3000 node scripts/backfill-media.mjs
 *   BACKFILL_SECRET=xxx APP_URL=https://app.seudominio.com node scripts/backfill-media.mjs
 *
 * Opcional: COMPANY_ID=uuid node scripts/backfill-media.mjs  (só essa empresa)
 */

const APP_URL = process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
const SECRET = process.env.BACKFILL_SECRET;
const COMPANY_ID = process.env.COMPANY_ID || null;
const BATCH_SIZE = 50;

if (!SECRET) {
  console.error("Defina BACKFILL_SECRET no ambiente.");
  process.exit(1);
}

const baseUrl = APP_URL.replace(/\/$/, "");
const url = `${baseUrl}/api/admin/backfill-media`;

async function runBatch() {
  const body = { secret: SECRET, limit: BATCH_SIZE };
  if (COMPANY_ID) body.companyId = COMPANY_ID;

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`HTTP ${res.status}: ${text}`);
  }

  return res.json();
}

async function main() {
  let totalProcessed = 0;
  let totalFailed = 0;
  let rounds = 0;

  console.log("Backfill de mídias -> bucket whatsapp-media");
  console.log("URL:", url);
  if (COMPANY_ID) console.log("Empresa:", COMPANY_ID);
  console.log("---");

  while (true) {
    rounds++;
    const data = await runBatch();
    const processed = data.processed ?? 0;
    const failed = data.failed ?? 0;
    totalProcessed += processed;
    totalFailed += failed;

    if (processed > 0 || failed > 0) {
      console.log(`Rodada ${rounds}: processadas ${processed}, falhas ${failed}`);
      if (data.errors?.length) {
        data.errors.forEach((e) => console.log(`  - ${e.messageId}: ${e.error}`));
      }
    }

    if (processed === 0 && failed === 0) {
      console.log("Nenhuma mensagem pendente. Encerrando.");
      break;
    }

    if (processed === 0 && data.total === 0) {
      console.log("Nenhuma mensagem para migrar. Encerrando.");
      break;
    }
  }

  console.log("---");
  console.log(`Total: ${totalProcessed} migradas, ${totalFailed} falhas.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
