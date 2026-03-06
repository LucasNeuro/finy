import { getCompanyIdFromRequest } from "@/lib/auth/get-company";
import { requirePermission } from "@/lib/auth/get-profile";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { invalidateConversationList } from "@/lib/redis/inbox-state";
import { getChannelToken } from "@/lib/uazapi/channel-token";
import { listContacts, listGroups, getChatDetails } from "@/lib/uazapi/client";
import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

const MAX_AVATAR_SYNC = 80;
const AVATAR_SYNC_DELAY_MS = 180;


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
  let syncedJids: string[] = [];
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
      if (!err) {
        contactsCount = rows.length;
        syncedJids = rows.map((r) => r.jid);
      }
    }
  }

  let avatars_synced = 0;
  if (syncedJids.length > 0) {
    const toFetch = syncedJids.slice(0, MAX_AVATAR_SYNC);
    for (const jid of toFetch) {
      try {
        const detail = await getChatDetails(resolved.token, jid, { preview: true });
        const url = detail.data?.imagePreview ?? detail.data?.image;
        if (url && typeof url === "string" && url.trim()) {
          await supabase
            .from("channel_contacts")
            .update({ avatar_url: url.trim(), synced_at: new Date().toISOString() })
            .eq("channel_id", channelId)
            .eq("company_id", companyId)
            .eq("jid", jid);
          avatars_synced += 1;
        }
      } catch {
        // ignore per-contact errors
      }
      await new Promise((r) => setTimeout(r, AVATAR_SYNC_DELAY_MS));
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

  if (avatars_synced > 0 || contactsCount > 0) {
    await invalidateConversationList(companyId);
  }

  return NextResponse.json({
    ok: true,
    contacts_synced: contactsCount,
    groups_synced: groupsCount,
    avatars_synced: avatars_synced,
    contacts_error: contactsRes.ok ? undefined : contactsRes.error,
    groups_error: groupsRes.ok ? undefined : groupsRes.error,
  });
}
