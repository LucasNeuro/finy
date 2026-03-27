import { NextResponse } from "next/server";
import { getCompanyIdFromRequest } from "@/lib/auth/get-company";
import { createClient } from "@/lib/supabase/server";

type TagBody = {
  id?: string;
  delete?: boolean;
  name?: string;
  category_type?: "contact" | "conversation";
  category_name?: string;
  color_hex?: string | null;
  queue_ids?: string[];
  active?: boolean;
};

export async function GET(request: Request) {
  const companyId = await getCompanyIdFromRequest(request);
  if (!companyId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = await createClient();

  const { data, error } = await supabase
    .from("tags")
    .select(
      `
        id,
        name,
        color_hex,
        is_active,
        tag_categories ( id, name, kind ),
        tag_queues ( queue_id, queues ( id, name ) )
      `
    )
    .eq("company_id", companyId)
    .order("name");

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const items =
    (data ?? []).map((row: any) => {
      const cat = row.tag_categories as { id: string; name: string; kind: string } | null;
      const tq = Array.isArray(row.tag_queues) ? row.tag_queues : [];
      const queues = tq
        .map((q: any) => {
          const queue = Array.isArray(q.queues) ? q.queues[0] : q.queues;
          if (!queue) return null;
          return { id: queue.id as string, name: queue.name as string };
        })
        .filter(Boolean) as { id: string; name: string }[];

      return {
        id: row.id as string,
        name: row.name as string,
        color_hex: row.color_hex as string | null,
        active: row.is_active !== false,
        category_id: cat?.id ?? null,
        category_name: cat?.name ?? "",
        category_type: (cat?.kind as "contact" | "conversation") ?? "contact",
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

  let body: TagBody;
  try {
    body = (await request.json()) as TagBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const supabase = await createClient();

  // Delete
  if (body.delete && body.id) {
    const { error } = await supabase
      .from("tags")
      .delete()
      .eq("id", body.id)
      .eq("company_id", companyId);
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ ok: true });
  }

  const name = (body.name ?? "").trim();
  const categoryName = (body.category_name ?? "").trim();
  const categoryType =
    body.category_type === "conversation" ? "conversation" : "contact";
  const colorHex = body.color_hex ?? null;
  const queueIds = Array.isArray(body.queue_ids)
    ? body.queue_ids.map((q) => q.trim()).filter(Boolean)
    : [];
  const active = body.active !== false;

  if (!name || !categoryName) {
    return NextResponse.json(
      { error: "name e category_name são obrigatórios" },
      { status: 400 }
    );
  }

  // Ensure category exists (per company + kind + name)
  // Usa limit(1) em vez de maybeSingle() para evitar erro quando há categorias duplicadas
  let categoryId: string | null = null;
  {
    const { data: existingRows, error: catErr } = await supabase
      .from("tag_categories")
      .select("id")
      .eq("company_id", companyId)
      .eq("kind", categoryType)
      .ilike("name", categoryName)
      .limit(1);
    if (catErr) {
      return NextResponse.json({ error: catErr.message }, { status: 500 });
    }
    const existing = Array.isArray(existingRows) ? existingRows[0] : null;
    if (existing?.id) {
      categoryId = existing.id;
    } else {
      const { data: created, error: createCatErr } = await supabase
        .from("tag_categories")
        .insert({
          company_id: companyId,
          name: categoryName,
          kind: categoryType,
        })
        .select("id")
        .single();
      if (createCatErr || !created) {
        return NextResponse.json(
          { error: createCatErr?.message ?? "Falha ao criar categoria" },
          { status: 500 }
        );
      }
      categoryId = created.id as string;
    }
  }

  if (!categoryId) {
    return NextResponse.json(
      { error: "Falha ao resolver categoria" },
      { status: 500 }
    );
  }

  const now = new Date().toISOString();

  let tagId = body.id ?? null;
  if (tagId) {
    const { error } = await supabase
      .from("tags")
      .update({
        name,
        color_hex: colorHex,
        is_active: active,
        category_id: categoryId,
        updated_at: now,
      })
      .eq("id", tagId)
      .eq("company_id", companyId);
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
  } else {
    const { data: inserted, error } = await supabase
      .from("tags")
      .insert({
        company_id: companyId,
        name,
        color_hex: colorHex,
        is_active: active,
        category_id: categoryId,
      })
      .select("id")
      .single();
    if (error || !inserted) {
      return NextResponse.json(
        { error: error?.message ?? "Falha ao criar tag" },
        { status: 500 }
      );
    }
    tagId = inserted.id as string;
  }

  // Sync queues (simple: delete all then insert selected)
  if (tagId) {
    await supabase.from("tag_queues").delete().eq("tag_id", tagId).eq("company_id", companyId);

    if (queueIds.length > 0) {
      const rows = queueIds.map((qid) => ({
        company_id: companyId,
        tag_id: tagId!,
        queue_id: qid,
      }));
      const { error: tqErr } = await supabase.from("tag_queues").insert(rows);
      if (tqErr) {
        return NextResponse.json(
          { error: tqErr.message },
          { status: 500 }
        );
      }
    }
  }

  return NextResponse.json({ ok: true, id: tagId });
}

