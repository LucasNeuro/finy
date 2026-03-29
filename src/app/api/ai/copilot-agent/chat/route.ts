import { getCompanyIdFromRequest } from "@/lib/auth/get-company";
import { requirePermission } from "@/lib/auth/get-profile";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { invokeCopilotEdge } from "@/lib/ai/copilot-edge";
import { mistralChatCompletion } from "@/lib/ai/mistral-chat-completions";
import { resolveCopilotAgent } from "@/lib/ai/resolve-copilot-agent";
import {
  mistralConversationAppend,
  mistralConversationStart,
} from "@/lib/ai/mistral-conversations";
import { getCopilotModuleEnabledForCompany } from "@/lib/company/copilot-module";
import {
  getServerAiApiKey,
  getServerAiKeySource,
  SERVER_AI_KEY_ENV_HINT,
} from "@/lib/ai/server-api-key";
import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { NextResponse } from "next/server";

const AI_BASE_URL =
  process.env.AI_BASE_URL?.replace(/\/+$/, "") ||
  process.env.MISTRAL_BASE_URL?.replace(/\/+$/, "") ||
  "https://api.mistral.ai/v1";

const MESSAGES_SELECT =
  "id, direction, content, sent_at, message_type, media_url, caption";
const FETCH_LIMIT = 120;
const TAIL = 50;
const MAX_LINE = 400;
const MAX_TRANSCRIPT = 12000;
const MAX_COPILOT_HISTORY_MSGS = 30;

const DEFAULT_CHAT_SYSTEM =
  "Você é um copiloto em português brasileiro. Ajude o atendente com sugestões; o cliente não lê suas respostas.";

type MsgRow = {
  direction: string;
  content: string | null;
  sent_at: string;
  message_type?: string | null;
  caption?: string | null;
};

function truncate(s: string, max: number): string {
  const t = s.replace(/\s+/g, " ").trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max)}…`;
}

function normalizeCopilotHistory(raw: unknown): { role: "user" | "assistant"; content: string }[] {
  if (!Array.isArray(raw)) return [];
  const out: { role: "user" | "assistant"; content: string }[] = [];
  for (const x of raw) {
    if (!x || typeof x !== "object") continue;
    const role = (x as { role?: string }).role;
    const content = (x as { content?: string }).content;
    if ((role !== "user" && role !== "assistant") || typeof content !== "string") continue;
    const c = content.trim();
    if (!c) continue;
    out.push({ role, content: c });
  }
  return out.slice(-MAX_COPILOT_HISTORY_MSGS);
}

function formatLine(m: MsgRow): string {
  const mt = (m.message_type || "text").toLowerCase();
  if (mt === "internal_note") {
    return `[Nota interna] ${truncate(m.content || "", MAX_LINE)}`;
  }
  const label = m.direction === "out" ? "Atendente" : "Cliente";
  if (mt !== "text" && mt) {
    const hint =
      mt === "image"
        ? "[imagem]"
        : mt === "audio" || mt === "ptt"
          ? "[áudio]"
          : mt === "video"
            ? "[vídeo]"
            : mt === "document"
              ? "[documento]"
              : `[${mt}]`;
    const extra = m.caption?.trim() || m.content?.trim();
    return `${label}: ${hint}${extra ? ` ${truncate(extra, MAX_LINE)}` : ""}`;
  }
  return `${label}: ${truncate(m.content || "", MAX_LINE)}`;
}

export async function POST(request: Request) {
  const companyId = await getCompanyIdFromRequest(request);
  if (!companyId) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }
  const readErr = await requirePermission(companyId, PERMISSIONS.inbox.read);
  if (readErr) {
    return NextResponse.json({ error: readErr.error }, { status: readErr.status });
  }
  const copilotPermErr = await requirePermission(companyId, PERMISSIONS.copilot.use);
  if (copilotPermErr) {
    return NextResponse.json({ error: copilotPermErr.error }, { status: copilotPermErr.status });
  }
  const copilotModuleOn = await getCopilotModuleEnabledForCompany(companyId);
  if (!copilotModuleOn) {
    return NextResponse.json(
      { error: "Módulo Copiloto desativado para esta empresa." },
      { status: 403 }
    );
  }

  const useCopilotEdge = Boolean(process.env.COPILOT_EDGE_FUNCTION_URL?.trim());
  const apiKey = getServerAiApiKey();
  if (!useCopilotEdge && !apiKey) {
    return NextResponse.json({ error: SERVER_AI_KEY_ENV_HINT }, { status: 503 });
  }

  let body: {
    ticketConversationId?: string;
    mistralConversationId?: string | null;
    message?: string;
    includeTicketContext?: boolean;
    copilotHistory?: unknown;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const ticketConversationId =
    typeof body.ticketConversationId === "string" ? body.ticketConversationId.trim() : "";
  const message = typeof body.message === "string" ? body.message.trim() : "";
  if (!ticketConversationId || !message) {
    return NextResponse.json(
      { error: "ticketConversationId e message são obrigatórios." },
      { status: 400 }
    );
  }

  const mistralConversationId =
    typeof body.mistralConversationId === "string" && body.mistralConversationId.startsWith("conv_")
      ? body.mistralConversationId.trim()
      : null;
  const copilotHistory = normalizeCopilotHistory(body.copilotHistory);
  const includeTicket =
    body.includeTicketContext !== false &&
    mistralConversationId === null &&
    copilotHistory.length === 0;

  const supabase = await createClient();
  const { data: conv, error: convErr } = await supabase
    .from("conversations")
    .select("id, customer_name, customer_phone, status, queue_id, channel_id")
    .eq("id", ticketConversationId)
    .eq("company_id", companyId)
    .maybeSingle();

  if (convErr || !conv) {
    return NextResponse.json({ error: "Conversa não encontrada" }, { status: 404 });
  }

  const convRow = conv as { queue_id: string | null; channel_id: string | null };
  const agent = await resolveCopilotAgent(companyId, {
    channelId: convRow.channel_id ?? null,
    queueId: convRow.queue_id ?? null,
  });
  if (!agent) {
    return NextResponse.json(
      {
        error:
          "Nenhum agente cobre esta conversa (conexão + fila). Em Copiloto → Agentes e filas, crie ou edite um agente com a mesma conexão e fila deste atendimento, ou use \"Qualquer\" nos dois para valer em todos. Alternativa: variáveis COPILOT_AGENT_ID / MISTRAL_COPILOT_AGENT_ID no servidor (fallback global).",
      },
      { status: 400 }
    );
  }

  const db = process.env.SUPABASE_SERVICE_ROLE_KEY ? createServiceRoleClient() : supabase;

  const [queueRes, channelRes] = await Promise.all([
    convRow.queue_id
      ? db.from("queues").select("name").eq("id", convRow.queue_id).eq("company_id", companyId).maybeSingle()
      : Promise.resolve({ data: null }),
    db.from("channels").select("name").eq("id", convRow.channel_id).eq("company_id", companyId).maybeSingle(),
  ]);

  const queueName = (queueRes.data as { name?: string } | null)?.name?.trim() || null;
  const channelName = (channelRes.data as { name?: string } | null)?.name?.trim() || null;

  const headerParts = [
    `Contato: ${(conv.customer_name || "").trim() || "—"}`,
    `Telefone: ${(conv.customer_phone || "").trim() || "—"}`,
    `Status: ${(conv.status || "").trim() || "—"}`,
    channelName ? `Canal: ${channelName}` : null,
    queueName ? `Fila: ${queueName}` : null,
  ].filter(Boolean);
  const header = headerParts.join("\n");

  let rows: MsgRow[] = [];
  if (process.env.SUPABASE_SERVICE_ROLE_KEY) {
    try {
      const admin = createServiceRoleClient();
      const { data, error } = await admin
        .from("messages")
        .select(MESSAGES_SELECT)
        .eq("conversation_id", ticketConversationId)
        .order("sent_at", { ascending: false })
        .limit(FETCH_LIMIT);
      if (!error && Array.isArray(data)) rows = data as MsgRow[];
    } catch {
      /* fallback */
    }
  }
  if (rows.length === 0) {
    const { data, error } = await supabase
      .from("messages")
      .select(MESSAGES_SELECT)
      .eq("conversation_id", ticketConversationId)
      .order("sent_at", { ascending: false })
      .limit(FETCH_LIMIT);
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    rows = (data ?? []) as MsgRow[];
  }

  const merged = [...rows].sort(
    (a, b) => new Date(a.sent_at).getTime() - new Date(b.sent_at).getTime()
  );
  const tail = merged.slice(-TAIL);
  let transcript = tail.map(formatLine).join("\n");
  if (transcript.length > MAX_TRANSCRIPT) {
    transcript = transcript.slice(-MAX_TRANSCRIPT);
  }

  let payload = message;
  if (includeTicket) {
    const promptBlock =
      agent.extraPrompt.trim().length > 0
        ? `[Instruções da regra (empresa) — siga em conjunto com o agente]\n${agent.extraPrompt.trim()}\n\n---\n`
        : "";
    const block =
      `${promptBlock}[Contexto interno do chamado (WhatsApp) — não reproduza isto literalmente ao cliente se não fizer sentido]\n${header}\n\nTrecho recente:\n${transcript || "(sem mensagens)"}\n\n---\n[Pergunta / pedido do atendente ao copiloto SDR]\n${message}`;
    payload = block;
  }

  if (useCopilotEdge && agent.mode === "mistral_agent") {
    try {
      const edgeOut = await invokeCopilotEdge({
        ticketConversationId,
        mistralConversationId,
        message,
        includeTicket,
        companyId,
        agent: {
          agentId: agent.agentId,
          agentVersion: agent.agentVersion,
          source: agent.source,
        },
        context: {
          header,
          transcript,
          extraPrompt: agent.extraPrompt,
          firstTurnPayload: payload,
        },
      });
      if (edgeOut) {
        return NextResponse.json({
          mistralConversationId: edgeOut.mistralConversationId ?? mistralConversationId,
          reply: edgeOut.reply,
        });
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Erro na Edge Function do copiloto";
      return NextResponse.json({ error: msg }, { status: 502 });
    }
  }

  if (!apiKey) {
    return NextResponse.json({ error: SERVER_AI_KEY_ENV_HINT }, { status: 503 });
  }

  try {
    if (agent.mode === "chat_completions") {
      const system =
        agent.systemInstructions.trim().length > 0
          ? agent.systemInstructions.trim()
          : DEFAULT_CHAT_SYSTEM;
      const chatMessages: { role: "system" | "user" | "assistant"; content: string }[] = [
        { role: "system", content: system },
        ...copilotHistory.map((m) => ({ role: m.role, content: m.content })),
        { role: "user", content: includeTicket ? payload : message },
      ];
      const reply = await mistralChatCompletion({
        apiKey,
        baseUrl: AI_BASE_URL,
        model: agent.completionModel,
        messages: chatMessages,
      });
      return NextResponse.json({
        mistralConversationId: null,
        reply,
        copilotMode: "chat_completions" as const,
      });
    }

    if (mistralConversationId) {
      const out = await mistralConversationAppend({
        apiKey,
        baseUrl: AI_BASE_URL,
        conversationId: mistralConversationId,
        userContent: message,
      });
      return NextResponse.json({
        mistralConversationId: out.conversationId,
        reply: out.reply,
      });
    }

    const out = await mistralConversationStart({
      apiKey,
      baseUrl: AI_BASE_URL,
      agentId: agent.agentId,
      agentVersion: agent.agentVersion,
      userContent: payload,
    });
    return NextResponse.json({
      mistralConversationId: out.conversationId,
      reply: out.reply,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro no provedor de IA do copiloto";
    const body: {
      error: string;
      dev?: { keySource: string; keyLength: number };
    } = { error: msg };
    if (process.env.NODE_ENV === "development") {
      body.dev = {
        keySource: getServerAiKeySource(),
        keyLength: apiKey.length,
      };
    }
    return NextResponse.json(body, { status: 502 });
  }
}
