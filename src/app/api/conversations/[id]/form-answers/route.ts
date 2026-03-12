import { NextResponse } from "next/server";
import { getCompanyIdFromRequest } from "@/lib/auth/get-company";
import { createClient } from "@/lib/supabase/server";

/**
 * GET /api/conversations/[id]/form-answers
 * Returns forms available for this conversation's queue and answers already saved for this conversation.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const companyId = await getCompanyIdFromRequest(request);
  if (!companyId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: conversationId } = await params;
  if (!conversationId) {
    return NextResponse.json({ error: "conversation id required" }, { status: 400 });
  }

  const supabase = await createClient();

  const { data: conv, error: convErr } = await supabase
    .from("conversations")
    .select("id, queue_id")
    .eq("id", conversationId)
    .eq("company_id", companyId)
    .maybeSingle();

  if (convErr || !conv) {
    return NextResponse.json({ error: "Conversa não encontrada" }, { status: 404 });
  }

  const queueId = conv.queue_id as string | null;

  const { data: answersRows, error: ansErr } = await supabase
    .from("conversation_form_answers")
    .select("tag_form_id, answers, created_at")
    .eq("company_id", companyId)
    .eq("conversation_id", conversationId);

  if (ansErr) {
    return NextResponse.json({ error: ansErr.message }, { status: 500 });
  }

  const answers_by_form: Record<string, { answers: Record<string, unknown>; created_at: string }> = {};
  (answersRows ?? []).forEach((r: any) => {
    answers_by_form[r.tag_form_id] = {
      answers: (r.answers as Record<string, unknown>) ?? {},
      created_at: r.created_at ?? "",
    };
  });

  if (!queueId) {
    return NextResponse.json({
      forms: [],
      answers_by_form,
    });
  }

  const { data: formLinks, error: linkErr } = await supabase
    .from("tag_form_queues")
    .select("tag_form_id")
    .eq("company_id", companyId)
    .eq("queue_id", queueId);

  if (linkErr) {
    return NextResponse.json({ error: linkErr.message }, { status: 500 });
  }

  const formIds = (formLinks ?? []).map((l: any) => l.tag_form_id).filter(Boolean);
  if (formIds.length === 0) {
    return NextResponse.json({
      forms: [],
      answers_by_form,
    });
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

  const forms = (formsData ?? []).map((row: any) => {
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
          options: Array.isArray(cfg.options) ? cfg.options.map((o) => String(o)) : [],
        };
      });
    return {
      id: row.id as string,
      name: row.name as string,
      description: (row.description as string | null) ?? null,
      fields,
    };
  });

  return NextResponse.json({
    forms,
    answers_by_form,
  });
}

/**
 * POST /api/conversations/[id]/form-answers
 * Body: { tag_form_id: string, answers: Record<string, unknown> }
 * Upserts one form answer for this conversation.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const companyId = await getCompanyIdFromRequest(request);
  if (!companyId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: conversationId } = await params;
  if (!conversationId) {
    return NextResponse.json({ error: "conversation id required" }, { status: 400 });
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
    .select("id")
    .eq("id", conversationId)
    .eq("company_id", companyId)
    .maybeSingle();

  if (convErr || !conv) {
    return NextResponse.json({ error: "Conversa não encontrada" }, { status: 404 });
  }

  const { data: existing } = await supabase
    .from("conversation_form_answers")
    .select("id")
    .eq("company_id", companyId)
    .eq("conversation_id", conversationId)
    .eq("tag_form_id", tagFormId)
    .maybeSingle();

  if (existing) {
    const { error: updErr } = await supabase
      .from("conversation_form_answers")
      .update({ answers, answered_by: null })
      .eq("id", existing.id);
    if (updErr) {
      return NextResponse.json({ error: updErr.message }, { status: 500 });
    }
  } else {
    const { error: insErr } = await supabase.from("conversation_form_answers").insert({
      company_id: companyId,
      conversation_id: conversationId,
      tag_form_id: tagFormId,
      answers,
    });
    if (insErr) {
      return NextResponse.json({ error: insErr.message }, { status: 500 });
    }
  }

  return NextResponse.json({ ok: true });
}
