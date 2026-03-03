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
    const errData = data as { error?: string } | undefined;
    const errMsg =
      (errData && typeof errData.error === "string" ? errData.error : text) ||
      res.statusText;
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

export type ChatbotTrigger = {
  id?: string;
  active?: boolean;
  type: "agent" | "quickreply" | "flow";
  agent_id?: string;
  quickreply_id?: string;
  flow_id?: string;
  wordsToStart?: string;
  ignoreGroups?: boolean;
  lead_field?: string;
  lead_operator?: string;
  lead_value?: string;
  priority?: number;
  responseDelay_seconds?: number;
  [key: string]: unknown;
};

export type QuickReply = {
  id?: string;
  onWhatsApp?: boolean;
  docName?: string;
  file?: string;
  shortCut: string;
  text?: string;
  type?: string;
  owner?: string;
  created?: string;
  updated?: string;
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
 * Desconecta a instância do WhatsApp (exige novo QR para reconectar).
 */
export async function disconnectInstance(token: string): Promise<{
  ok: boolean;
  instance?: InstanceResponse;
  error?: string;
}> {
  const { data, ok, error, status } = await uazapiFetch<{ instance?: InstanceResponse }>("/instance/disconnect", {
    method: "POST",
    token,
  });
  return {
    ok,
    instance: data?.instance,
    error: ok ? undefined : (error ?? `HTTP ${status}`),
  };
}

/**
 * Lista todos os triggers de chatbot da instância autenticada.
 */
export async function listTriggers(
  token: string
): Promise<{ ok: boolean; data?: ChatbotTrigger[]; error?: string }> {
  const { data, ok, error, status } = await uazapiFetch<ChatbotTrigger[]>("/trigger/list", { token });
  return {
    ok,
    data: ok && Array.isArray(data) ? data : undefined,
    error: ok ? undefined : (error ?? `HTTP ${status}`),
  };
}

/**
 * Cria, atualiza ou exclui um trigger de chatbot.
 * Body segue o schema da UAZAPI: { id?, delete?, trigger: ChatbotTrigger }
 */
export async function editTrigger(
  token: string,
  payload: { id?: string; delete?: boolean; trigger: ChatbotTrigger }
): Promise<{ ok: boolean; data?: ChatbotTrigger; error?: string }> {
  const { data, ok, error, status } = await uazapiFetch<ChatbotTrigger>("/trigger/edit", {
    method: "POST",
    token,
    body: payload,
  });
  return {
    ok,
    data: ok ? data : undefined,
    error: ok ? undefined : (error ?? `HTTP ${status}`),
  };
}

/**
 * Lista todas as respostas rápidas (QuickReply) da instância autenticada.
 */
export async function listQuickReplies(
  token: string
): Promise<{ ok: boolean; data?: QuickReply[]; error?: string }> {
  const { data, ok, error, status } = await uazapiFetch<QuickReply[]>("/quickreply/showall", { token });
  return {
    ok,
    data: ok && Array.isArray(data) ? data : undefined,
    error: ok ? undefined : (error ?? `HTTP ${status}`),
  };
}

/**
 * Cria, atualiza ou exclui uma resposta rápida.
 * Body segue o schema da UAZAPI: { id?, delete?, shortCut, type, text?, file? }
 */
export async function editQuickReply(
  token: string,
  payload: {
    id?: string;
    delete?: boolean;
    shortCut: string;
    type: string;
    text?: string;
    file?: string;
  }
): Promise<{ ok: boolean; data?: QuickReply; error?: string }> {
  const { data, ok, error, status } = await uazapiFetch<QuickReply>("/quickreply/edit", {
    method: "POST",
    token,
    body: payload,
  });
  return {
    ok,
    data: ok ? data : undefined,
    error: ok ? undefined : (error ?? `HTTP ${status}`),
  };
}

/**
 * Deleta a instância da UAZAPI (remove do servidor).
 */
export async function deleteInstance(token: string): Promise<{
  ok: boolean;
  error?: string;
}> {
  const { ok, error, status } = await uazapiFetch("/instance", {
    method: "DELETE",
    token,
  });
  return {
    ok,
    error: ok ? undefined : (error ?? `HTTP ${status}`),
  };
}

/**
 * Atualiza o nome da instância na UAZAPI.
 */
export async function updateInstanceName(
  token: string,
  name: string
): Promise<{ ok: boolean; instance?: InstanceResponse; error?: string }> {
  const { data, ok, error, status } = await uazapiFetch<{ instance?: InstanceResponse }>("/instance/updateInstanceName", {
    method: "POST",
    token,
    body: { name: name.trim() },
  });
  return {
    ok,
    instance: data?.instance,
    error: ok ? undefined : (error ?? `HTTP ${status}`),
  };
}

/**
 * Atualiza o nome do perfil do WhatsApp (exibido para contatos).
 */
export async function updateProfileName(
  token: string,
  name: string
): Promise<{ ok: boolean; error?: string }> {
  const { ok, error, status } = await uazapiFetch("/profile/name", {
    method: "POST",
    token,
    body: { name: name.trim().slice(0, 25) },
  });
  return { ok, error: ok ? undefined : (error ?? `HTTP ${status}`) };
}

/**
 * Atualiza a imagem do perfil do WhatsApp (URL, base64 ou "remove").
 */
export async function updateProfileImage(
  token: string,
  image: string
): Promise<{ ok: boolean; error?: string }> {
  const { ok, error, status } = await uazapiFetch("/profile/image", {
    method: "POST",
    token,
    body: { image },
  });
  return { ok, error: ok ? undefined : (error ?? `HTTP ${status}`) };
}

/**
 * Obtém configuração de proxy da instância.
 */
export async function getProxyConfig(token: string): Promise<{
  ok: boolean;
  data?: { enabled?: boolean; proxy_url?: string; last_test_at?: number; last_test_error?: string; validation_error?: boolean };
  error?: string;
}> {
  const { data, ok, error, status } = await uazapiFetch<{
    enabled?: boolean;
    proxy_url?: string;
    last_test_at?: number;
    last_test_error?: string;
    validation_error?: boolean;
  }>("/instance/proxy", { token });
  return {
    ok,
    data: ok ? data : undefined,
    error: ok ? undefined : (error ?? `HTTP ${status}`),
  };
}

/**
 * Configura proxy da instância.
 */
export async function updateProxyConfig(
  token: string,
  options: { enable: boolean; proxy_url?: string }
): Promise<{ ok: boolean; data?: unknown; error?: string }> {
  const { data, ok, error, status } = await uazapiFetch("/instance/proxy", {
    method: "POST",
    token,
    body: options,
  });
  return {
    ok,
    data: ok ? data : undefined,
    error: ok ? undefined : (error ?? `HTTP ${status}`),
  };
}

/**
 * Remove proxy configurado (volta ao padrão).
 */
export async function deleteProxyConfig(token: string): Promise<{ ok: boolean; error?: string }> {
  const { ok, error, status } = await uazapiFetch("/instance/proxy", {
    method: "DELETE",
    token,
  });
  return { ok, error: ok ? undefined : (error ?? `HTTP ${status}`) };
}

/**
 * Obtém configurações de privacidade da instância.
 */
export async function getInstancePrivacy(token: string): Promise<{
  ok: boolean;
  data?: Record<string, string>;
  error?: string;
}> {
  const { data, ok, error, status } = await uazapiFetch<Record<string, string>>("/instance/privacy", { token });
  return {
    ok,
    data: ok ? data : undefined,
    error: ok ? undefined : (error ?? `HTTP ${status}`),
  };
}

/**
 * Atualiza configurações de privacidade.
 * Campos: groupadd, last, status, profile, readreceipts, online, calladd
 */
export async function setInstancePrivacy(
  token: string,
  settings: Record<string, string>
): Promise<{ ok: boolean; data?: Record<string, string>; error?: string }> {
  const { data, ok, error, status } = await uazapiFetch<Record<string, string>>("/instance/privacy", {
    method: "POST",
    token,
    body: settings,
  });
  return {
    ok,
    data: ok ? data : undefined,
    error: ok ? undefined : (error ?? `HTTP ${status}`),
  };
}

/**
 * Atualiza presença global (available | unavailable).
 */
export async function updateInstancePresence(
  token: string,
  presence: "available" | "unavailable"
): Promise<{ ok: boolean; error?: string }> {
  const { ok, error, status } = await uazapiFetch("/instance/presence", {
    method: "POST",
    token,
    body: { presence },
  });
  return { ok, error: ok ? undefined : (error ?? `HTTP ${status}`) };
}

/** Contato retornado por GET /contacts */
export type UazapiContact = {
  jid?: string;
  contactName?: string;
  contact_FirstName?: string;
  contact_name?: string;
};

/**
 * Lista contatos da instância (agenda do WhatsApp).
 * GET /contacts - lista completa sem paginação.
 */
export async function listContacts(token: string): Promise<{
  ok: boolean;
  data?: UazapiContact[];
  error?: string;
}> {
  const { data, ok, error, status } = await uazapiFetch<UazapiContact[] | { contacts?: UazapiContact[] }>("/contacts", { token });
  const list = Array.isArray(data) ? data : data?.contacts;
  return {
    ok,
    data: ok && Array.isArray(list) ? list : undefined,
    error: ok ? undefined : (error ?? `HTTP ${status}`),
  };
}

/** Grupo retornado por GET /group/list */
export type UazapiGroup = {
  JID?: string;
  Name?: string;
  Topic?: string;
  invite_link?: string;
  OwnerIsAdmin?: boolean;
  Participants?: unknown[];
  [key: string]: unknown;
};

/**
 * Lista grupos da instância (grupos que o número participa).
 * GET /group/list - force=true para atualizar cache.
 */
export async function listGroups(
  token: string,
  opts?: { force?: boolean; noparticipants?: boolean }
): Promise<{ ok: boolean; data?: UazapiGroup[]; error?: string }> {
  const params = new URLSearchParams();
  if (opts?.force) params.set("force", "true");
  if (opts?.noparticipants) params.set("noparticipants", "true");
  const qs = params.toString();
  const path = qs ? `/group/list?${qs}` : "/group/list";
  const { data, ok, error, status } = await uazapiFetch<{ groups?: UazapiGroup[] } | UazapiGroup[]>(path, { token });
  const list = Array.isArray(data) ? data : (data && typeof data === "object" && "groups" in data ? (data as { groups?: UazapiGroup[] }).groups : undefined);
  return {
    ok,
    data: ok && Array.isArray(list) ? list : undefined,
    error: ok ? undefined : (error ?? `HTTP ${status}`),
  };
}

/**
 * Configura delay entre mensagens na fila (msg_delay_min, msg_delay_max em segundos).
 */
export async function updateDelaySettings(
  token: string,
  msg_delay_min: number,
  msg_delay_max: number
): Promise<{ ok: boolean; instance?: InstanceResponse; error?: string }> {
  const { data, ok, error, status } = await uazapiFetch<{ instance?: InstanceResponse }>("/instance/updateDelaySettings", {
    method: "POST",
    token,
    body: { msg_delay_min: Math.max(0, msg_delay_min), msg_delay_max: Math.max(0, msg_delay_max) },
  });
  return {
    ok,
    instance: data?.instance,
    error: ok ? undefined : (error ?? `HTTP ${status}`),
  };
}

/**
 * Atualiza configurações do chatbot da instância.
 */
export async function updateChatbotSettings(
  token: string,
  settings: {
    openai_apikey?: string;
    chatbot_enabled?: boolean;
    chatbot_ignoreGroups?: boolean;
    chatbot_stopConversation?: string;
    chatbot_stopMinutes?: number;
    chatbot_stopWhenYouSendMsg?: number;
  }
): Promise<{ ok: boolean; instance?: InstanceResponse; error?: string }> {
  const { data, ok, error, status } = await uazapiFetch<{ instance?: InstanceResponse }>("/instance/updatechatbotsettings", {
    method: "POST",
    token,
    body: settings,
  });
  return {
    ok,
    instance: data?.instance,
    error: ok ? undefined : (error ?? `HTTP ${status}`),
  };
}

/**
 * Atualiza o mapa de campos (labels) customizados para leads (lead_field01–20).
 */
export async function updateFieldsMap(
  token: string,
  fields: Record<string, string>
): Promise<{ ok: boolean; instance?: InstanceResponse; error?: string }> {
  const { data, ok, error, status } = await uazapiFetch<{ instance?: InstanceResponse }>("/instance/updateFieldsMap", {
    method: "POST",
    token,
    body: fields,
  });
  return {
    ok,
    instance: data?.instance,
    error: ok ? undefined : (error ?? `HTTP ${status}`),
  };
}

/**
 * Obtém webhooks configurados na instância.
 */
export async function getWebhook(token: string): Promise<{
  ok: boolean;
  data?: Array<{ id?: string; url?: string; events?: string[]; enabled?: boolean; excludeMessages?: string[] }>;
  error?: string;
}> {
  const { data, ok, error, status } = await uazapiFetch<Array<{
    id?: string;
    url?: string;
    events?: string[];
    enabled?: boolean;
    excludeMessages?: string[];
  }>>("/webhook", { token });
  return {
    ok,
    data: ok ? (Array.isArray(data) ? data : []) : undefined,
    error: ok ? undefined : (error ?? `HTTP ${status}`),
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
  listTriggers,
  editTrigger,
  listQuickReplies,
  editQuickReply,
};
