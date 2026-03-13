import { getCompanyIdFromRequest } from "@/lib/auth/get-company";
import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

/**
 * GET /api/conversations/[id]/form-answers
 * Retorna formulários de tabulação da fila da conversa e as respostas já salvas.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const companyId = await getCompanyIdFromRequest(_request);
  if (!companyId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  if (!id) {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }

  const supabase = await createClient();

  const { data: conv, error: convErr } = await supabase
    .from("conversations")
    .select("id, company_id, queue_id")
    .eq("id", id)
    .eq("company_id", companyId)
    .single();

  if (convErr || !conv) {
    return NextResponse.json({ error: "Conversa não encontrada" }, { status: 404 });
  }

  const queueId = (conv as { queue_id: string | null }).queue_id;
  if (!queueId) {
    return NextResponse.json({ forms: [], answers: {} });
  }

  const { data: formQueueLinks } = await supabase
    .from("tag_form_queues")
    .select("tag_form_id")
    .eq("company_id", companyId)
    .eq("queue_id", queueId);

  const formIds = (formQueueLinks ?? []).map((r: { tag_form_id: string }) => r.tag_form_id);
  if (formIds.length === 0) {
    return NextResponse.json({ forms: [], answers: {} });
  }

  const { data: formsData, error: formsErr } = await supabase
    .from("tag_forms")
    .select(
      `
        id,
        name,
        description,
        is_active,
        tag_form_fields ( id, label, field_type, required, sort_order, config )
      `
    )
    .eq("company_id", companyId)
    .in("id", formIds)
    .eq("is_active", true);

  if (formsErr) {
    return NextResponse.json({ error: formsErr.message }, { status: 500 });
  }

  const forms = (formsData ?? [])
    .map((row: any) => {
      const fieldsRaw = Array.isArray(row.tag_form_fields) ? row.tag_form_fields : [];
      const fields = fieldsRaw
        .sort((a: any, b: any) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
        .map((f: any) => {
          const cfg = (f.config ?? {}) as { options?: string[] };
          return {
            id: String(f.id),
            label: String(f.label ?? ""),
            type: (f.field_type ?? "text") as "select" | "multiselect" | "text" | "number",
            required: !!f.required,
            options: Array.isArray(cfg.options) ? cfg.options.map((o: string) => String(o)) : [],
          };
        });
      return {
        id: row.id as string,
        name: row.name as string,
        description: (row.description as string | null) ?? null,
        fields,
      };
    });

  const { data: answersRows } = await supabase
    .from("conversation_form_answers")
    .select("tag_form_id, answers, created_at")
    .eq("company_id", companyId)
    .eq("conversation_id", id);

  const answers: Record<string, { answers: Record<string, unknown>; answered_at: string }> = {};
  for (const row of answersRows ?? []) {
    const r = row as { tag_form_id: string; answers: Record<string, unknown>; created_at: string };
    answers[r.tag_form_id] = {
      answers: (r.answers as Record<string, unknown>) ?? {},
      answered_at: r.created_at,
    };
  }

  return NextResponse.json({ forms, answers });
}

/**
 * POST /api/conversations/[id]/form-answers
 * Body: { tag_form_id: string, answers: Record<string, unknown> }
 * Salva ou atualiza a resposta de um formulário para esta conversa.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const companyId = await getCompanyIdFromRequest(request);
  if (!companyId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  if (!id) {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }

  let body: { tag_form_id?: string; answers?: Record<string, unknown> };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const tagFormId = typeof body?.tag_form_id === "string" ? body.tag_form_id.trim() : "";
  const answers = body?.answers && typeof body.answers === "object" ? body.answers : {};

  if (!tagFormId) {
    return NextResponse.json({ error: "tag_form_id é obrigatório" }, { status: 400 });
  }

  const supabase = await createClient();

  const { data: conv, error: convErr } = await supabase
    .from("conversations")
    .select("id, company_id, queue_id")
    .eq("id", id)
    .eq("company_id", companyId)
    .single();

  if (convErr || !conv) {
    return NextResponse.json({ error: "Conversa não encontrada" }, { status: 404 });
  }

  const queueId = (conv as { queue_id: string | null }).queue_id;
  if (queueId) {
    const { data: link } = await supabase
      .from("tag_form_queues")
      .select("id")
      .eq("company_id", companyId)
      .eq("queue_id", queueId)
      .eq("tag_form_id", tagFormId)
      .maybeSingle();
    if (!link) {
      return NextResponse.json(
        { error: "Formulário não pertence à fila desta conversa." },
        { status: 400 }
      );
    }
  }

  const { data: { user } } = await supabase.auth.getUser();

  await supabase
    .from("conversation_form_answers")
    .delete()
    .eq("company_id", companyId)
    .eq("conversation_id", id)
    .eq("tag_form_id", tagFormId);

  const { error: insErr } = await supabase.from("conversation_form_answers").insert({
    company_id: companyId,
    conversation_id: id,
    tag_form_id: tagFormId,
    answers,
    answered_by: user?.id ?? null,
  });

  if (insErr) {
    return NextResponse.json({ error: insErr.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
