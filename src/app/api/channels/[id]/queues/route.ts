import { getCompanyIdFromRequest } from "@/lib/auth/get-company";
import { requireAdmin } from "@/lib/auth/get-profile";
import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

/**
 * GET /api/channels/[id]/queues
 * Lista as caixas de entrada (filas) vinculadas ao canal (até 8).
 */
export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const companyId = await getCompanyIdFromRequest(request);
  if (!companyId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: channelId } = await context.params;
  if (!channelId) {
    return NextResponse.json({ error: "Channel ID required" }, { status: 400 });
  }

  const supabase = await createClient();
  const { data: channel, error: chErr } = await supabase
    .from("channels")
    .select("id")
    .eq("id", channelId)
    .eq("company_id", companyId)
    .single();

  if (chErr || !channel) {
    return NextResponse.json({ error: "Channel not found" }, { status: 404 });
  }

  const { data: rows, error } = await supabase
    .from("channel_queues")
    .select("queue_id, is_default, queues(id, name, slug)")
    .eq("channel_id", channelId)
    .order("is_default", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  type QueueRef = { id: string; name: string; slug: string };
  const raw = (rows ?? []) as { queue_id: string; is_default: boolean; queues: QueueRef[] | QueueRef | null }[];
  const list = raw.map((r) => {
    const q = Array.isArray(r.queues) ? r.queues[0] : r.queues;
    return {
      queue_id: r.queue_id,
      is_default: r.is_default,
      queue: q ? { id: q.id, name: q.name, slug: q.slug } : null,
    };
  });

  return NextResponse.json(list);
}

const MAX_QUEUES_PER_CHANNEL = 8;

/**
 * POST /api/channels/[id]/queues
 * Adiciona uma caixa ao canal. Body: { queue_id: string, is_default?: boolean }
 * Máximo 8 caixas por canal.
 */
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const companyId = await getCompanyIdFromRequest(request);
  if (!companyId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const adminErr = await requireAdmin(companyId);
  if (adminErr) {
    return NextResponse.json({ error: adminErr.error }, { status: adminErr.status });
  }

  const { id: channelId } = await context.params;
  if (!channelId) {
    return NextResponse.json({ error: "Channel ID required" }, { status: 400 });
  }

  let body: { queue_id?: string; is_default?: boolean };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const queueId = typeof body?.queue_id === "string" ? body.queue_id.trim() : "";
  if (!queueId) {
    return NextResponse.json({ error: "queue_id is required" }, { status: 400 });
  }

  const supabase = await createClient();

  const { data: channel, error: chErr } = await supabase
    .from("channels")
    .select("id")
    .eq("id", channelId)
    .eq("company_id", companyId)
    .single();

  if (chErr || !channel) {
    return NextResponse.json({ error: "Channel not found" }, { status: 404 });
  }

  const { count } = await supabase
    .from("channel_queues")
    .select("queue_id", { count: "exact", head: true })
    .eq("channel_id", channelId);

  if ((count ?? 0) >= MAX_QUEUES_PER_CHANNEL) {
    return NextResponse.json(
      { error: "Este número já tem o máximo de 8 caixas de entrada." },
      { status: 400 }
    );
  }

  const queueBelongsToCompany = await supabase
    .from("queues")
    .select("id")
    .eq("id", queueId)
    .eq("company_id", companyId)
    .single();

  if (queueBelongsToCompany.error || !queueBelongsToCompany.data) {
    return NextResponse.json({ error: "Fila não encontrada ou de outra empresa." }, { status: 404 });
  }

  const isDefault = body.is_default === true;

  if (isDefault) {
    await supabase
      .from("channel_queues")
      .update({ is_default: false })
      .eq("channel_id", channelId);
    await supabase
      .from("channels")
      .update({ queue_id: queueId, updated_at: new Date().toISOString() })
      .eq("id", channelId)
      .eq("company_id", companyId);
  }

  const { data: inserted, error: insertErr } = await supabase
    .from("channel_queues")
    .insert({
      channel_id: channelId,
      queue_id: queueId,
      is_default: isDefault || (count === 0),
    })
    .select("queue_id, is_default")
    .single();

  if (insertErr) {
    if (insertErr.code === "23505") {
      return NextResponse.json({ error: "Esta caixa já está vinculada a este número." }, { status: 409 });
    }
    return NextResponse.json({ error: insertErr.message }, { status: 500 });
  }

  if ((count === 0 || isDefault) && inserted) {
    await supabase
      .from("channels")
      .update({ queue_id: queueId, updated_at: new Date().toISOString() })
      .eq("id", channelId)
      .eq("company_id", companyId);
  }

  return NextResponse.json(inserted);
}

/**
 * PATCH /api/channels/[id]/queues
 * Atualiza vínculo (ex.: definir caixa padrão). Body: { queue_id: string, is_default?: boolean }
 */
export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const companyId = await getCompanyIdFromRequest(request);
  if (!companyId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const adminErr = await requireAdmin(companyId);
  if (adminErr) {
    return NextResponse.json({ error: adminErr.error }, { status: adminErr.status });
  }

  const { id: channelId } = await context.params;
  if (!channelId) {
    return NextResponse.json({ error: "Channel ID required" }, { status: 400 });
  }

  let body: { queue_id?: string; is_default?: boolean };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const queueId = typeof body?.queue_id === "string" ? body.queue_id.trim() : "";
  if (!queueId) {
    return NextResponse.json({ error: "queue_id is required" }, { status: 400 });
  }

  const supabase = await createClient();

  const { data: channel, error: chErr } = await supabase
    .from("channels")
    .select("id")
    .eq("id", channelId)
    .eq("company_id", companyId)
    .single();

  if (chErr || !channel) {
    return NextResponse.json({ error: "Channel not found" }, { status: 404 });
  }

  if (body.is_default === true) {
    await supabase
      .from("channel_queues")
      .update({ is_default: false })
      .eq("channel_id", channelId);
    const { error: upErr } = await supabase
      .from("channel_queues")
      .update({ is_default: true })
      .eq("channel_id", channelId)
      .eq("queue_id", queueId);

    if (upErr) {
      return NextResponse.json({ error: upErr.message }, { status: 500 });
    }

    await supabase
      .from("channels")
      .update({ queue_id: queueId, updated_at: new Date().toISOString() })
      .eq("id", channelId)
      .eq("company_id", companyId);

    return NextResponse.json({ queue_id: queueId, is_default: true });
  }

  return NextResponse.json({ error: "Nenhuma alteração solicitada" }, { status: 400 });
}

/**
 * DELETE /api/channels/[id]/queues
 * Remove uma caixa do canal. Body: { queue_id: string }
 */
export async function DELETE(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const companyId = await getCompanyIdFromRequest(request);
  if (!companyId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const adminErr = await requireAdmin(companyId);
  if (adminErr) {
    return NextResponse.json({ error: adminErr.error }, { status: adminErr.status });
  }

  const { id: channelId } = await context.params;
  if (!channelId) {
    return NextResponse.json({ error: "Channel ID required" }, { status: 400 });
  }

  let body: { queue_id?: string };
  try {
    body = await request.json();
  } catch {
    const url = new URL(request.url);
    const queueId = url.searchParams.get("queue_id");
    body = queueId ? { queue_id: queueId } : {};
  }

  const queueId = typeof body?.queue_id === "string" ? body.queue_id.trim() : "";
  if (!queueId) {
    return NextResponse.json({ error: "queue_id is required" }, { status: 400 });
  }

  const supabase = await createClient();

  const { data: channel, error: chErr } = await supabase
    .from("channels")
    .select("id")
    .eq("id", channelId)
    .eq("company_id", companyId)
    .single();

  if (chErr || !channel) {
    return NextResponse.json({ error: "Channel not found" }, { status: 404 });
  }

  const { data: link } = await supabase
    .from("channel_queues")
    .select("is_default")
    .eq("channel_id", channelId)
    .eq("queue_id", queueId)
    .single();

  const { error: delErr } = await supabase
    .from("channel_queues")
    .delete()
    .eq("channel_id", channelId)
    .eq("queue_id", queueId);

  if (delErr) {
    return NextResponse.json({ error: delErr.message }, { status: 500 });
  }

  if (link?.is_default) {
    const { data: next } = await supabase
      .from("channel_queues")
      .select("queue_id")
      .eq("channel_id", channelId)
      .limit(1)
      .single();

    const newDefaultId = next?.queue_id ?? null;
    if (newDefaultId) {
      await supabase
        .from("channel_queues")
        .update({ is_default: true })
        .eq("channel_id", channelId)
        .eq("queue_id", newDefaultId);
    }
    await supabase
      .from("channels")
      .update({ queue_id: newDefaultId, updated_at: new Date().toISOString() })
      .eq("id", channelId)
      .eq("company_id", companyId);
  }

  return NextResponse.json({ ok: true });
}
