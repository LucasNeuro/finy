import { getCompanyIdFromRequest } from "@/lib/auth/get-company";
import { requirePermission } from "@/lib/auth/get-profile";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

/**
 * POST /api/broadcast-queue/add
 * Body: { channel_id: string, queue_id?: string, contact_ids: string[] }
 * Adiciona contatos à fila de envio em massa.
 */
export async function POST(request: Request) {
  const companyId = await getCompanyIdFromRequest(request);
  if (!companyId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const permErr = await requirePermission(companyId, PERMISSIONS.inbox.reply);
  if (permErr) {
    return NextResponse.json({ error: permErr.error }, { status: permErr.status });
  }

  let body: { channel_id?: string; queue_id?: string; contact_ids?: string[] };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const channelId = typeof body?.channel_id === "string" ? body.channel_id.trim() : "";
  const queueId = typeof body?.queue_id === "string" ? body.queue_id.trim() || null : null;
  const contactIds = Array.isArray(body?.contact_ids)
    ? body.contact_ids.filter((id): id is string => typeof id === "string" && id.length > 0)
    : [];

  if (!channelId || contactIds.length === 0) {
    return NextResponse.json(
      { error: "channel_id e contact_ids são obrigatórios (pelo menos um contato)" },
      { status: 400 }
    );
  }

  const supabase = await createClient();

  // Verifica se o canal pertence à empresa
  const { data: channel, error: chErr } = await supabase
    .from("channels")
    .select("id")
    .eq("id", channelId)
    .eq("company_id", companyId)
    .single();

  if (chErr || !channel) {
    return NextResponse.json({ error: "Canal não encontrado" }, { status: 404 });
  }

  // Se queue_id informado, valida
  if (queueId) {
    const { data: queue, error: qErr } = await supabase
      .from("queues")
      .select("id")
      .eq("id", queueId)
      .eq("company_id", companyId)
      .single();
    if (qErr || !queue) {
      return NextResponse.json({ error: "Fila não encontrada" }, { status: 404 });
    }
  }

  // Busca contatos que pertencem ao canal e à empresa
  const { data: contacts, error: contactsErr } = await supabase
    .from("channel_contacts")
    .select("id")
    .eq("channel_id", channelId)
    .eq("company_id", companyId)
    .in("id", contactIds);

  if (contactsErr) {
    return NextResponse.json({ error: contactsErr.message }, { status: 500 });
  }

  const validIds = (contacts ?? []).map((c: { id: string }) => c.id);
  if (validIds.length === 0) {
    return NextResponse.json(
      { error: "Nenhum contato válido encontrado para este canal" },
      { status: 400 }
    );
  }

  // Evita duplicatas: não adiciona se já existe pending para o mesmo contact
  const { data: existing } = await supabase
    .from("broadcast_queue")
    .select("channel_contact_id")
    .eq("channel_id", channelId)
    .eq("status", "pending")
    .in("channel_contact_id", validIds);

  const existingIds = new Set((existing ?? []).map((r: { channel_contact_id: string }) => r.channel_contact_id));
  const toInsert = validIds.filter((id) => !existingIds.has(id));

  if (toInsert.length === 0) {
    return NextResponse.json({
      ok: true,
      count: 0,
      message: "Todos os contatos já estão na fila de envio",
    });
  }

  const rows = toInsert.map((channelContactId) => ({
    company_id: companyId,
    channel_id: channelId,
    queue_id: queueId,
    channel_contact_id: channelContactId,
    status: "pending",
  }));

  const { error: insertErr } = await supabase.from("broadcast_queue").insert(rows);

  if (insertErr) {
    return NextResponse.json({ error: insertErr.message }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    count: toInsert.length,
    skipped: validIds.length - toInsert.length,
  });
}
