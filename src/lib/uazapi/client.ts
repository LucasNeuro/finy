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

/** Timeout em ms para requisições à UAZAPI (evita Connect Timeout longo). */
const UAZAPI_FETCH_TIMEOUT_MS = Number(process.env.UAZAPI_FETCH_TIMEOUT_MS) || 25_000;

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

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), UAZAPI_FETCH_TIMEOUT_MS);

  let res: Response;
  try {
    res = await fetch(url, {
      method: options.method ?? "GET",
      headers,
      body: options.body != null ? JSON.stringify(options.body) : undefined,
      signal: controller.signal,
    });
  } catch (err) {
    clearTimeout(timeoutId);
    const isAbort = err instanceof Error && err.name === "AbortError";
    const message =
      isAbort
        ? "Timeout ao conectar na UAZAPI. Tente novamente."
        : err instanceof Error
          ? err.message
          : "Erro de rede ao chamar UAZAPI";
    return { ok: false, status: 0, error: message };
  }
  clearTimeout(timeoutId);

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
 * Body segue o schema da UAZAPI: { id?, delete?, shortCut, type, text?, file?, docName? }
 * Resposta 200: { message, quickReplies: [ {...} ] } — normalizamos para o primeiro item.
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
    docName?: string;
  }
): Promise<{ ok: boolean; data?: QuickReply; error?: string }> {
  const body = { ...payload };
  if (body.id === undefined) delete body.id;
  if (body.delete === undefined) delete body.delete;
  if (body.text === undefined) delete body.text;
  if (body.file === undefined) delete body.file;
  if (body.docName === undefined) delete body.docName;

  type UazapiEditResponse = { message?: string; quickReplies?: QuickReply[] };
  const { data: raw, ok, error, status } = await uazapiFetch<QuickReply | UazapiEditResponse>("/quickreply/edit", {
    method: "POST",
    token,
    body,
  });

  if (!ok) {
    return {
      ok: false,
      error: error ?? `HTTP ${status}`,
    };
  }

  const qr: QuickReply | undefined = Array.isArray((raw as UazapiEditResponse)?.quickReplies)
    ? (raw as UazapiEditResponse).quickReplies![0]
    : (raw as QuickReply);
  return {
    ok: true,
    data: qr,
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
 * Detalhes completos do chat/contato (POST /chat/details).
 * number: telefone (ex: 5511999999999) ou ID do grupo (ex: 120363123456789012@g.us).
 * preview: true para imagem em tamanho preview (menor).
 */
export type ChatDetails = {
  id?: string;
  wa_fastid?: string;
  wa_chatid?: string;
  wa_archived?: boolean;
  wa_contactName?: string;
  wa_name?: string;
  name?: string;
  pushName?: string;
  contactName?: string;
  contact_name?: string;
  shortName?: string;
  image?: string;
  imagePreview?: string;
  phone?: string;
  owner?: string;
  wa_isBlocked?: boolean;
  wa_isGroup?: boolean;
  wa_isGroup_admin?: boolean;
  wa_isGroup_announce?: boolean;
  wa_isGroup_community?: boolean;
  wa_isGroup_member?: boolean;
  wa_isPinned?: boolean;
  wa_unreadCount?: number;
  wa_muteEndTime?: number;
  wa_lastMessageTextVote?: string;
  wa_lastMessageType?: string;
  wa_lastMsgTimestamp?: number;
  wa_lastMessageSender?: string;
  wa_label?: string[];
  common_groups?: string;
  lead_name?: string;
  lead_fullName?: string;
  lead_email?: string;
  lead_status?: string;
  lead_notes?: string;
  lead_tags?: string[];
  lead_field01?: string;
  lead_field02?: string;
  lead_field03?: string;
  lead_field04?: string;
  lead_field05?: string;
  chatbot_summary?: string;
  chatbot_lastTrigger_id?: string;
  chatbot_disableUntil?: number;
  [key: string]: unknown;
};

/** Extrai nome do contato da resposta getChatDetails (UAZAPI pode retornar em vários campos). */
export function extractContactNameFromDetails(data: ChatDetails | undefined): string | null {
  if (!data) return null;
  const raw =
    data.wa_contactName ?? data.wa_name ?? data.name ?? data.pushName ?? data.contactName
    ?? data.contact_name ?? data.shortName ?? null;
  return (typeof raw === "string" && raw.trim()) ? raw.trim() : null;
}

export async function getChatDetails(
  token: string,
  number: string,
  opts?: { preview?: boolean }
): Promise<{ ok: boolean; data?: ChatDetails; error?: string }> {
  const { data, ok, error, status } = await uazapiFetch<ChatDetails>("/chat/details", {
    method: "POST",
    token,
    body: { number: number.trim(), preview: opts?.preview ?? false },
  });
  return {
    ok,
    data: ok ? data : undefined,
    error: ok ? undefined : (error ?? `HTTP ${status}`),
  };
}

/**
 * Bloqueia ou desbloqueia contato (POST /chat/block).
 * number: telefone ou JID (ex: 5511999999999 ou 5511999999999@s.whatsapp.net).
 */
export async function blockChat(
  token: string,
  number: string,
  block: boolean
): Promise<{ ok: boolean; error?: string }> {
  const { ok, error, status } = await uazapiFetch("/chat/block", {
    method: "POST",
    token,
    body: { number: number.trim(), block },
  });
  return { ok, error: ok ? undefined : (error ?? `HTTP ${status}`) };
}

/**
 * Adiciona contato à agenda do WhatsApp (POST /contact/add).
 * phone: formato internacional (ex: 5511999999999) ou JID.
 * name: nome completo (usado como primeiro nome e nome completo).
 */
export async function addContactToAgenda(
  token: string,
  phone: string,
  name: string
): Promise<{ ok: boolean; data?: unknown; error?: string }> {
  const number = phone.trim().replace(/@s\.whatsapp\.net$/, "");
  const { data, ok, error, status } = await uazapiFetch("/contact/add", {
    method: "POST",
    token,
    body: { phone: number, name: (name || number).trim() },
  });
  return { ok, data: ok ? data : undefined, error: ok ? undefined : (error ?? `HTTP ${status}`) };
}

/**
 * Remove contato da agenda do WhatsApp (POST /contact/remove).
 */
export async function removeContactFromAgenda(
  token: string,
  phone: string
): Promise<{ ok: boolean; error?: string }> {
  const number = phone.trim().replace(/@s\.whatsapp\.net$/, "");
  const { ok, error, status } = await uazapiFetch("/contact/remove", {
    method: "POST",
    token,
    body: { phone: number },
  });
  return { ok, error: ok ? undefined : (error ?? `HTTP ${status}`) };
}

/** Arquivar ou desarquivar chat (POST /chat/archive). */
export async function archiveChat(
  token: string,
  number: string,
  archive: boolean
): Promise<{ ok: boolean; error?: string }> {
  const { ok, error, status } = await uazapiFetch("/chat/archive", {
    method: "POST",
    token,
    body: { number: number.trim(), archive },
  });
  return { ok, error: ok ? undefined : (error ?? `HTTP ${status}`) };
}

/** Marcar chat como lido/não lido (POST /chat/read). */
export async function markChatRead(
  token: string,
  number: string,
  read: boolean
): Promise<{ ok: boolean; error?: string }> {
  const { ok, error, status } = await uazapiFetch("/chat/read", {
    method: "POST",
    token,
    body: { number: number.trim(), read },
  });
  return { ok, error: ok ? undefined : (error ?? `HTTP ${status}`) };
}

/** Silenciar chat (POST /chat/mute). muteEndTime: 0=off, 8=8h, 168=1semana, -1=permanente. */
export async function muteChat(
  token: string,
  number: string,
  muteEndTime: number
): Promise<{ ok: boolean; error?: string }> {
  const { ok, error, status } = await uazapiFetch("/chat/mute", {
    method: "POST",
    token,
    body: { number: number.trim(), muteEndTime },
  });
  return { ok, error: ok ? undefined : (error ?? `HTTP ${status}`) };
}

/** Fixar ou desafixar chat (POST /chat/pin). */
export async function pinChat(
  token: string,
  number: string,
  pin: boolean
): Promise<{ ok: boolean; error?: string }> {
  const { ok, error, status } = await uazapiFetch("/chat/pin", {
    method: "POST",
    token,
    body: { number: number.trim(), pin },
  });
  return { ok, error: ok ? undefined : (error ?? `HTTP ${status}`) };
}

/** Deletar chat no WhatsApp (POST /chat/delete). */
export async function deleteChat(
  token: string,
  number: string,
  opts?: { deleteChatDB?: boolean; deleteMessagesDB?: boolean; deleteChatWhatsApp?: boolean }
): Promise<{ ok: boolean; error?: string }> {
  const body: Record<string, unknown> = { number: number.trim(), ...opts };
  const { ok, error, status } = await uazapiFetch("/chat/delete", {
    method: "POST",
    token,
    body,
  });
  return { ok, error: ok ? undefined : (error ?? `HTTP ${status}`) };
}

/** Alias para compatibilidade com imports antigos (ex.: deploy Render). */
export { deleteChat as uazapiDeleteChat };

/**
 * Lista contatos bloqueados (GET /chat/blocklist).
 */
export async function getBlocklist(token: string): Promise<{
  ok: boolean;
  data?: string[];
  error?: string;
}> {
  const { data, ok, error, status } = await uazapiFetch<{ blockList?: string[] }>("/chat/blocklist", { token });
  const list = data?.blockList ?? (Array.isArray(data) ? data : undefined);
  return {
    ok,
    data: ok && Array.isArray(list) ? list : undefined,
    error: ok ? undefined : (error ?? `HTTP ${status}`),
  };
}

/**
 * Sair de um grupo (POST /group/leave).
 * groupjid: ID do grupo (ex: 120363324255083289@g.us).
 */
export async function leaveGroup(
  token: string,
  groupjid: string
): Promise<{ ok: boolean; error?: string }> {
  const { ok, error, status } = await uazapiFetch("/group/leave", {
    method: "POST",
    token,
    body: { groupjid: groupjid.trim() },
  });
  return { ok, error: ok ? undefined : (error ?? `HTTP ${status}`) };
}

/**
 * Criar um novo grupo (POST /group/create).
 * name: 1–100 caracteres. participants: números sem formatação (mín. 1, máx. 50).
 */
export async function createGroup(
  token: string,
  params: { name: string; participants: string[] }
): Promise<{ ok: boolean; data?: UazapiGroupInfo; error?: string }> {
  const name = params.name.trim().slice(0, 100);
  const participants = params.participants
    .map((p) => p.replace(/\D/g, ""))
    .filter(Boolean);
  if (!name) {
    return { ok: false, error: "Nome do grupo é obrigatório" };
  }
  if (participants.length === 0) {
    return { ok: false, error: "Adicione pelo menos um participante" };
  }
  const { data, ok, error, status } = await uazapiFetch<UazapiGroupInfo | { group?: UazapiGroupInfo }>("/group/create", {
    method: "POST",
    token,
    body: { name, participants },
  });
  const group = data && typeof data === "object" && "JID" in data ? data as UazapiGroupInfo : (data as { group?: UazapiGroupInfo })?.group;
  return {
    ok,
    data: ok ? group : undefined,
    error: ok ? undefined : (error ?? `HTTP ${status}`),
  };
}

/**
 * Entrar em um grupo por link/código de convite (POST /group/join).
 * invitecode: código (ex: IYnl5Zg9bUcJD32rJrDzO7) ou URL completa (https://chat.whatsapp.com/...).
 */
export async function joinGroup(
  token: string,
  invitecode: string
): Promise<{ ok: boolean; data?: UazapiGroupInfo; error?: string }> {
  const code = invitecode.trim();
  if (!code) {
    return { ok: false, error: "Código ou link de convite é obrigatório" };
  }
  const { data, ok, error, status } = await uazapiFetch<UazapiGroupInfo | { group?: UazapiGroupInfo }>("/group/join", {
    method: "POST",
    token,
    body: { invitecode: code },
  });
  const group = data && typeof data === "object" && "JID" in data ? data as UazapiGroupInfo : (data as { group?: UazapiGroupInfo })?.group;
  return {
    ok,
    data: ok ? group : undefined,
    error: ok ? undefined : (error ?? `HTTP ${status}`),
  };
}

/**
 * Criar uma comunidade (POST /community/create).
 * A instância vira admin; a comunidade começa com o grupo de anúncios.
 */
export async function createCommunity(
  token: string,
  name: string
): Promise<{ ok: boolean; data?: UazapiGroupInfo; error?: string }> {
  const n = name.trim().slice(0, 100);
  if (!n) return { ok: false, error: "Nome da comunidade é obrigatório" };
  const { data, ok, error, status } = await uazapiFetch<UazapiGroupInfo | { group?: UazapiGroupInfo }>("/community/create", {
    method: "POST",
    token,
    body: { name: n },
  });
  const group = data && typeof data === "object" && "JID" in data ? data as UazapiGroupInfo : (data as { group?: UazapiGroupInfo })?.group;
  return { ok, data: ok ? group : undefined, error: ok ? undefined : (error ?? `HTTP ${status}`) };
}

/**
 * Gerenciar grupos em uma comunidade (POST /community/editgroups).
 * action: 'add' | 'remove', groupjids: JIDs dos grupos.
 */
export async function editCommunityGroups(
  token: string,
  params: { community: string; action: "add" | "remove"; groupjids: string[] }
): Promise<{ ok: boolean; success?: string[]; failed?: string[]; error?: string }> {
  const community = params.community.trim();
  const groupjids = params.groupjids.map((j) => j.trim()).filter((j) => j.endsWith("@g.us"));
  if (!community || !community.endsWith("@g.us")) return { ok: false, error: "JID da comunidade inválido" };
  if (groupjids.length === 0) return { ok: false, error: "Informe ao menos um grupo (JID)" };
  const { data, ok, error, status } = await uazapiFetch<{ success?: string[]; failed?: string[] }>("/community/editgroups", {
    method: "POST",
    token,
    body: { community, action: params.action, groupjids },
  });
  return {
    ok,
    success: data?.success,
    failed: data?.failed,
    error: ok ? undefined : (error ?? `HTTP ${status}`),
  };
}

/** Participante retornado por POST /group/info */
export type UazapiGroupParticipant = {
  JID?: string;
  IsAdmin?: boolean;
  [key: string]: unknown;
};

/** Resposta de POST /group/info (e outros update) */
export type UazapiGroupInfo = {
  JID?: string;
  Name?: string;
  Topic?: string;
  InviteLink?: string;
  IsLocked?: boolean;
  IsAnnounce?: boolean;
  IsCommunity?: boolean;
  Participants?: UazapiGroupParticipant[];
  [key: string]: unknown;
};

/**
 * Obter informações detalhadas do grupo (POST /group/info).
 * Inclui participantes e link de convite se solicitado.
 */
export async function getGroupInfo(
  token: string,
  groupjid: string,
  options?: { getInviteLink?: boolean; getRequestsParticipants?: boolean; force?: boolean }
): Promise<{ ok: boolean; data?: UazapiGroupInfo; error?: string }> {
  const { data, ok, error, status } = await uazapiFetch<UazapiGroupInfo>("/group/info", {
    method: "POST",
    token,
    body: {
      groupjid: groupjid.trim(),
      getInviteLink: options?.getInviteLink ?? true,
      getRequestsParticipants: options?.getRequestsParticipants ?? false,
      force: options?.force ?? false,
    },
  });
  return { ok, data: ok ? data : undefined, error: ok ? undefined : (error ?? `HTTP ${status}`) };
}

/**
 * Resetar código de convite do grupo (POST /group/resetInviteCode). Apenas admins.
 */
export async function resetGroupInviteCode(
  token: string,
  groupjid: string
): Promise<{ ok: boolean; inviteLink?: string; data?: UazapiGroupInfo; error?: string }> {
  const { data, ok, error, status } = await uazapiFetch<{ InviteLink?: string; group?: UazapiGroupInfo }>("/group/resetInviteCode", {
    method: "POST",
    token,
    body: { groupjid: groupjid.trim() },
  });
  const inviteLink = data?.InviteLink ?? (data as { InviteLink?: string })?.InviteLink;
  return {
    ok,
    inviteLink,
    data: data?.group ?? data as UazapiGroupInfo,
    error: ok ? undefined : (error ?? `HTTP ${status}`),
  };
}

/**
 * Configurar permissões de envio (apenas admins podem enviar) - POST /group/updateAnnounce.
 */
export async function updateGroupAnnounce(
  token: string,
  groupjid: string,
  announce: boolean
): Promise<{ ok: boolean; data?: UazapiGroupInfo; error?: string }> {
  const { data, ok, error, status } = await uazapiFetch<{ group?: UazapiGroupInfo }>("/group/updateAnnounce", {
    method: "POST",
    token,
    body: { groupjid: groupjid.trim(), announce },
  });
  return { ok, data: data?.group ?? (data as UazapiGroupInfo), error: ok ? undefined : (error ?? `HTTP ${status}`) };
}

/**
 * Atualizar descrição do grupo - POST /group/updateDescription. Apenas admins.
 */
export async function updateGroupDescription(
  token: string,
  groupjid: string,
  description: string
): Promise<{ ok: boolean; data?: UazapiGroupInfo; error?: string }> {
  const { data, ok, error, status } = await uazapiFetch<{ group?: UazapiGroupInfo }>("/group/updateDescription", {
    method: "POST",
    token,
    body: { groupjid: groupjid.trim(), description: description.slice(0, 512) },
  });
  return { ok, data: data?.group ?? (data as UazapiGroupInfo), error: ok ? undefined : (error ?? `HTTP ${status}`) };
}

/**
 * Atualizar imagem do grupo - POST /group/updateImage. URL, base64 ou "remove". Apenas admins.
 */
export async function updateGroupImage(
  token: string,
  groupjid: string,
  image: string
): Promise<{ ok: boolean; data?: UazapiGroupInfo; error?: string }> {
  const { data, ok, error, status } = await uazapiFetch<{ group?: UazapiGroupInfo }>("/group/updateImage", {
    method: "POST",
    token,
    body: { groupjid: groupjid.trim(), image },
  });
  return { ok, data: data?.group ?? (data as UazapiGroupInfo), error: ok ? undefined : (error ?? `HTTP ${status}`) };
}

/**
 * Configurar permissão de edição (apenas admins editam nome/desc/imagem) - POST /group/updateLocked.
 */
export async function updateGroupLocked(
  token: string,
  groupjid: string,
  locked: boolean
): Promise<{ ok: boolean; data?: UazapiGroupInfo; error?: string }> {
  const { data, ok, error, status } = await uazapiFetch<{ group?: UazapiGroupInfo }>("/group/updateLocked", {
    method: "POST",
    token,
    body: { groupjid: groupjid.trim(), locked },
  });
  return { ok, data: data?.group ?? (data as UazapiGroupInfo), error: ok ? undefined : (error ?? `HTTP ${status}`) };
}

/**
 * Atualizar nome do grupo - POST /group/updateName. Apenas admins. 1–25 caracteres.
 */
export async function updateGroupName(
  token: string,
  groupjid: string,
  name: string
): Promise<{ ok: boolean; data?: UazapiGroupInfo; error?: string }> {
  const { data, ok, error, status } = await uazapiFetch<{ group?: UazapiGroupInfo }>("/group/updateName", {
    method: "POST",
    token,
    body: { groupjid: groupjid.trim(), name: name.slice(0, 25).trim() },
  });
  return { ok, data: data?.group ?? (data as UazapiGroupInfo), error: ok ? undefined : (error ?? `HTTP ${status}`) };
}

/**
 * Gerenciar participantes - POST /group/updateParticipants.
 * action: add | remove | promote | demote | approve | reject. participants: array de JIDs ou números.
 */
export async function updateGroupParticipants(
  token: string,
  groupjid: string,
  action: "add" | "remove" | "promote" | "demote" | "approve" | "reject",
  participants: string[]
): Promise<{ ok: boolean; data?: UazapiGroupInfo; error?: string }> {
  const { data, ok, error, status } = await uazapiFetch<{ group?: UazapiGroupInfo }>("/group/updateParticipants", {
    method: "POST",
    token,
    body: { groupjid: groupjid.trim(), action, participants },
  });
  return { ok, data: data?.group ?? (data as UazapiGroupInfo), error: ok ? undefined : (error ?? `HTTP ${status}`) };
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
 * Busca chats com filtros (POST /chat/find).
 * Útil para sincronizar histórico ao conectar.
 */
export type UazapiChat = {
  wa_chatid?: string;
  wa_contactName?: string;
  wa_name?: string;
  wa_isGroup?: boolean;
  wa_lastMsgTimestamp?: number;
  [key: string]: unknown;
};

export async function findChats(
  token: string,
  opts?: { limit?: number; offset?: number; sort?: string; wa_isGroup?: boolean }
): Promise<{ ok: boolean; data?: { chats?: UazapiChat[] }; error?: string }> {
  const { data, ok, error, status } = await uazapiFetch<{ chats?: UazapiChat[] }>("/chat/find", {
    method: "POST",
    token,
    body: {
      limit: opts?.limit ?? 50,
      offset: opts?.offset ?? 0,
      sort: opts?.sort ?? "-wa_lastMsgTimestamp",
      ...(opts?.wa_isGroup !== undefined && { wa_isGroup: opts.wa_isGroup }),
    },
  });
  return {
    ok,
    data,
    error: ok ? undefined : (error ?? `HTTP ${status}`),
  };
}

/**
 * Busca mensagens de um chat (POST /message/find).
 */
export type UazapiMessage = {
  id?: string;
  chatid?: string;
  from?: string;
  fromMe?: boolean;
  body?: string;
  text?: string;
  timestamp?: number;
  [key: string]: unknown;
};

export async function findMessages(
  token: string,
  chatid: string,
  opts?: { limit?: number; offset?: number }
): Promise<{ ok: boolean; data?: { messages?: UazapiMessage[] }; error?: string }> {
  const { data, ok, error, status } = await uazapiFetch<{ messages?: UazapiMessage[] }>("/message/find", {
    method: "POST",
    token,
    body: {
      chatid: chatid.trim(),
      limit: opts?.limit ?? 100,
      offset: opts?.offset ?? 0,
    },
  });
  return {
    ok,
    data,
    error: ok ? undefined : (error ?? `HTTP ${status}`),
  };
}

/**
 * Envia mensagem de texto (POST /send/text).
 * number: ID do chat — número internacional (ex: 5511999999999), JID de grupo (@g.us) ou @s.whatsapp.net / @lid.
 * Aceita opções: linkPreview, replyid, mentions, readchat, readmessages, delay, forward, track_source, track_id, async.
 */
export type SendTextOptions = {
  replyid?: string;
  delay?: number;
  linkPreview?: boolean;
  linkPreviewTitle?: string;
  linkPreviewDescription?: string;
  linkPreviewImage?: string;
  linkPreviewLarge?: boolean;
  mentions?: string;
  readchat?: boolean;
  readmessages?: boolean;
  forward?: boolean;
  track_source?: string;
  track_id?: string;
  async?: boolean;
};

export async function sendText(
  token: string,
  number: string,
  text: string,
  opts?: SendTextOptions
): Promise<{ ok: boolean; data?: unknown; error?: string }> {
  const normalizedNumber = number.includes("@") ? number : number.replace(/\D/g, "");
  const body: Record<string, unknown> = {
    number: normalizedNumber,
    text,
  };
  if (opts) {
    if (opts.replyid) body.replyid = opts.replyid;
    if (opts.delay != null) body.delay = opts.delay;
    if (opts.linkPreview != null) body.linkPreview = opts.linkPreview;
    if (opts.linkPreviewTitle != null) body.linkPreviewTitle = opts.linkPreviewTitle;
    if (opts.linkPreviewDescription != null) body.linkPreviewDescription = opts.linkPreviewDescription;
    if (opts.linkPreviewImage != null) body.linkPreviewImage = opts.linkPreviewImage;
    if (opts.linkPreviewLarge != null) body.linkPreviewLarge = opts.linkPreviewLarge;
    if (opts.mentions != null) body.mentions = opts.mentions;
    if (opts.readchat != null) body.readchat = opts.readchat;
    if (opts.readmessages != null) body.readmessages = opts.readmessages;
    if (opts.forward != null) body.forward = opts.forward;
    if (opts.track_source != null) body.track_source = opts.track_source;
    if (opts.track_id != null) body.track_id = opts.track_id;
    if (opts.async != null) body.async = opts.async;
  }
  const { data, ok, error, status } = await uazapiFetch("/send/text", {
    method: "POST",
    token,
    body,
  });
  return {
    ok,
    data,
    error: ok ? undefined : (error ?? `HTTP ${status}`),
  };
}

/**
 * Envia mídia (imagem, vídeo, áudio, documento, PTT, sticker) via UAZAPI.
 * number: telefone ou JID; type: image | video | document | audio | myaudio | ptt | ptv | sticker.
 */
export async function sendMedia(
  token: string,
  number: string,
  payload: {
    type: "image" | "video" | "document" | "audio" | "myaudio" | "ptt" | "ptv" | "sticker";
    file: string;
    text?: string;
    docName?: string;
    mimetype?: string;
    replyid?: string;
    delay?: number;
  }
): Promise<{ ok: boolean; data?: unknown; error?: string }> {
  const normalizedNumber = number.includes("@") ? number : number.replace(/\D/g, "");
  const { data, ok, error, status } = await uazapiFetch("/send/media", {
    method: "POST",
    token,
    body: {
      number: normalizedNumber,
      type: payload.type,
      file: payload.file,
      ...(payload.text != null && payload.text !== "" && { text: payload.text }),
      ...(payload.docName != null && payload.docName !== "" && { docName: payload.docName }),
      ...(payload.mimetype != null && payload.mimetype !== "" && { mimetype: payload.mimetype }),
      ...(payload.replyid && { replyid: payload.replyid }),
      ...(payload.delay != null && { delay: payload.delay }),
    },
  });
  return {
    ok,
    data,
    error: ok ? undefined : (error ?? `HTTP ${status}`),
  };
}

/**
 * Envia menu interativo (botões com URL, etc.).
 * POST /send/menu - type: "button", choices: ["Texto do botão|https://url.com"]
 */
export async function sendMenu(
  token: string,
  number: string,
  payload: {
    type: "button" | "list" | "poll" | "carousel";
    text: string;
    choices: string[];
    footerText?: string;
    listButton?: string;
    imageButton?: string;
    delay?: number;
  }
): Promise<{ ok: boolean; data?: unknown; error?: string }> {
  const normalizedNumber = number.replace(/\D/g, "");
  const { data, ok, error, status } = await uazapiFetch("/send/menu", {
    method: "POST",
    token,
    body: {
      number: normalizedNumber,
      type: payload.type,
      text: payload.text,
      choices: payload.choices,
      ...(payload.footerText && { footerText: payload.footerText }),
      ...(payload.listButton && { listButton: payload.listButton }),
      ...(payload.imageButton && { imageButton: payload.imageButton }),
      ...(payload.delay != null && { delay: payload.delay }),
    },
  });
  return {
    ok,
    data,
    error: ok ? undefined : (error ?? `HTTP ${status}`),
  };
}

/**
 * Baixa mídia de uma mensagem (UAZAPI POST /message/download).
 * id: ID da mensagem na UAZAPI (pode ser "owner:messageid" ou apenas messageid).
 * Retorna fileURL, mimetype, base64Data (se return_base64), transcription (se transcribe).
 */
export async function messageDownload(
  token: string,
  messageId: string,
  opts?: {
    return_base64?: boolean;
    return_link?: boolean;
    generate_mp3?: boolean;
    transcribe?: boolean;
    download_quoted?: boolean;
  }
): Promise<{
  ok: boolean;
  data?: { fileURL?: string; mimetype?: string; base64Data?: string; transcription?: string };
  error?: string;
}> {
  const { data, ok, error, status } = await uazapiFetch<{
    fileURL?: string;
    mimetype?: string;
    base64Data?: string;
    transcription?: string;
  }>("/message/download", {
    method: "POST",
    token,
    body: {
      id: messageId,
      ...(opts?.return_base64 != null && { return_base64: opts.return_base64 }),
      ...(opts?.return_link != null && { return_link: opts.return_link }),
      ...(opts?.generate_mp3 != null && { generate_mp3: opts.generate_mp3 }),
      ...(opts?.transcribe != null && { transcribe: opts.transcribe }),
      ...(opts?.download_quoted != null && { download_quoted: opts.download_quoted }),
    },
  });
  return {
    ok,
    data,
    error: ok ? undefined : (error ?? `HTTP ${status}`),
  };
}

/**
 * Envia presença "digitando" ou "gravando" por chat (UAZAPI POST /message/presence).
 * presence: "composing" | "recording" | "paused". delay: ms (máx 5 min).
 */
export async function sendMessagePresence(
  token: string,
  number: string,
  presence: "composing" | "recording" | "paused",
  delay?: number
): Promise<{ ok: boolean; error?: string }> {
  const normalizedNumber = number.includes("@") ? number : number.replace(/\D/g, "");
  const { ok, error, status } = await uazapiFetch("/message/presence", {
    method: "POST",
    token,
    body: {
      number: normalizedNumber,
      presence,
      ...(delay != null && delay >= 0 && { delay }),
    },
  });
  return { ok, error: ok ? undefined : (error ?? `HTTP ${status}`) };
}

/**
 * Envia reação (emoji) a uma mensagem. POST /message/react.
 * text: emoji (ex: "👍") ou "" para remover. id: ID da mensagem no WhatsApp (external_id).
 */
export async function sendReaction(
  token: string,
  number: string,
  messageId: string,
  emoji: string
): Promise<{ ok: boolean; data?: unknown; error?: string }> {
  const normalizedNumber = number.includes("@") ? number : number.replace(/\D/g, "");
  const { data, ok, error, status } = await uazapiFetch("/message/react", {
    method: "POST",
    token,
    body: {
      number: normalizedNumber,
      id: messageId,
      text: emoji ?? "",
    },
  });
  return {
    ok,
    data,
    error: ok ? undefined : (error ?? `HTTP ${status}`),
  };
}

/**
 * Apaga uma mensagem para todos (revoga no WhatsApp). POST /message/delete.
 * id: ID da mensagem na UAZAPI (external_id da mensagem).
 */
export async function deleteMessage(
  token: string,
  messageId: string
): Promise<{ ok: boolean; error?: string }> {
  const { ok, error, status } = await uazapiFetch("/message/delete", {
    method: "POST",
    token,
    body: { id: messageId },
  });
  return {
    ok,
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
  sendMedia,
  sendMenu,
  messageDownload,
  sendMessagePresence,
  sendReaction,
  deleteMessage,
  listTriggers,
  editTrigger,
  listQuickReplies,
  editQuickReply,
};
