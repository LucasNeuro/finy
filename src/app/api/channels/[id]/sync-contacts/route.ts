import { getCompanyIdFromRequest } from "@/lib/auth/get-company";
import { requirePermission } from "@/lib/auth/get-profile";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { invalidateConversationList } from "@/lib/redis/inbox-state";
import { getChannelToken } from "@/lib/uazapi/channel-token";
import { listContacts, listGroups, getChatDetails, getGroupInfo } from "@/lib/uazapi/client";
import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

const MAX_AVATAR_SYNC = 200;
const AVATAR_SYNC_DELAY_MS = 120;
const MAX_GROUP_INFO_ENRICH = 25;
const GROUP_INFO_DELAY_MS = 400;

/** Normaliza JID de grupo para formato único: trim, lowercase, sufixo @g.us se faltar */
function normalizeGroupJid(jid: string): string {
  const s = (jid ?? "").trim();
  if (!s) return "";
  const lower = s.toLowerCase();
  if (lower.endsWith("@g.us")) return lower;
  if (/^\d+$/.test(s)) return `${s}@g.us`;
  return lower;
}

/** Normaliza JID de contato para formato único: número em dígitos + @s.whatsapp.net (lowercase) */
function normalizeContactJid(jid: string): string {
  const s = (jid ?? "").trim();
  const digits = s.replace(/\D/g, "");
  if (digits) return `${digits}@s.whatsapp.net`;
  const lower = s.toLowerCase();
  if (lower.endsWith("@s.whatsapp.net")) return lower;
  return s || jid;
}

type ProgressCallback = (progress: number, data?: { contacts_synced?: number; groups_synced?: number; avatars_synced?: number; error?: string }) => void;

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const url = new URL(request.url);
  const streamProgress = url.searchParams.get("stream") === "1";
  const clearFirst = url.searchParams.get("clear") === "1";

  try {
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

    if (!streamProgress) {
      const result = await runSync(resolved.token, channelId, companyId, () => {}, clearFirst);
      return NextResponse.json(result);
    }

    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        const send = (obj: object) => {
          controller.enqueue(encoder.encode(JSON.stringify(obj) + "\n"));
        };
        try {
          send({ progress: 0 });
          const result = await runSync(resolved.token, channelId, companyId, (p) => send({ progress: p }), clearFirst);
          send({ progress: 100, ...result });
        } catch (err) {
          const message = err instanceof Error ? err.message : "Erro ao sincronizar";
          send({ progress: 100, ok: false, error: message });
        } finally {
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "application/x-ndjson",
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erro ao sincronizar contatos";
    if (process.env.NODE_ENV !== "test") {
      console.error("[sync-contacts]", err);
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

async function runSync(
  token: string,
  channelId: string,
  companyId: string,
  onProgress: ProgressCallback,
  clearFirst = false
): Promise<{ ok: boolean; contacts_synced?: number; groups_synced?: number; avatars_synced?: number; error?: string }> {
  // Opcional: limpar tudo do canal antes (evita resquícios de duplicatas)
  const supabase = await createClient();
  if (clearFirst) {
    await supabase.from("channel_contacts").delete().eq("channel_id", channelId).eq("company_id", companyId);
    await supabase.from("channel_groups").delete().eq("channel_id", channelId).eq("company_id", companyId);
  }

  // Sem duplicar: apaga todos os contatos deste canal e insere só os da API (JID normalizado + deduplicado).
  onProgress(5);
  const [contactsRes, groupsRes] = await Promise.all([
    listContacts(token),
    listGroups(token, { force: true, noparticipants: true }),
  ]);
  onProgress(15);

  let contactsCount = 0;
  let syncedJids: string[] = [];

  if (contactsRes.ok && Array.isArray(contactsRes.data) && contactsRes.data.length > 0) {
    const seen = new Set<string>();
    const rows = contactsRes.data
      .map((c) => {
        const rawJid = (typeof (c as { jid?: string }).jid === "string"
          ? (c as { jid: string }).jid
          : typeof (c as { JID?: string }).JID === "string"
            ? (c as { JID: string }).JID
            : ""
        ).trim();
        const jid = normalizeContactJid(rawJid);
        if (!jid || seen.has(jid)) return null;
        seen.add(jid);
        const phone = jid.replace(/@.*$/, "").replace(/\D/g, "") || null;
        return {
          channel_id: channelId,
          company_id: companyId,
          jid,
          phone: phone || null,
          contact_name: (c.contactName ?? (c as { contact_name?: string }).contact_name ?? "").trim() || null,
          first_name: ((c as { contact_FirstName?: string }).contact_FirstName ?? "").trim() || null,
        };
      })
      .filter((r): r is NonNullable<typeof r> => r !== null);
    if (rows.length > 0) {
      await supabase
        .from("channel_contacts")
        .delete()
        .eq("channel_id", channelId)
        .eq("company_id", companyId);
      const { error: err } = await supabase.from("channel_contacts").insert(rows);
      if (!err) {
        contactsCount = rows.length;
        syncedJids = rows.map((r) => r.jid);
      }
    }
  }
  onProgress(30);

  let avatars_synced = 0;
  if (syncedJids.length > 0) {
    const toFetch = syncedJids.slice(0, MAX_AVATAR_SYNC);
    for (let i = 0; i < toFetch.length; i++) {
      const jid = toFetch[i];
      try {
        const detail = await getChatDetails(token, jid, { preview: true });
        const imageUrl = detail.data?.imagePreview ?? detail.data?.image;
        if (imageUrl && typeof imageUrl === "string" && imageUrl.trim()) {
          await supabase
            .from("channel_contacts")
            .update({ avatar_url: imageUrl.trim(), synced_at: new Date().toISOString() })
            .eq("channel_id", channelId)
            .eq("company_id", companyId)
            .eq("jid", jid);
          avatars_synced += 1;
        }
      } catch {
        // ignore
      }
      await new Promise((r) => setTimeout(r, AVATAR_SYNC_DELAY_MS));
      onProgress(30 + Math.round((35 * (i + 1)) / toFetch.length));
    }
  }
  onProgress(65);

  let groupsCount = 0;
  if (groupsRes.ok && Array.isArray(groupsRes.data) && groupsRes.data.length > 0) {
    // Preservar is_community dos grupos já salvos antes de apagar
    const { data: existingGroups } = await supabase
      .from("channel_groups")
      .select("jid")
      .eq("channel_id", channelId)
      .eq("company_id", companyId)
      .eq("is_community", true);
    const communityJids = new Set<string>(
      (existingGroups ?? []).map((r) => normalizeGroupJid(r.jid)).filter(Boolean)
    );

    const raw = groupsRes.data;
    const seen = new Set<string>();
    const rows = raw
      .map((g: { JID?: string; jid?: string; Name?: string; Topic?: string; name?: string; topic?: string; subject?: string; description?: string; invite_link?: string }) => {
        const rawJid = (typeof g.JID === "string" ? g.JID : typeof g.jid === "string" ? g.jid : "").trim();
        const jid = normalizeGroupJid(rawJid);
        if (!jid || seen.has(jid)) return null;
        seen.add(jid);
        const nameStr = (g.Name ?? g.name ?? g.subject ?? "").trim() || null;
        const topicStr = (g.Topic ?? g.topic ?? g.description ?? "").trim() || null;
        return {
          channel_id: channelId,
          company_id: companyId,
          jid,
          name: nameStr,
          topic: topicStr,
          invite_link: (g.invite_link ?? "").trim() || null,
          left_at: null,
          is_community: communityJids.has(jid),
        };
      })
      .filter((r): r is NonNullable<typeof r> => r !== null);

    await supabase
      .from("channel_groups")
      .delete()
      .eq("channel_id", channelId)
      .eq("company_id", companyId);

    if (rows.length > 0) {
      const { error: err } = await supabase
        .from("channel_groups")
        .upsert(rows, { onConflict: "channel_id,jid", ignoreDuplicates: false });
      if (!err) groupsCount = rows.length;
    }
    onProgress(80);

    const withoutName = rows.filter((r) => !r.name || !r.name.trim());
    if (withoutName.length > 0 && groupsCount > 0) {
      const toEnrich = withoutName.slice(0, MAX_GROUP_INFO_ENRICH);
      for (let i = 0; i < toEnrich.length; i++) {
        const g = toEnrich[i];
        try {
          const info = await getGroupInfo(token, g.jid, { getInviteLink: true });
          if (info.ok && info.data) {
            const name = (info.data.Name ?? (info.data as { name?: string }).name ?? "").trim() || null;
            const topic = (info.data.Topic ?? (info.data as { topic?: string }).topic ?? "").trim() || null;
            const invite = (info.data.InviteLink ?? (info.data as { invite_link?: string }).invite_link ?? "").trim() || null;
            if (name || topic || invite) {
              await supabase
                .from("channel_groups")
                .update({
                  ...(name && { name }),
                  ...(topic && { topic }),
                  ...(invite && { invite_link: invite }),
                  synced_at: new Date().toISOString(),
                })
                .eq("channel_id", channelId)
                .eq("company_id", companyId)
                .eq("jid", g.jid);
            }
          }
        } catch {
          // ignore
        }
        if (i < toEnrich.length - 1) {
          await new Promise((r) => setTimeout(r, GROUP_INFO_DELAY_MS));
        }
        onProgress(80 + Math.round((10 * (i + 1)) / toEnrich.length));
      }
    }
  }
  onProgress(95);

  if (avatars_synced > 0 || contactsCount > 0) {
    try {
      await invalidateConversationList(companyId);
    } catch {
      // ignore
    }
  }

  return {
    ok: true,
    contacts_synced: contactsCount,
    groups_synced: groupsCount,
    avatars_synced: avatars_synced,
  };
}
