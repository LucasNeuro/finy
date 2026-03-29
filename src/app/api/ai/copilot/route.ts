import { getCompanyIdFromRequest } from "@/lib/auth/get-company";
import { requirePermission } from "@/lib/auth/get-profile";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { getCopilotModuleEnabledForCompany } from "@/lib/company/copilot-module";
import { mapAiHttpError } from "@/lib/ai/map-ai-http-error";
import { getServerAiApiKey, SERVER_AI_KEY_ENV_HINT } from "@/lib/ai/server-api-key";
import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { NextResponse } from "next/server";

const AI_BASE_URL =
  process.env.AI_BASE_URL?.replace(/\/+$/, "") ||
  process.env.MISTRAL_BASE_URL?.replace(/\/+$/, "") ||
  "https://api.mistral.ai/v1";
const AI_COMPLETIONS_URL = `${AI_BASE_URL}/chat/completions`;
const DEFAULT_AI_MODEL = "mistral-small-latest";

const MESSAGES_SELECT =
  "id, direction, content, sent_at, message_type, media_url, caption";
const MAX_MESSAGES = 80;
const MAX_CONTENT_CHARS = 500;

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

function formatLine(m: MsgRow): string {
  const mt = (m.message_type || "text").toLowerCase();
  if (mt === "internal_note") {
    return `[Nota interna da equipe] ${truncate(m.content || "", MAX_CONTENT_CHARS)}`;
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
              : mt === "sticker"
                ? "[figurinha]"
                : `[${mt}]`;
    const extra = m.caption?.trim() || m.content?.trim();
    return `${label}: ${hint}${extra ? ` ${truncate(extra, MAX_CONTENT_CHARS)}` : ""}`;
  }
  return `${label}: ${truncate(m.content || "", MAX_CONTENT_CHARS)}`;
}

export async function POST(request: Request) {
  const companyId = await getCompanyIdFromRequest(request);
  if (!companyId) {
    return NextResponse.json(
      { error: "Não autorizado. Verifique se está logado e com a empresa selecionada." },
      { status: 401 }
    );
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

  const apiKey = getServerAiApiKey();
  const isLocal = AI_BASE_URL.includes("localhost") || AI_BASE_URL.includes("127.0.0.1");

  if (!apiKey && !isLocal) {
    return NextResponse.json({ error: SERVER_AI_KEY_ENV_HINT }, { status: 503 });
  }

  let body: { conversationId?: string; instruction?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const conversationId = typeof body?.conversationId === "string" ? body.conversationId.trim() : "";
  if (!conversationId) {
    return NextResponse.json({ error: "conversationId obrigatório" }, { status: 400 });
  }

  const instruction =
    typeof body?.instruction === "string" ? body.instruction.trim().slice(0, 2000) : "";

  const supabase = await createClient();
  const db =
    process.env.SUPABASE_SERVICE_ROLE_KEY ? createServiceRoleClient() : supabase;

  const { data: conv, error: convErr } = await supabase
    .from("conversations")
    .select("id, customer_name, customer_phone, status, queue_id, channel_id")
    .eq("id", conversationId)
    .eq("company_id", companyId)
    .maybeSingle();

  if (convErr || !conv) {
    return NextResponse.json({ error: "Conversa não encontrada" }, { status: 404 });
  }

  const convRow = conv as {
    queue_id: string | null;
    channel_id: string;
  };

  const [queueRes, channelRes, tagLinksRes] = await Promise.all([
    convRow.queue_id
      ? db.from("queues").select("name").eq("id", convRow.queue_id).eq("company_id", companyId).maybeSingle()
      : Promise.resolve({ data: null }),
    db.from("channels").select("name").eq("id", convRow.channel_id).eq("company_id", companyId).maybeSingle(),
    db
      .from("conversation_tags")
      .select("tag_id")
      .eq("conversation_id", conversationId)
      .eq("company_id", companyId),
  ]);

  const queueName = (queueRes.data as { name?: string } | null)?.name?.trim() || null;
  const channelName = (channelRes.data as { name?: string } | null)?.name?.trim() || null;
  const tagIds = [...new Set((tagLinksRes.data ?? []).map((r: { tag_id: string }) => r.tag_id).filter(Boolean))];
  let tagNames: string[] = [];
  if (tagIds.length > 0) {
    const { data: tagRows } = await db.from("tags").select("name").in("id", tagIds).eq("company_id", companyId);
    tagNames = (tagRows ?? [])
      .map((t: { name?: string }) => (t.name ?? "").trim())
      .filter(Boolean);
  }

  let rows: MsgRow[] = [];
  const fetchLimit = 200;

  if (process.env.SUPABASE_SERVICE_ROLE_KEY) {
    try {
      const admin = createServiceRoleClient();
      const { data, error } = await admin
        .from("messages")
        .select(MESSAGES_SELECT)
        .eq("conversation_id", conversationId)
        .order("sent_at", { ascending: false })
        .limit(fetchLimit);
      if (!error && Array.isArray(data)) rows = data as MsgRow[];
    } catch {
      /* fallback */
    }
  }

  if (rows.length === 0) {
    const { data, error } = await supabase
      .from("messages")
      .select(MESSAGES_SELECT)
      .eq("conversation_id", conversationId)
      .order("sent_at", { ascending: false })
      .limit(fetchLimit);
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    rows = (data ?? []) as MsgRow[];
  }

  const notesClient = process.env.SUPABASE_SERVICE_ROLE_KEY ? createServiceRoleClient() : supabase;
  const { data: notes } = await notesClient
    .from("internal_notes")
    .select("id, content, created_at")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: true })
    .limit(40);

  const noteRows: MsgRow[] = (notes ?? []).map((n: { content: string; created_at: string }) => ({
    direction: "out",
    content: n.content,
    sent_at: n.created_at,
    message_type: "internal_note",
  }));

  const merged = [...rows, ...noteRows].sort(
    (a, b) => new Date(a.sent_at).getTime() - new Date(b.sent_at).getTime()
  );
  const tail = merged.slice(-MAX_MESSAGES);

  if (tail.length === 0) {
    return NextResponse.json(
      { error: "Ainda não há mensagens nesta conversa para analisar." },
      { status: 400 }
    );
  }

  const transcript = tail.map(formatLine).join("\n");
  const headerParts = [
    `Contato: ${(conv.customer_name || "").trim() || "—"}`,
    `Telefone/ID: ${(conv.customer_phone || "").trim() || "—"}`,
    `Status do chamado: ${(conv.status || "").trim() || "—"}`,
    channelName ? `Canal (conexão): ${channelName}` : null,
    queueName ? `Fila: ${queueName}` : null,
    tagNames.length > 0 ? `Tags do chamado: ${tagNames.join(", ")}` : null,
  ].filter(Boolean);
  const header = headerParts.join("\n");

  const systemContent = `Você é um copiloto interno no estilo SDR (pré-vendas / prospecção) para o atendente no painel.
Objetivo: ajudar com tom de abordagem, ritmo da conversa e o que dizer — conforme o que já aconteceu no chat.
Tudo que você escreve é só para o atendente; o cliente NÃO vê automaticamente. O atendente pode COPIAR trechos sugeridos e colar no WhatsApp.
Idioma: português brasileiro. Tom profissional, humano, sem ser robótico.

Estruture a resposta assim (use os títulos em negrito):

1) **Resumo** — 2 a 4 frases sobre onde a conversa está.
2) **Estágio** — ex.: primeiro contato, qualificação, objeção, fechamento, pós-venda, suporte.
3) **Dicas de abordagem (para você)** — 4 a 7 bullets curtos: tom, ritmo, o que validar, o que evitar, como aprofundar.
4) **Próximo passo sugerido** — 1 a 3 ações concretas para o atendente (não precisam ser mensagens prontas).

Depois inclua OBRIGATORIAMENTE o bloco abaixo com 4 a 8 linhas. Cada linha deve ser uma frase ou mensagem CURTA que o atendente pode copiar e enviar ao cliente (varie: continuidade, pergunta de qualificação, empatia, proposta de próximo passo). Uma linha = um item começando com hífen e espaço:
---FRASES---
- primeira frase pronta para colar no WhatsApp
- segunda frase
- (adicione mais linhas no mesmo formato)
---FIM-FRASES---

Por fim, OBRIGATORIAMENTE um único rascunho mais completo (parágrafo curto) para o cliente:
---RASCUNHO---
(texto único, educado, coerente com o histórico)
---FIM---

${instruction ? `Pedido extra do atendente (priorize se fizer sentido): ${instruction}\n` : ""}
Regras: não invente preço, prazo, garantia ou política que não conste no histórico ou no contexto; se faltar dado, peça confirmação ou diga que o atendente deve completar. Respeite LGPD e consentimento (se o contexto indicar opt-out, não insista em venda).`;

  const userContent = `Contexto do chamado:\n${header}\n\nHistórico recente da conversa:\n${transcript}`;

  const model =
    process.env.AI_MODEL?.trim() || process.env.MISTRAL_MODEL?.trim() || DEFAULT_AI_MODEL;

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: "application/json",
  };
  if (apiKey) headers.Authorization = `Bearer ${apiKey}`;

  const payload = {
    model,
    messages: [
      { role: "system", content: systemContent },
      { role: "user", content: userContent },
    ],
    max_tokens: 2800,
    temperature: 0.35,
  };

  const USER_FRIENDLY = "Copiloto temporariamente indisponível. Tente de novo em instantes.";

  try {
    const res = await fetch(AI_COMPLETIONS_URL, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const bodyText = await res.text();
      if (process.env.NODE_ENV === "development") {
        console.error("[copilot] IA HTTP", res.status, bodyText.slice(0, 500));
      }
      const message = mapAiHttpError(res.status, bodyText);
      const outStatus =
        res.status === 401 || res.status === 403
          ? 401
          : res.status >= 500
            ? 502
            : res.status === 429
              ? 429
              : 400;
      return NextResponse.json({ error: message }, { status: outStatus });
    }

    const data = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const text = data?.choices?.[0]?.message?.content?.trim() ?? "";
    if (!text) {
      return NextResponse.json({ error: USER_FRIENDLY }, { status: 502 });
    }

    const frasesMatch = text.match(/---FRASES---\s*([\s\S]*?)\s*---FIM-FRASES---/);
    const copyableLines: string[] = [];
    if (frasesMatch) {
      const raw = frasesMatch[1];
      for (const line of raw.split("\n")) {
        const cleaned = line
          .replace(/^\s*[-•*]\s+/, "")
          .replace(/^\s*\d+[.)]\s+/, "")
          .trim();
        if (cleaned.length >= 6) copyableLines.push(cleaned);
      }
    }

    const draftMatch = text.match(/---RASCUNHO---\s*([\s\S]*?)\s*---FIM---/);
    const draft = draftMatch ? draftMatch[1].trim() : null;

    let analysis = text;
    if (frasesMatch) analysis = analysis.replace(frasesMatch[0], "").trim();
    if (draftMatch) analysis = analysis.replace(draftMatch[0], "").trim();
    analysis = analysis.replace(/\n{3,}/g, "\n\n").trim();

    return NextResponse.json({
      analysis: analysis || text,
      copyableLines: copyableLines.slice(0, 12),
      draft,
      full: text,
    });
  } catch (e) {
    if (process.env.NODE_ENV === "development") {
      console.error("[copilot]", e instanceof Error ? e.message : e);
    }
    return NextResponse.json({ error: USER_FRIENDLY }, { status: 502 });
  }
}
