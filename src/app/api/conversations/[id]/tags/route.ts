import { getCompanyIdFromRequest } from "@/lib/auth/get-company";
import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

/**
 * GET /api/conversations/[id]/tags
 * Retorna tags de atendimento (tipo conversation) da fila da conversa e as já aplicadas.
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
    return NextResponse.json({
      tags: [],
      applied_tag_ids: [],
    });
  }

  // Tags da empresa que são de tipo conversation e estão na fila desta conversa
  const { data: tagsData, error: tagsErr } = await supabase
    .from("tags")
    .select(
      `
        id,
        name,
        color_hex,
        is_active,
        tag_categories ( id, kind )
      `
    )
    .eq("company_id", companyId)
    .eq("is_active", true);

  if (tagsErr) {
    return NextResponse.json({ error: tagsErr.message }, { status: 500 });
  }

  const { data: tagQueues } = await supabase
    .from("tag_queues")
    .select("tag_id")
    .eq("company_id", companyId)
    .eq("queue_id", queueId);

  const allowedTagIds = new Set(
    (tagQueues ?? []).map((r: { tag_id: string }) => r.tag_id)
  );

  const queueTags = (tagsData ?? [])
    .filter((row: Record<string, unknown>) => {
      const cat = row.tag_categories as { kind?: string } | null | undefined;
      const kind = Array.isArray(cat) ? cat[0]?.kind : cat?.kind;
      return kind === "conversation" && allowedTagIds.has(row.id as string);
    })
    .map((row: Record<string, unknown>) => ({
      id: row.id as string,
      name: row.name as string,
      color_hex: (row.color_hex as string | null) ?? null,
    }));

  const { data: applied } = await supabase
    .from("conversation_tags")
    .select("tag_id")
    .eq("company_id", companyId)
    .eq("conversation_id", id);

  const applied_tag_ids = (applied ?? []).map((r: { tag_id: string }) => r.tag_id);

  return NextResponse.json({
    tags: queueTags,
    applied_tag_ids,
  });
}

/**
 * POST /api/conversations/[id]/tags
 * Body: { tag_ids: string[] }
 * Substitui as tags aplicadas à conversa (conversation_tags).
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

  let body: { tag_ids?: string[] };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const tagIds = Array.isArray(body?.tag_ids)
    ? body.tag_ids.map((t) => String(t).trim()).filter(Boolean)
    : [];

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
  if (queueId && tagIds.length > 0) {
    const { data: tagQueues } = await supabase
      .from("tag_queues")
      .select("tag_id")
      .eq("company_id", companyId)
      .eq("queue_id", queueId);
    const allowed = new Set((tagQueues ?? []).map((r: { tag_id: string }) => r.tag_id));
    const invalid = tagIds.filter((tid) => !allowed.has(tid));
    if (invalid.length > 0) {
      return NextResponse.json(
        { error: "Algumas tags não pertencem à fila desta conversa." },
        { status: 400 }
      );
    }
  }

  await supabase
    .from("conversation_tags")
    .delete()
    .eq("company_id", companyId)
    .eq("conversation_id", id);

  if (tagIds.length > 0) {
    const rows = tagIds.map((tagId) => ({
      company_id: companyId,
      conversation_id: id,
      tag_id: tagId,
    }));
    const { error: insErr } = await supabase.from("conversation_tags").insert(rows);
    if (insErr) {
      return NextResponse.json({ error: insErr.message }, { status: 500 });
    }
  }

  return NextResponse.json({ ok: true });
}
