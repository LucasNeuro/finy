import { getCompanyIdFromRequest } from "@/lib/auth/get-company";
import { getProfileForCompany, requirePermission } from "@/lib/auth/get-profile";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { getCachedConversationList, setCachedConversationList } from "@/lib/redis/inbox-state";
import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

function formatGroupJidForDisplay(jid: string): string {
  const raw = (jid || "").replace(/@.*$/, "").trim();
  if (raw.length > 12) return `Grupo ${raw.slice(0, 8)}…`;
  return raw ? `Grupo ${raw}` : "Grupo";
}

export async function GET(request: Request) {
  const companyId = await getCompanyIdFromRequest(request);
  if (!companyId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const readErr = await requirePermission(companyId, PERMISSIONS.inbox.read);
  if (readErr) {
    return NextResponse.json({ error: readErr.error }, { status: readErr.status });
  }
  const { searchParams } = new URL(request.url);
  const queueIdParam = searchParams.get("queue_id") ?? undefined;
  const status = searchParams.get("status") ?? undefined;
  const onlyAssignedToMe = searchParams.get("only_assigned_to_me") === "1";
  const skipCache = searchParams.get("skip_cache") === "1" || searchParams.get("nocache") === "1";
  const limit = Math.min(Number(searchParams.get("limit")) || 200, 500);
  const offset = Number(searchParams.get("offset")) || 0;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  let allowedQueueIds: string[] | null = null;
  let allowedGroupKeys: { channel_id: string; group_jid: string }[] = [];
  let canSeeAll = false;
  let canManageTickets = false;
  if (user) {
    const profile = await getProfileForCompany(companyId);
    if (profile) {
      const [seeAllErr, manageErr] = await Promise.all([
        requirePermission(companyId, PERMISSIONS.inbox.see_all),
        requirePermission(companyId, PERMISSIONS.inbox.manage_tickets),
      ]);
      canSeeAll = seeAllErr === null;
      canManageTickets = manageErr === null;
      if (!canSeeAll && !canManageTickets) {
        const { data: assignments } = await supabase
          .from("queue_assignments")
          .select("queue_id")
          .eq("user_id", user.id)
          .eq("company_id", companyId);
        allowedQueueIds = (assignments ?? []).map((r: { queue_id: string }) => r.queue_id);
        const { data: groupAssignments } = await supabase
          .from("channel_group_assignments")
          .select("channel_id, group_jid")
          .eq("user_id", user.id)
          .eq("company_id", companyId);
        allowedGroupKeys = (groupAssignments ?? []).map((r: { channel_id: string; group_jid: string }) => ({ channel_id: r.channel_id, group_jid: r.group_jid }));
      }
    }
  }

  type ConvRow = { id: string; channel_id: string; external_id: string; wa_chat_jid: string | null; kind: string; is_group: boolean; customer_phone: string; customer_name: string | null; queue_id: string | null; assigned_to: string | null; status: string; last_message_at: string; created_at: string };

  if (allowedQueueIds !== null && allowedQueueIds.length === 0 && allowedGroupKeys.length === 0) {
    return NextResponse.json({ data: [], total: 0 });
  }

  const useCache = !skipCache && (canSeeAll || canManageTickets) && offset === 0;
  if (useCache) {
    const cached = await getCachedConversationList(
      companyId,
      queueIdParam ?? "",
      status ?? "",
      onlyAssignedToMe ? "1" : "0"
    );
    if (cached) return NextResponse.json(cached);
  }

  const selectFields = "id, channel_id, external_id, wa_chat_jid, kind, is_group, customer_phone, customer_name, queue_id, assigned_to, status, last_message_at, created_at";

  let q = supabase
    .from("conversations")
    .select(selectFields, { count: "exact" })
    .eq("company_id", companyId)
    .order("last_message_at", { ascending: false });

  if (allowedQueueIds !== null) {
    if (allowedGroupKeys.length === 0) {
      q = q.in("queue_id", allowedQueueIds);
    } else {
      q = q.or(`queue_id.in.(${allowedQueueIds.join(",")}),external_id.in.("${allowedGroupKeys.map((k) => k.group_jid).join('","')}")`);
    }
  }
  if (onlyAssignedToMe && user && !canSeeAll && !canManageTickets) {
    q = q.eq("assigned_to", user.id);
  }
  if (queueIdParam) {
    q = q.eq("queue_id", queueIdParam);
    if (allowedQueueIds !== null && !allowedQueueIds.includes(queueIdParam)) {
      const groupJids = [...new Set(allowedGroupKeys.map((k) => k.group_jid))];
      if (groupJids.length === 0) return NextResponse.json({ data: [], total: 0 });
      q = supabase
        .from("conversations")
        .select(selectFields, { count: "exact" })
        .eq("company_id", companyId)
        .in("external_id", groupJids)
        .order("last_message_at", { ascending: false });
      const filteredByChannel = (rows: ConvRow[]) => rows.filter((c) => allowedGroupKeys.some((k) => k.channel_id === c.channel_id && k.group_jid === c.external_id));
      const { data: groupData, error: groupErr } = await (status ? q.eq("status", status) : q).range(offset, offset + limit - 1);
      if (groupErr) return NextResponse.json({ error: groupErr.message }, { status: 500 });
      const list = filteredByChannel((groupData ?? []) as ConvRow[]);
      const gAssignedIds = [...new Set(list.map((c) => c.assigned_to).filter(Boolean))] as string[];
      let gAssignedNames: Record<string, string> = {};
      if (gAssignedIds.length > 0) {
        const { data: gProfiles } = await supabase.from("profiles").select("user_id, full_name").eq("company_id", companyId).in("user_id", gAssignedIds);
        gAssignedNames = (gProfiles ?? []).reduce((acc, p) => ({ ...acc, [(p as { user_id: string }).user_id]: ((p as { full_name?: string }).full_name ?? "").trim() || "—" }), {} as Record<string, string>);
      }
      const listWithNames = list.map((c) => ({ ...c, assigned_to_name: c.assigned_to ? gAssignedNames[c.assigned_to] ?? null : null }));
      const gConvIds = listWithNames.map((c) => c.id);
      let gLastByConv: Record<string, { content: string; message_type?: string }> = {};
      if (gConvIds.length > 0) {
        const { data: gMsgs } = await supabase
          .from("messages")
          .select("conversation_id, content, message_type")
          .in("conversation_id", gConvIds)
          .order("sent_at", { ascending: false });
        const gList = (gMsgs ?? []) as { conversation_id: string; content: string; message_type?: string }[];
        for (const m of gList) {
          if (!gLastByConv[m.conversation_id]) gLastByConv[m.conversation_id] = { content: m.content, message_type: m.message_type ?? "text" };
        }
      }
      const gPreviewLabel: Record<string, string> = { text: "", image: "📷 Imagem", video: "🎬 Vídeo", audio: "🎵 Áudio", ptt: "🎤 Áudio", document: "📎 Documento", sticker: "🖼 Figurinha" };
      const gWithPreview = listWithNames.map((c) => {
        const last = gLastByConv[c.id];
        let last_message_preview: string | null = null;
        if (last) {
          const t = last.message_type ?? "text";
          last_message_preview = t === "text" ? (last.content || "").trim().slice(0, 60) + ((last.content || "").length > 60 ? "…" : "") : (gPreviewLabel[t] ?? t);
        }
        return { ...c, last_message_preview };
      });
      return NextResponse.json({ data: gWithPreview, total: gWithPreview.length });
    }
  }
  if (status) q = q.eq("status", status);
  q = q.range(offset, offset + limit - 1);

  const { data, error, count } = await q;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  let result = (data ?? []) as ConvRow[];
  if (allowedQueueIds !== null && allowedGroupKeys.length > 0) {
    result = result.filter((c) => {
      if (c.queue_id && allowedQueueIds!.includes(c.queue_id)) return true;
      if (allowedGroupKeys.some((k) => k.channel_id === c.channel_id && k.group_jid === c.external_id)) return true;
      return false;
    });
  }

  const assignedIds = [...new Set(result.map((c) => c.assigned_to).filter(Boolean))] as string[];
  let assignedNames: Record<string, string> = {};
  if (assignedIds.length > 0) {
    const { data: profiles } = await supabase
      .from("profiles")
      .select("user_id, full_name")
      .eq("company_id", companyId)
      .in("user_id", assignedIds);
    assignedNames = (profiles ?? []).reduce(
      (acc, p) => ({ ...acc, [(p as { user_id: string }).user_id]: ((p as { full_name?: string }).full_name ?? "").trim() || "—" }),
      {} as Record<string, string>
    );
  }
  const dataWithNames = result.map((c) => ({
    ...c,
    assigned_to_name: c.assigned_to ? assignedNames[c.assigned_to] ?? null : null,
  }));

  const convIds = dataWithNames.map((c) => c.id);
  let lastMessageByConv: Record<string, { content: string; message_type?: string }> = {};
  if (convIds.length > 0) {
    const { data: lastMsgs } = await supabase
      .from("messages")
      .select("conversation_id, content, message_type")
      .in("conversation_id", convIds)
      .order("sent_at", { ascending: false });
    const list = (lastMsgs ?? []) as { conversation_id: string; content: string; message_type?: string }[];
    for (const m of list) {
      if (!lastMessageByConv[m.conversation_id]) {
        lastMessageByConv[m.conversation_id] = { content: m.content, message_type: m.message_type ?? "text" };
      }
    }
  }
  const previewLabel: Record<string, string> = {
    text: "",
    image: "📷 Imagem",
    video: "🎬 Vídeo",
    audio: "🎵 Áudio",
    ptt: "🎤 Áudio",
    document: "📎 Documento",
    sticker: "🖼 Figurinha",
  };
  let listWithPreview = dataWithNames.map((c) => {
    const last = lastMessageByConv[c.id];
    let last_message_preview: string | null = null;
    if (last) {
      const type = last.message_type ?? "text";
      if (type === "text") {
        last_message_preview = (last.content || "").trim().slice(0, 60);
        if ((last.content || "").length > 60) last_message_preview += "…";
      } else {
        last_message_preview = previewLabel[type] ?? type;
      }
    }
    return { ...c, last_message_preview };
  });

  const channelIds = [...new Set(listWithPreview.map((c) => c.channel_id))];
  let contactByKey: Record<string, { contact_name: string | null; first_name: string | null; avatar_url: string | null }> = {};
  let groupByKey: Record<string, string | null> = {};
  if (channelIds.length > 0) {
    const [contactsRes, groupsRes] = await Promise.all([
      supabase
        .from("channel_contacts")
        .select("channel_id, jid, contact_name, first_name, avatar_url")
        .in("channel_id", channelIds)
        .eq("company_id", companyId),
      supabase
        .from("channel_groups")
        .select("channel_id, jid, name")
        .in("channel_id", channelIds)
        .eq("company_id", companyId),
    ]);
    const list = (contactsRes.data ?? []) as { channel_id: string; jid: string; contact_name: string | null; first_name: string | null; avatar_url: string | null }[];
    for (const row of list) {
      const key = `${row.channel_id}|${row.jid}`;
      contactByKey[key] = { contact_name: row.contact_name, first_name: row.first_name, avatar_url: row.avatar_url ?? null };
    }
    const groupList = (groupsRes.data ?? []) as { channel_id: string; jid: string; name: string | null }[];
    for (const g of groupList) {
      groupByKey[`${g.channel_id}|${g.jid}`] = g.name?.trim() || null;
    }
  }
  const normalizeJid = (v: string) => (v && !v.includes("@") ? `${v.replace(/\D/g, "")}@s.whatsapp.net` : v);
  listWithPreview = listWithPreview.map((c) => {
    const jid = c.wa_chat_jid || c.external_id || c.customer_phone || "";
    const jidNorm = normalizeJid(jid);
    const key1 = `${c.channel_id}|${jid}`;
    const key2 = jid !== jidNorm ? `${c.channel_id}|${jidNorm}` : "";
    const isGroup = c.is_group === true;
    const groupName = isGroup ? (groupByKey[key1] ?? groupByKey[key2] ?? null) : null;
    const cc = contactByKey[key1] || (key2 ? contactByKey[key2] : null);
    const fromDb = cc?.contact_name?.trim() || cc?.first_name?.trim() || null;
    const customer_name = isGroup ? (groupName ?? c.customer_name ?? formatGroupJidForDisplay(jid)) : (fromDb ?? c.customer_name);
    const avatar_url = isGroup ? null : (cc?.avatar_url?.trim() || null);
    return { ...c, customer_name, avatar_url };
  });

  const payload = { data: listWithPreview, total: count ?? result.length };
  if (useCache && !skipCache) {
    await setCachedConversationList(
      companyId,
      queueIdParam ?? "",
      status ?? "",
      onlyAssignedToMe ? "1" : "0",
      payload
    );
  }
  return NextResponse.json(payload);
}
