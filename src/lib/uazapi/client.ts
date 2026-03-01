/**
 * Cliente central da API UAZAPI (motor WhatsApp da aplicação).
 * Usa UAZAPI_BASE_URL e UAZAPI_ADMIN_TOKEN do .env.
 * Spec: docs/uazapi-openapi-spec (8).yaml
 */

const getBaseUrl = (): string => {
  const url = process.env.UAZAPI_BASE_URL;
  if (!url?.trim()) return "https://free.uazapi.com";
  return url.replace(/\/$/, "");
};

const getAdminToken = (): string | undefined => {
  return process.env.UAZAPI_ADMIN_TOKEN?.trim() || undefined;
};

type RequestOptions = {
  method?: "GET" | "POST" | "PUT" | "DELETE" | "PATCH";
  body?: unknown;
  token?: string;
  admin?: boolean;
};

async function uazapiFetch<T = unknown>(
  path: string,
  options: RequestOptions = {}
): Promise<{ data?: T; ok: boolean; status: number; error?: string }> {
  const base = getBaseUrl();
  const url = path.startsWith("http") ? path : `${base}${path.startsWith("/") ? "" : "/"}${path}`;
  const adminToken = getAdminToken();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (options.admin && adminToken) {
    headers.admintoken = adminToken;
  } else if (options.token) {
    headers.token = options.token;
  }
  const res = await fetch(url, {
    method: options.method ?? "GET",
    headers,
    body: options.body != null ? JSON.stringify(options.body) : undefined,
  });
  let data: T | undefined;
  const text = await res.text();
  if (text) {
    try {
      data = JSON.parse(text) as T;
    } catch {
      // non-JSON response
    }
  }
  if (!res.ok) {
    const errMsg =
      (data && typeof (data as { error?: string }).error === "string"
        ? (data as { error: string }).error
        : text) || res.statusText;
    return { ok: false, status: res.status, error: errMsg, data };
  }
  return { ok: true, status: res.status, data };
}

// --- Admin (admintoken) ---

export type CreateInstanceBody = {
  name: string;
  systemName?: string;
  adminField01?: string;
  adminField02?: string;
};

export type InstanceResponse = {
  id?: string;
  token?: string;
  name?: string;
  status?: string;
  qrcode?: string;
  paircode?: string;
  [key: string]: unknown;
};

/**
 * Cria uma nova instância WhatsApp na UAZAPI (requer admintoken).
 */
export async function createInstance(
  body: CreateInstanceBody
): Promise<{ data?: InstanceResponse; token?: string; instance?: InstanceResponse; ok: boolean; error?: string }> {
  const { data, ok, status, error } = await uazapiFetch<{
    instance?: InstanceResponse;
    token?: string;
    name?: string;
    response?: string;
  }>("/instance/init", {
    method: "POST",
    body: {
      name: body.name.trim(),
      ...(body.systemName && { systemName: body.systemName }),
      ...(body.adminField01 != null && { adminField01: body.adminField01 }),
      ...(body.adminField02 != null && { adminField02: body.adminField02 }),
    },
    admin: true,
  });
  if (!ok) {
    return { ok: false, error: error ?? `HTTP ${status}` };
  }
  const instance = data?.instance ?? (data as unknown as InstanceResponse);
  const token = data?.token ?? instance?.token;
  return {
    ok: true,
    data: instance,
    instance,
    token: typeof token === "string" ? token : undefined,
  };
}

/**
 * Lista todas as instâncias (admin).
 */
export async function listInstances(): Promise<{
  ok: boolean;
  data?: InstanceResponse[];
  error?: string;
}> {
  const { data, ok, error, status } = await uazapiFetch<InstanceResponse[]>("/instance/all", { admin: true });
  return {
    ok,
    data: Array.isArray(data) ? data : undefined,
    error: ok ? undefined : (error ?? `HTTP ${status}`),
  };
}

// --- Instância (token da instância) ---

/**
 * Inicia conexão da instância (QR ou código de pareamento).
 */
export async function connectInstance(
  token: string,
  phone?: string
): Promise<{
  ok: boolean;
  qrcode?: string;
  paircode?: string;
  instance?: InstanceResponse;
  connected?: boolean;
  error?: string;
}> {
  const body = phone?.trim() ? { phone: phone.replace(/\D/g, "") } : undefined;
  const { data, ok, error, status } = await uazapiFetch<{
    instance?: InstanceResponse;
    connected?: boolean;
    qrcode?: string;
    paircode?: string;
  }>("/instance/connect", {
    method: "POST",
    body: body ?? {},
    token,
  });
  if (!ok) {
    return { ok: false, error: error ?? `HTTP ${status}` };
  }
  const inst = data?.instance;
  return {
    ok: true,
    qrcode: inst?.qrcode ?? data?.qrcode,
    paircode: inst?.paircode ?? data?.paircode,
    instance: inst,
    connected: data?.connected,
    error: undefined,
  };
}

/**
 * Status da instância (para renovar QR e ver connected).
 */
export async function getInstanceStatus(token: string): Promise<{
  ok: boolean;
  instance?: InstanceResponse;
  status?: { connected?: boolean; loggedIn?: boolean; jid?: unknown };
  error?: string;
}> {
  const { data, ok, error, status } = await uazapiFetch<{
    instance?: InstanceResponse;
    status?: { connected?: boolean; loggedIn?: boolean; jid?: unknown };
  }>("/instance/status", { token });
  if (!ok) {
    return { ok: false, error: error ?? `HTTP ${status}` };
  }
  return {
    ok: true,
    instance: data?.instance,
    status: data?.status,
    error: undefined,
  };
}

/**
 * Configura webhook da instância (recomendado: excludeMessages: ["wasSentByApi"]).
 */
export async function setWebhook(
  token: string,
  url: string,
  options: { events?: string[]; excludeMessages?: string[] } = {}
): Promise<{ ok: boolean; data?: unknown; error?: string }> {
  const { data, ok, error, status } = await uazapiFetch("/webhook", {
    method: "POST",
    token,
    body: {
      url: url.replace(/\/$/, ""),
      events: options.events ?? ["messages", "connection"],
      excludeMessages: options.excludeMessages ?? ["wasSentByApi"],
    },
  });
  return {
    ok,
    data,
    error: ok ? undefined : (error ?? `HTTP ${status}`),
  };
}

// --- Webhook global (admintoken) ---

export type GlobalWebhookConfig = {
  url: string;
  events: string[];
  excludeMessages?: string[];
  addUrlEvents?: boolean;
  addUrlTypesMessages?: boolean;
};

/**
 * Configura o webhook global do servidor UAZAPI (uma URL para todas as instâncias).
 * Recomendado: configurar uma vez e não usar setWebhook por instância.
 */
export async function setGlobalWebhook(
  webhookUrl: string,
  options: { events?: string[]; excludeMessages?: string[] } = {}
): Promise<{ ok: boolean; data?: unknown; error?: string }> {
  const { data, ok, error, status } = await uazapiFetch("/globalwebhook", {
    method: "POST",
    admin: true,
    body: {
      url: webhookUrl.replace(/\/$/, ""),
      events: options.events ?? ["messages", "connection"],
      excludeMessages: options.excludeMessages ?? ["wasSentByApi"],
    },
  });
  return {
    ok,
    data,
    error: ok ? undefined : (error ?? `HTTP ${status}`),
  };
}

/**
 * Retorna a configuração atual do webhook global (admin).
 */
export async function getGlobalWebhook(): Promise<{
  ok: boolean;
  data?: { url?: string; events?: string[]; enabled?: boolean; [key: string]: unknown };
  error?: string;
}> {
  const { data, ok, error, status } = await uazapiFetch<{
    url?: string;
    events?: string[];
    enabled?: boolean;
    [key: string]: unknown;
  }>("/globalwebhook", { admin: true });
  return {
    ok,
    data: ok ? data : undefined,
    error: ok ? undefined : (error ?? `HTTP ${status}`),
  };
}

/**
 * Envia mensagem de texto (token da instância).
 */
export async function sendText(
  token: string,
  number: string,
  text: string,
  opts?: { replyid?: string; delay?: number }
): Promise<{ ok: boolean; data?: unknown; error?: string }> {
  const normalizedNumber = number.replace(/\D/g, "");
  const { data, ok, error, status } = await uazapiFetch("/send/text", {
    method: "POST",
    token,
    body: {
      number: normalizedNumber,
      text,
      ...(opts?.replyid && { replyid: opts.replyid }),
      ...(opts?.delay != null && { delay: opts.delay }),
    },
  });
  return {
    ok,
    data,
    error: ok ? undefined : (error ?? `HTTP ${status}`),
  };
}

export const uazapi = {
  getBaseUrl,
  getAdminToken,
  createInstance,
  listInstances,
  connectInstance,
  getInstanceStatus,
  setWebhook,
  setGlobalWebhook,
  getGlobalWebhook,
  sendText,
};
