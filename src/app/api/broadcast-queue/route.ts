import { getCompanyIdFromRequest } from "@/lib/auth/get-company";
import { requirePermission } from "@/lib/auth/get-profile";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

/**
 * GET /api/broadcast-queue
 * Query: channel_id?, queue_id?, status? (default: pending)
 * Lista itens da fila de envio em massa com dados do contato.
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
  const channelId = searchParams.get("channel_id")?.trim() || null;
  const queueId = searchParams.get("queue_id")?.trim() || null;
  const status = searchParams.get("status")?.trim() || "pending";

  const supabase = await createClient();

  let q = supabase
    .from("broadcast_queue")
    .select(
      `
      id,
      channel_id,
      queue_id,
      status,
      created_at,
      sent_at,
      error_message,
      channel_contact_id
    `
    )
    .eq("company_id", companyId)
    .eq("status", status)
    .order("created_at", { ascending: true });

  if (channelId) q = q.eq("channel_id", channelId);
  if (queueId) q = q.eq("queue_id", queueId);

  const { data: rows, error } = await q;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const list = (rows ?? []) as Array<{
    id: string;
    channel_id: string;
    queue_id: string | null;
    status: string;
    created_at: string;
    sent_at: string | null;
    error_message: string | null;
    channel_contact_id: string;
  }>;

  if (list.length === 0) {
    return NextResponse.json({ items: [] });
  }

  const contactIds = [...new Set(list.map((r) => r.channel_contact_id))];
  const channelIds = [...new Set(list.map((r) => r.channel_id))];

  const [{ data: contactsData }, { data: channelsData }] = await Promise.all([
    supabase
      .from("channel_contacts")
      .select("id, jid, phone, contact_name, first_name, avatar_url")
      .in("id", contactIds),
    supabase.from("channels").select("id, name").in("id", channelIds),
  ]);

  const contactsMap = new Map(
    (contactsData ?? []).map((c: Record<string, unknown>) => [c.id, c])
  );
  const channelsMap = new Map(
    (channelsData ?? []).map((ch: Record<string, unknown>) => [ch.id, ch.name])
  );

  const items = list.map((row) => {
    const contact = contactsMap.get(row.channel_contact_id) as Record<string, unknown> | undefined;
    return {
      id: row.id,
      channel_id: row.channel_id,
      channel_name: channelsMap.get(row.channel_id) ?? null,
      queue_id: row.queue_id,
      status: row.status,
      created_at: row.created_at,
      sent_at: row.sent_at,
      error_message: row.error_message,
      contact: contact
        ? {
            id: contact.id,
            jid: contact.jid,
            phone: contact.phone,
            contact_name: contact.contact_name,
            first_name: contact.first_name,
            avatar_url: contact.avatar_url,
          }
        : null,
    };
  });

  return NextResponse.json({ items });
}
