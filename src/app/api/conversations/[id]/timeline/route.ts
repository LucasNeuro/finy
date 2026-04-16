import { getCompanyIdFromRequest } from "@/lib/auth/get-company";
import { requirePermission } from "@/lib/auth/get-profile";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { NextResponse } from "next/server";

export type TimelineStatusChange = {
  id: string;
  from_status: string;
  to_status: string;
  changed_by: string | null;
  changed_by_name: string | null;
  created_at: string;
};

export type TimelinePayload = {
  conversation: {
    id: string;
    created_at: string;
    updated_at: string | null;
    channel_id: string | null;
    channel_name: string | null;
    queue_id: string | null;
    queue_name: string | null;
    assigned_to: string | null;
    assigned_to_name: string | null;
    status: string | null;
    customer_name: string | null;
    customer_phone: string | null;
    kind: string | null;
    is_group: boolean | null;
  };
  status_changes: TimelineStatusChange[];
};

/**
 * GET /api/conversations/[id]/timeline
 * Histórico de mudanças de status + resumo da conversa (fila, conexão, atendente).
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const companyId = await getCompanyIdFromRequest(_request);
  if (!companyId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const readErr = await requirePermission(companyId, PERMISSIONS.inbox.read);
  if (readErr) {
    return NextResponse.json({ error: readErr.error }, { status: readErr.status });
  }

  const { id } = await params;
  const supabase = await createClient();

  const { data: conv, error: cErr } = await supabase
    .from("conversations")
    .select(
      "id, created_at, updated_at, channel_id, queue_id, assigned_to, status, customer_name, customer_phone, kind, is_group"
    )
    .eq("id", id)
    .eq("company_id", companyId)
    .single();

  if (cErr || !conv) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const { data: hist } = await supabase
    .from("conversation_status_history")
    .select("id, from_status, to_status, changed_by, created_at")
    .eq("conversation_id", id)
    .order("created_at", { ascending: true });

  const userIds = [...new Set((hist ?? []).map((h) => h.changed_by).filter(Boolean))] as string[];

  const admin = createServiceRoleClient();
  let profileMap: Record<string, string> = {};
  if (userIds.length > 0) {
    const { data: profiles } = await admin
      .from("profiles")
      .select("user_id, full_name")
      .eq("company_id", companyId)
      .in("user_id", userIds);
    for (const p of profiles ?? []) {
      const uid = (p as { user_id: string }).user_id;
      const name = ((p as { full_name?: string }).full_name ?? "").trim();
      profileMap[uid] = name || "—";
    }
  }

  let queueName: string | null = null;
  if (conv.queue_id) {
    const { data: q } = await supabase.from("queues").select("name").eq("id", conv.queue_id).maybeSingle();
    queueName = (q as { name?: string } | null)?.name ?? null;
  }

  let channelName: string | null = null;
  if (conv.channel_id) {
    const { data: ch } = await supabase.from("channels").select("name").eq("id", conv.channel_id).maybeSingle();
    channelName = (ch as { name?: string } | null)?.name ?? null;
  }

  let assignedName: string | null = null;
  if (conv.assigned_to) {
    const { data: p } = await admin
      .from("profiles")
      .select("full_name")
      .eq("company_id", companyId)
      .eq("user_id", conv.assigned_to)
      .maybeSingle();
    assignedName = ((p as { full_name?: string } | null)?.full_name ?? "").trim() || null;
  }

  const status_changes: TimelineStatusChange[] = (hist ?? []).map((h) => ({
    id: h.id as string,
    from_status: String(h.from_status ?? ""),
    to_status: String(h.to_status ?? ""),
    changed_by: (h.changed_by as string | null) ?? null,
    changed_by_name: h.changed_by ? profileMap[String(h.changed_by)] ?? null : null,
    created_at: String(h.created_at ?? ""),
  }));

  const payload: TimelinePayload = {
    conversation: {
      id: conv.id as string,
      created_at: String(conv.created_at ?? ""),
      updated_at: conv.updated_at ? String(conv.updated_at) : null,
      channel_id: (conv.channel_id as string | null) ?? null,
      channel_name: channelName,
      queue_id: (conv.queue_id as string | null) ?? null,
      queue_name: queueName,
      assigned_to: (conv.assigned_to as string | null) ?? null,
      assigned_to_name: assignedName,
      status: (conv.status as string | null) ?? null,
      customer_name: (conv.customer_name as string | null) ?? null,
      customer_phone: (conv.customer_phone as string | null) ?? null,
      kind: (conv.kind as string | null) ?? null,
      is_group: (conv.is_group as boolean | null) ?? null,
    },
    status_changes,
  };

  return NextResponse.json(payload);
}
