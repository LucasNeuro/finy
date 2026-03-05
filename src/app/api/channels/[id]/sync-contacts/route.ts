import { getCompanyIdFromRequest } from "@/lib/auth/get-company";
import { requirePermission } from "@/lib/auth/get-profile";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { getChannelToken } from "@/lib/uazapi/channel-token";
import { listContacts, listGroups } from "@/lib/uazapi/client";
import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

/**
 * POST /api/channels/[id]/sync-contacts
 * Sincroniza contatos e grupos da instância UAZAPI para channel_contacts e channel_groups.
 * Requer permissão channels.manage. O canal deve estar conectado.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const companyId = await getCompanyIdFromRequest(request);
  if (!companyId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const permErr = await requirePermission(companyId, PERMISSIONS.channels.manage);
  if (permErr) {
    return NextResponse.json({ error: permErr.error }, { status: permErr.status });
  }

  const { id: channelId } = await params;
  if (!channelId) {
    return NextResponse.json({ error: "channel id required" }, { status: 400 });
  }

  const resolved = await getChannelToken(channelId, companyId);
  if (!resolved) {
    return NextResponse.json({ error: "Channel not found" }, { status: 404 });
  }

  const [contactsRes, groupsRes] = await Promise.all([
    listContacts(resolved.token),
    listGroups(resolved.token, { force: true, noparticipants: true }),
  ]);

  const supabase = await createClient();

  let contactsCount = 0;
  if (contactsRes.ok && Array.isArray(contactsRes.data) && contactsRes.data.length > 0) {
    const rows = contactsRes.data.map((c) => {
      const jid = (c.jid ?? "").trim();
      const phone = jid.replace(/@.*$/, "").replace(/\D/g, "") || null;
      return {
        channel_id: channelId,
        company_id: companyId,
        jid,
        phone: phone || null,
        contact_name: (c.contactName ?? c.contact_name ?? "").trim() || null,
        first_name: (c.contact_FirstName ?? "").trim() || null,
      };
    }).filter((r) => r.jid);
    if (rows.length > 0) {
      const { error: err } = await supabase
        .from("channel_contacts")
        .upsert(rows, { onConflict: "channel_id,jid", ignoreDuplicates: false });
      if (!err) contactsCount = rows.length;
    }
  }

  let groupsCount = 0;
  if (groupsRes.ok && Array.isArray(groupsRes.data) && groupsRes.data.length > 0) {
    const rows = groupsRes.data.map((g) => {
      const jid = (g.JID ?? "").trim();
      return {
        channel_id: channelId,
        company_id: companyId,
        jid,
        name: (g.Name ?? "").trim() || null,
        topic: (g.Topic ?? "").trim() || null,
        invite_link: (g.invite_link ?? "").trim() || null,
        left_at: null,
      };
    }).filter((r) => r.jid);
    if (rows.length > 0) {
      const { error: err } = await supabase
        .from("channel_groups")
        .upsert(rows, { onConflict: "channel_id,jid", ignoreDuplicates: false });
      if (!err) groupsCount = rows.length;
    }
  }

  return NextResponse.json({
    ok: true,
    contacts_synced: contactsCount,
    groups_synced: groupsCount,
    contacts_error: contactsRes.ok ? undefined : contactsRes.error,
    groups_error: groupsRes.ok ? undefined : groupsRes.error,
  });
}
