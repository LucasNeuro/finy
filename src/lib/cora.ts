/**
 * Cliente API Cora – Emissão de boletos
 * Suporta Integração Direta (mTLS: cert + key) e Parceria (client_secret).
 * Docs: https://developers.cora.com.br/reference/emiss%C3%A3o-de-boleto-registrado
 */

import https from "https";

const CORA_API_URL = (process.env.CORA_API_URL ?? "https://api.cora.com.br").replace(/\/$/, "");
const CORA_TOKEN_URL =
  process.env.CORA_TOKEN_URL ?? "https://matls-clients.api.cora.com.br";
const tokenBase = CORA_TOKEN_URL.startsWith("http")
  ? CORA_TOKEN_URL
  : `https://${CORA_TOKEN_URL}`;
const CORA_CLIENT_ID = process.env.CORA_CLIENT_ID;
const CORA_CLIENT_SECRET = process.env.CORA_CLIENT_SECRET;
const CORA_CERT_PEM = process.env.CORA_CERT_PEM;
const CORA_PRIVATE_KEY_PEM = process.env.CORA_PRIVATE_KEY_PEM;

/** Decodifica PEM de env (suporta \n literal ou base64) */
function decodePem(value: string | undefined): string | undefined {
  if (!value?.trim()) return undefined;
  let s = value.trim();
  if (s.includes("...")) {
    throw new Error("Certificado ou chave incompleto. Use o script encode-cora-pems.mjs e cole o valor completo (sem ...)");
  }
  if (s.startsWith("-----")) {
    return s.replace(/\\n/g, "\n").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  }
  try {
    const b64 = s.replace(/\s/g, "").replace(/[^A-Za-z0-9+/=]/g, "");
    const decoded = Buffer.from(b64, "base64").toString("utf8");
    const out = decoded.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
    if (!out.includes("-----BEGIN")) {
      throw new Error("Base64 decodificado não é PEM válido");
    }
    return out;
  } catch (e) {
    if (e instanceof Error && e.message.includes("não é PEM")) throw e;
    return s.replace(/\\n/g, "\n");
  }
}

export type CoraCustomer = {
  name: string;
  email?: string;
  document: { identity: string; type: "CPF" | "CNPJ" };
  address?: {
    street: string;
    number: string;
    district: string;
    city: string;
    state: string;
    zip_code: string;
    complement?: string;
  };
};

export type CoraInvoicePayload = {
  code?: string;
  customer: CoraCustomer;
  services: Array<{ name: string; description: string; amount: number }>;
  payment_terms: {
    due_date: string;
    fine?: { amount?: number; rate?: number };
    interest?: { rate: number };
    discount?: { type: "FIXED" | "PERCENT"; value: number };
  };
  notification?: {
    name: string;
    channels: Array<{ contact: string; channel: "EMAIL" | "SMS"; rules: string[] }>;
  };
  payment_forms?: ("BANK_SLIP" | "PIX")[];
};

export type CoraInvoiceResponse = {
  id: string;
  status: string;
  created_at: string;
  total_amount: number;
  total_paid: number;
  code: string;
  customer: CoraCustomer;
  services: unknown[];
  payment_terms: unknown;
  payment_options?: {
    bank_slip?: {
      barcode: string;
      digitable: string;
      registered: string;
      url: string;
      our_number: string;
    };
  };
  pix?: { emv: string };
  payments?: unknown[];
};

/** Integração Direta: token via mTLS (cert + key) */
async function getTokenMtls(): Promise<string> {
  const cert = decodePem(CORA_CERT_PEM);
  const key = decodePem(CORA_PRIVATE_KEY_PEM);
  if (!CORA_CLIENT_ID || !cert || !key) {
    throw new Error(
      "Integração Direta: CORA_CLIENT_ID, CORA_CERT_PEM e CORA_PRIVATE_KEY_PEM são obrigatórios"
    );
  }

  const tokenUrl = new URL("/token", tokenBase);
  const body = `grant_type=client_credentials&client_id=${encodeURIComponent(CORA_CLIENT_ID)}`;

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
          if (res.statusCode !== 200) {
            reject(new Error(`Cora OAuth falhou: ${res.statusCode} ${data}`));
            return;
          }
          try {
            const json = JSON.parse(data);
            resolve(json.access_token);
          } catch {
            reject(new Error(`Cora OAuth: resposta inválida`));
          }
        });
      }
    );
    req.on("error", reject);
    req.write(body);
    req.end();
  });
}

/** Parceria Cora: token via client_secret */
async function getTokenParceria(): Promise<string> {
  if (!CORA_CLIENT_ID || !CORA_CLIENT_SECRET) {
    throw new Error("Parceria: CORA_CLIENT_ID e CORA_CLIENT_SECRET são obrigatórios");
  }
  const base = CORA_API_URL.replace(/\/$/, "");
  const tokenUrl = `${base}/oauth/token`;
  const res = await fetch(tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: CORA_CLIENT_ID,
      client_secret: CORA_CLIENT_SECRET,
    }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Cora OAuth falhou: ${res.status} ${err}`);
  }
  const data = await res.json();
  return data.access_token;
}

async function getAccessToken(): Promise<string> {
  const cert = decodePem(CORA_CERT_PEM);
  const key = decodePem(CORA_PRIVATE_KEY_PEM);
  if (cert && key) {
    return getTokenMtls();
  }
  return getTokenParceria();
}

/** Emite boleto via Integração Direta (mTLS em todas as requisições) */
async function emitInvoiceMtls(
  payload: CoraInvoicePayload,
  idempotencyKey: string,
  token: string
): Promise<CoraInvoiceResponse> {
  const cert = decodePem(CORA_CERT_PEM);
  const key = decodePem(CORA_PRIVATE_KEY_PEM);
  if (!cert || !key) {
    throw new Error("Integração Direta: CORA_CERT_PEM e CORA_PRIVATE_KEY_PEM são obrigatórios");
  }

  const url = new URL("/v2/invoices", tokenBase);
  const body = JSON.stringify({
    ...payload,
    payment_forms: payload.payment_forms ?? ["BANK_SLIP", "PIX"],
  });

  return new Promise((resolve, reject) => {
    const req = https.request(
      url.toString(),
      {
        method: "POST",
        cert,
        key,
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
          "Idempotency-Key": idempotencyKey,
          Accept: "application/json",
          "Content-Length": Buffer.byteLength(body),
        },
      },
      (res) => {
        let data = "";
        res.on("data", (chunk) => (data += chunk));
        res.on("end", () => {
          if (res.statusCode !== 200 && res.statusCode !== 201) {
            let msg = data;
            try {
              const err = JSON.parse(data) as Record<string, unknown>;
              msg =
                (err.message as string) ??
                (Array.isArray(err.errors)
                  ? (err.errors as { message?: string }[])
                      .map((e) => (e as { message?: string }).message)
                      .filter(Boolean)
                      .join("; ")
                  : null) ??
                (err.detail as string) ??
                (err.error as string) ??
                data.slice(0, 200);
            } catch {
              msg = data.slice(0, 200) || String(res.statusCode);
            }
            reject(new Error(`Cora emissão falhou: ${res.statusCode} ${msg}`));
            return;
          }
          try {
            resolve(JSON.parse(data) as CoraInvoiceResponse);
          } catch {
            reject(new Error("Cora emissão: resposta inválida"));
          }
        });
      }
    );
    req.on("error", reject);
    req.write(body);
    req.end();
  });
}

/** Emite boleto via Parceria (sem mTLS na API) */
async function emitInvoiceParceria(
  payload: CoraInvoicePayload,
  idempotencyKey: string,
  token: string
): Promise<CoraInvoiceResponse> {
  const url = `${CORA_API_URL}/v2/invoices`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      "Idempotency-Key": idempotencyKey,
      Accept: "application/json",
    },
    body: JSON.stringify({
      ...payload,
      payment_forms: payload.payment_forms ?? ["BANK_SLIP", "PIX"],
    }),
  });
  if (!res.ok) {
    const raw = await res.text();
    let msg = res.statusText;
    try {
      const err = JSON.parse(raw) as Record<string, unknown>;
      msg =
        (err.message as string) ??
        (Array.isArray(err.errors)
          ? (err.errors as { message?: string }[]).map((e) => e.message).filter(Boolean).join("; ")
          : null) ??
        (err.detail as string) ??
        raw.slice(0, 200);
    } catch {
      msg = raw.slice(0, 200) || msg;
    }
    throw new Error(`Cora emissão falhou: ${res.status} ${msg}`);
  }
  return res.json();
}

export async function emitInvoice(
  payload: CoraInvoicePayload,
  idempotencyKey: string
): Promise<CoraInvoiceResponse> {
  const token = await getAccessToken();
  const cert = decodePem(CORA_CERT_PEM);
  const key = decodePem(CORA_PRIVATE_KEY_PEM);
  if (cert && key) {
    return emitInvoiceMtls(payload, idempotencyKey, token);
  }
  return emitInvoiceParceria(payload, idempotencyKey, token);
}

export type CoraInvoiceListItem = {
  id?: string;
  code?: string;
  status?: string;
  due_date?: string;
  total_amount?: number;
  customer?: unknown;
  // Alguns endpoints retornam estrutura resumida diferente; mantemos como optional.
  [k: string]: unknown;
};

export type CoraInvoiceListResponse = {
  totalItems?: number;
  items?: CoraInvoiceListItem[];
  // Alguns endpoints podem retornar outros campos.
  [k: string]: unknown;
};

async function getInvoicesMtls(
  query: {
    start?: string;
    end?: string;
    state?: string;
    search?: string;
    page?: number;
    perPage?: number;
  }
): Promise<CoraInvoiceListResponse> {
  const cert = decodePem(CORA_CERT_PEM);
  const key = decodePem(CORA_PRIVATE_KEY_PEM);
  if (!cert || !key) {
    throw new Error("Integração Direta: CORA_CERT_PEM e CORA_PRIVATE_KEY_PEM são obrigatórios para listar invoices");
  }

  const token = await getTokenMtls();
  const url = new URL("/v2/invoices", tokenBase);
  const params = url.searchParams;
  if (query.start) params.set("start", query.start);
  if (query.end) params.set("end", query.end);
  if (query.state) params.set("state", query.state);
  if (query.search) params.set("search", query.search);
  if (query.page != null) params.set("page", String(query.page));
  if (query.perPage != null) params.set("perPage", String(query.perPage));

  return new Promise((resolve, reject) => {
    const req = https.request(
      url.toString(),
      {
        method: "GET",
        cert,
        key,
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/json",
        },
      },
      (res) => {
        let data = "";
        res.on("data", (chunk) => (data += chunk));
        res.on("end", () => {
          if (res.statusCode !== 200) {
            return reject(new Error(`Cora list invoices falhou: ${res.statusCode} ${data.slice(0, 200)}`));
          }
          try {
            resolve(JSON.parse(data) as CoraInvoiceListResponse);
          } catch {
            reject(new Error("Cora list invoices: resposta inválida"));
          }
        });
      }
    );
    req.on("error", reject);
    req.end();
  });
}

async function getInvoiceDetailsMtls(invoiceId: string): Promise<CoraInvoiceResponse> {
  const cert = decodePem(CORA_CERT_PEM);
  const key = decodePem(CORA_PRIVATE_KEY_PEM);
  if (!cert || !key) {
    throw new Error("Integração Direta: CORA_CERT_PEM e CORA_PRIVATE_KEY_PEM são obrigatórios para consultar invoice");
  }

  const token = await getTokenMtls();
  const url = new URL(`/v2/invoices/${encodeURIComponent(invoiceId)}`, tokenBase);

  return new Promise((resolve, reject) => {
    const req = https.request(
      url.toString(),
      {
        method: "GET",
        cert,
        key,
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/json",
        },
      },
      (res) => {
        let data = "";
        res.on("data", (chunk) => (data += chunk));
        res.on("end", () => {
          if (res.statusCode !== 200) {
            return reject(new Error(`Cora invoice details falhou: ${res.statusCode} ${data.slice(0, 200)}`));
          }
          try {
            resolve(JSON.parse(data) as CoraInvoiceResponse);
          } catch {
            reject(new Error("Cora invoice details: resposta inválida"));
          }
        });
      }
    );
    req.on("error", reject);
    req.end();
  });
}

// Backfill helpers: list + details
export async function listImplantationInvoicesFromCora(params: {
  companyId: string;
  cnpjDigits: string;
  start: string;
  end: string;
}): Promise<CoraInvoiceListResponse> {
  // A API de lista usa o CNPJ no filtro "search".
  return getInvoicesMtls({
    start: params.start,
    end: params.end,
    search: params.cnpjDigits,
    perPage: 200,
  });
}

export async function getInvoiceDetailsFromCoraMtls(invoiceId: string): Promise<CoraInvoiceResponse> {
  return getInvoiceDetailsMtls(invoiceId);
}
