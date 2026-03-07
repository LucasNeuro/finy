import { getCompanyIdFromRequest } from "@/lib/auth/get-company";
import { requirePermission } from "@/lib/auth/get-profile";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

/**
 * GET /api/conversations/find-or-create
 * Params: channel_id, jid (obrigatórios).
 * Contato: customer_phone, customer_name → encontra/cria conversa individual (ticket).
 * Grupo: is_group=1 (e opcional customer_name) → encontra/cria conversa de grupo (kind=group).
 */
export async function GET(request: Request) {
  const companyId = await getCompanyIdFromRequest(request);
  if (!companyId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const permErr = await requirePermission(companyId, PERMISSIONS.inbox.read);
  if (permErr) {
    return NextResponse.json({ error: permErr.error }, { status: permErr.status });
  }

  const { searchParams } = new URL(request.url);
  const channelId = searchParams.get("channel_id")?.trim();
  const jid = searchParams.get("jid")?.trim();
  const customerPhone = searchParams.get("customer_phone")?.trim() || "";
  const customerName = searchParams.get("customer_name")?.trim() || null;
  const isGroup =
    (searchParams.get("is_group") === "1" || searchParams.get("kind") === "group") &&
    jid.endsWith("@g.us");

  if (!channelId || !jid) {
    return NextResponse.json(
      { error: "channel_id e jid são obrigatórios" },
      { status: 400 }
    );
  }

  const supabase = await createClient();

  if (isGroup) {
    const { data: existing } = await supabase
      .from("conversations")
      .select("id")
      .eq("company_id", companyId)
      .eq("channel_id", channelId)
      .eq("external_id", jid)
      .eq("kind", "group")
      .maybeSingle();

    if (existing?.id) {
      return NextResponse.json({ id: existing.id });
    }

    const { data: chData } = await supabase
      .from("channels")
      .select("id, company_id")
      .eq("id", channelId)
      .eq("company_id", companyId)
      .single();

    if (!chData) {
      return NextResponse.json({ error: "Canal não encontrado" }, { status: 404 });
    }

    const { data: cqList } = await supabase
      .from("channel_queues")
      .select("queue_id")
      .eq("channel_id", channelId);

    const { data: queuesData } = await supabase
      .from("queues")
      .select("id, kind")
      .in("id", (cqList ?? []).map((cq: { queue_id: string }) => cq.queue_id));

    const groupQueue = (queuesData ?? []).find(
      (q: { id: string; kind?: string }) => q.kind === "group"
    );
    const groupQueueId = groupQueue?.id ?? null;

    const { data: channelGroup } = await supabase
      .from("channel_groups")
      .select("name, topic")
      .eq("channel_id", channelId)
      .eq("jid", jid)
      .maybeSingle();

    const displayName =
      customerName ||
      (channelGroup as { name?: string; topic?: string } | null)?.name ||
      (channelGroup as { name?: string; topic?: string } | null)?.topic ||
      jid;

    const { data: inserted, error: insertErr } = await supabase
      .from("conversations")
      .insert({
        company_id: companyId,
        channel_id: channelId,
        external_id: jid,
        wa_chat_jid: jid,
        kind: "group",
        is_group: true,
        customer_phone: jid,
        customer_name: displayName,
        queue_id: groupQueueId,
        assigned_to: null,
        status: "open",
        last_message_at: new Date().toISOString(),
      })
      .select("id")
      .single();

    if (insertErr || !inserted?.id) {
      return NextResponse.json(
        { error: insertErr?.message ?? "Erro ao criar conversa do grupo" },
        { status: 500 }
      );
    }
    return NextResponse.json({ id: inserted.id });
  }

  const { data: existing } = await supabase
    .from("conversations")
    .select("id")
    .eq("company_id", companyId)
    .eq("channel_id", channelId)
    .eq("external_id", jid)
    .eq("kind", "ticket")
    .maybeSingle();

  if (existing?.id) {
    return NextResponse.json({ id: existing.id });
  }

  const { data: chData } = await supabase
    .from("channels")
    .select("id, company_id, queue_id")
    .eq("id", channelId)
    .eq("company_id", companyId)
    .single();

  if (!chData) {
    return NextResponse.json({ error: "Canal não encontrado" }, { status: 404 });
  }

  const { data: cqList } = await supabase
    .from("channel_queues")
    .select("queue_id, is_default")
    .eq("channel_id", channelId)
    .order("is_default", { ascending: false });

  const list = (cqList ?? []) as { queue_id: string; is_default: boolean }[];
  const defaultCq = list.find((cq) => cq.is_default) ?? list[0];
  const queueId =
    defaultCq?.queue_id ?? (chData as { queue_id?: string | null }).queue_id ?? null;

  const { data: inserted, error: insertErr } = await supabase
    .from("conversations")
    .insert({
      company_id: companyId,
      channel_id: channelId,
      external_id: jid,
      wa_chat_jid: jid,
      kind: "ticket",
      is_group: false,
      customer_phone: customerPhone || jid.replace(/@.*$/, "").trim() || "—",
      customer_name: customerName,
      queue_id: queueId,
      assigned_to: null,
      status: "open",
      last_message_at: new Date().toISOString(),
    })
    .select("id")
    .single();

  if (insertErr || !inserted?.id) {
    return NextResponse.json(
      { error: insertErr?.message ?? "Erro ao criar conversa" },
      { status: 500 }
    );
  }

  return NextResponse.json({ id: inserted.id });
}
