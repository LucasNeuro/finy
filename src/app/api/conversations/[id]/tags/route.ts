import { NextResponse } from "next/server";
import { getCompanyIdFromRequest } from "@/lib/auth/get-company";
import { createClient } from "@/lib/supabase/server";

/**
 * GET /api/conversations/[id]/tags
 * Returns tags available for this conversation's queue (kind=conversation) and currently applied conversation tags.
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

  const { data: appliedRows, error: appliedErr } = await supabase
    .from("conversation_tags")
    .select("tag_id")
    .eq("company_id", companyId)
    .eq("conversation_id", conversationId);

  if (appliedErr) {
    return NextResponse.json({ error: appliedErr.message }, { status: 500 });
  }

  const applied_tag_ids = (appliedRows ?? []).map((r: { tag_id: string }) => r.tag_id);

  if (!queueId) {
    return NextResponse.json({
      tags: [],
      applied_tag_ids,
    });
  }

  const { data: tagsData, error: tagsErr } = await supabase
    .from("tags")
    .select(
      `
        id,
        name,
        color_hex,
        is_active,
        tag_categories ( id, name, kind ),
        tag_queues ( queue_id )
      `
    )
    .eq("company_id", companyId)
    .eq("is_active", true)
    .order("name");

  if (tagsErr) {
    return NextResponse.json({ error: tagsErr.message }, { status: 500 });
  }

  const tags =
    (tagsData ?? [])
      .filter((row: any) => {
        const cat = row.tag_categories as { kind: string } | null;
        if (!cat || cat.kind !== "conversation") return false;
        const tq = Array.isArray(row.tag_queues) ? row.tag_queues : [];
        const hasQueue = tq.some((q: any) => q.queue_id === queueId);
        return hasQueue;
      })
      .map((row: any) => {
        const cat = row.tag_categories as { id: string; name: string } | null;
        return {
          id: row.id as string,
          name: row.name as string,
          color_hex: (row.color_hex as string | null) ?? null,
          category_name: (cat?.name as string) ?? "",
        };
      }) ?? [];

  return NextResponse.json({
    tags,
    applied_tag_ids,
  });
}

/**
 * POST /api/conversations/[id]/tags
 * Body: { tag_ids: string[] }
 * Replaces conversation tags for this conversation.
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
    .select("id")
    .eq("id", conversationId)
    .eq("company_id", companyId)
    .maybeSingle();

  if (convErr || !conv) {
    return NextResponse.json({ error: "Conversa não encontrada" }, { status: 404 });
  }

  await supabase
    .from("conversation_tags")
    .delete()
    .eq("company_id", companyId)
    .eq("conversation_id", conversationId);

  if (tagIds.length > 0) {
    const rows = tagIds.map((tagId: string) => ({
      company_id: companyId,
      conversation_id: conversationId,
      tag_id: tagId,
    }));
    const { error: insertErr } = await supabase.from("conversation_tags").insert(rows);
    if (insertErr) {
      return NextResponse.json({ error: insertErr.message }, { status: 500 });
    }
  }

  return NextResponse.json({ ok: true });
}
