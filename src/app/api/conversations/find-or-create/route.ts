import { getCompanyIdFromRequest } from "@/lib/auth/get-company";
import { requirePermission } from "@/lib/auth/get-profile";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { toCanonicalDigits, normalizeWhatsAppJid } from "@/lib/phone-canonical";
import { isCommercialQueue } from "@/lib/queue/commercial";
import { getNextAgentForQueue } from "@/lib/queue/round-robin";
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
    (jid?.endsWith("@g.us") ?? false);

  if (!channelId || !jid) {
    return NextResponse.json(
      { error: "channel_id e jid são obrigatórios" },
      { status: 400 }
    );
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  // Contato (ticket): normalizar JID/customer_phone para formato canônico antes de buscar/inserir (evita duplicatas)
  const jidNorm = normalizeWhatsAppJid(jid);
  const isTicket = !jidNorm.endsWith("@g.us");
  const canonicalJid = isTicket
    ? (toCanonicalDigits(jidNorm.replace(/@.*$/, "").replace(/\D/g, ""))
        ? `${toCanonicalDigits(jidNorm.replace(/@.*$/, "").replace(/\D/g, ""))!}@s.whatsapp.net`
        : jidNorm)
    : jidNorm;
  const canonicalPhone = isTicket
    ? (toCanonicalDigits(customerPhone || jidNorm.replace(/@.*$/, "").replace(/\D/g, "")) ?? (customerPhone || jidNorm.replace(/@.*$/, "").trim() || "—"))
    : null;

  if (isGroup) {
    const { data: existing } = await supabase
      .from("conversations")
      .select("id")
      .eq("company_id", companyId)
      .eq("channel_id", channelId)
      .eq("external_id", canonicalJid)
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
      .eq("jid", canonicalJid)
      .maybeSingle();

    const displayName =
      customerName ||
      (channelGroup as { name?: string; topic?: string } | null)?.name ||
      (channelGroup as { name?: string; topic?: string } | null)?.topic ||
      canonicalJid;

    const { data: inserted, error: insertErr } = await supabase
      .from("conversations")
      .insert({
        company_id: companyId,
        channel_id: channelId,
        external_id: canonicalJid,
        wa_chat_jid: canonicalJid,
        kind: "group",
        is_group: true,
        customer_phone: canonicalJid,
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
    .eq("external_id", canonicalJid)
    .eq("kind", "ticket")
    .maybeSingle();

  if (existing?.id) {
    return NextResponse.json({ id: existing.id });
  }

  // Mesmo contato pode existir com external_id antigo (ex.: LID). Buscar por customer_phone canônico para não duplicar.
  if (canonicalPhone && canonicalPhone !== "—" && canonicalPhone.replace(/\D/g, "").length >= 10) {
    const { data: byPhone } = await supabase
      .from("conversations")
      .select("id, external_id")
      .eq("company_id", companyId)
      .eq("channel_id", channelId)
      .eq("kind", "ticket")
      .eq("customer_phone", canonicalPhone)
      .maybeSingle();
    if (byPhone?.id) {
      const existingId = (byPhone as { id: string }).id;
      const currentExt = (byPhone as { external_id?: string }).external_id;
      if (currentExt !== canonicalJid) {
        await supabase
          .from("conversations")
          .update({ external_id: canonicalJid, wa_chat_jid: canonicalJid, updated_at: new Date().toISOString() })
          .eq("id", existingId)
          .eq("company_id", companyId);
      }
      return NextResponse.json({ id: existingId });
    }
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
  let assignedTo: string | null = null;
  if (queueId) {
    const commercial = await isCommercialQueue(supabase, companyId, queueId);
    if (commercial) {
      if (user?.id) {
        const { data: ownAssignment } = await supabase
          .from("queue_assignments")
          .select("id")
          .eq("company_id", companyId)
          .eq("queue_id", queueId)
          .eq("user_id", user.id)
          .maybeSingle();
        if (ownAssignment?.id) {
          assignedTo = user.id;
        }
      }
      if (!assignedTo) {
        assignedTo = await getNextAgentForQueue(companyId, queueId);
      }
    }
  }

  const { data: inserted, error: insertErr } = await supabase
    .from("conversations")
    .insert({
      company_id: companyId,
      channel_id: channelId,
      external_id: canonicalJid,
      wa_chat_jid: canonicalJid,
      kind: "ticket",
      is_group: false,
      customer_phone: canonicalPhone ?? "—",
      customer_name: customerName,
      queue_id: queueId,
      assigned_to: assignedTo,
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
