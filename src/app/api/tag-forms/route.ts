import { NextResponse } from "next/server";
import { getCompanyIdFromRequest } from "@/lib/auth/get-company";
import { createClient } from "@/lib/supabase/server";

type FormFieldInput = {
  id: string;
  label: string;
  type: "select" | "multiselect" | "text" | "number";
  required: boolean;
};

type FormBody = {
  id?: string;
  delete?: boolean;
  name?: string;
  description?: string | null;
  queue_ids?: string[];
  active?: boolean;
  fields?: FormFieldInput[];
};

export async function GET(request: Request) {
  const companyId = await getCompanyIdFromRequest(request);
  if (!companyId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = await createClient();

  const { data, error } = await supabase
    .from("tag_forms")
    .select(
      `
        id,
        name,
        description,
        is_active,
        tag_form_queues ( queue_id, queues ( id, name ) )
      `
    )
    .eq("company_id", companyId)
    .order("created_at", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const items =
    (data ?? []).map((row: any) => {
      const links = Array.isArray(row.tag_form_queues) ? row.tag_form_queues : [];
      const queues = links
        .map((l: any) => {
          const q = Array.isArray(l.queues) ? l.queues[0] : l.queues;
          if (!q) return null;
          return { id: q.id as string, name: q.name as string };
        })
        .filter(Boolean) as { id: string; name: string }[];

      return {
        id: row.id as string,
        name: row.name as string,
        description: row.description as string | null,
        active: row.is_active !== false,
        queues,
      };
    }) ?? [];

  return NextResponse.json({ data: items });
}

export async function POST(request: Request) {
  const companyId = await getCompanyIdFromRequest(request);
  if (!companyId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: FormBody;
  try {
    body = (await request.json()) as FormBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const supabase = await createClient();

  // Delete
  if (body.delete && body.id) {
    const formId = body.id;
    const { error } = await supabase
      .from("tag_forms")
      .delete()
      .eq("id", formId)
      .eq("company_id", companyId);
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ ok: true });
  }

  const name = (body.name ?? "").trim();
  const description = (body.description ?? "").trim() || null;
  const queueIds = Array.isArray(body.queue_ids)
    ? body.queue_ids.map((q) => q.trim()).filter(Boolean)
    : [];
  const active = body.active !== false;
  const fields = Array.isArray(body.fields) ? body.fields : [];

  if (!name) {
    return NextResponse.json(
      { error: "name é obrigatório" },
      { status: 400 }
    );
  }

  const now = new Date().toISOString();

  let formId = body.id ?? null;
  if (formId) {
    const { error } = await supabase
      .from("tag_forms")
      .update({
        name,
        description,
        is_active: active,
        updated_at: now,
      })
      .eq("id", formId)
      .eq("company_id", companyId);
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
  } else {
    const { data: inserted, error } = await supabase
      .from("tag_forms")
      .insert({
        company_id: companyId,
        name,
        description,
        is_active: active,
      })
      .select("id")
      .single();
    if (error || !inserted) {
      return NextResponse.json(
        { error: error?.message ?? "Falha ao criar formulário" },
        { status: 500 }
      );
    }
    formId = inserted.id as string;
  }

  if (!formId) {
    return NextResponse.json(
      { error: "Falha ao resolver formulário" },
      { status: 500 }
    );
  }

  // Sync filas
  await supabase
    .from("tag_form_queues")
    .delete()
    .eq("tag_form_id", formId)
    .eq("company_id", companyId);

  if (queueIds.length > 0) {
    const rows = queueIds.map((qid) => ({
      company_id: companyId,
      tag_form_id: formId!,
      queue_id: qid,
    }));
    const { error: tqErr } = await supabase.from("tag_form_queues").insert(rows);
    if (tqErr) {
      return NextResponse.json(
        { error: tqErr.message },
        { status: 500 }
      );
    }
  }

  // Sync campos: abordagem simples = apagar e recriar.
  await supabase.from("tag_form_fields").delete().eq("tag_form_id", formId);

  if (fields.length > 0) {
    const rows = fields.map((f, index) => ({
      tag_form_id: formId!,
      label: f.label.trim() || `Campo ${index + 1}`,
      field_type: f.type,
      required: !!f.required,
      sort_order: index,
      config: {}, // opções futuras (ex.: lista de opções para selects)
    }));
    const { error: ffErr } = await supabase.from("tag_form_fields").insert(rows);
    if (ffErr) {
      return NextResponse.json(
        { error: ffErr.message },
        { status: 500 }
      );
    }
  }

  return NextResponse.json({ ok: true, id: formId });
}

