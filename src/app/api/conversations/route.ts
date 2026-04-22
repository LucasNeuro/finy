import { getCompanyIdFromRequest } from "@/lib/auth/get-company";
import { getProfileForCompany, requirePermission } from "@/lib/auth/get-profile";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { toCanonicalDigits } from "@/lib/phone-canonical";
import { withMetricsHeaders } from "@/lib/api/metrics";
import { getCachedConversationList, setCachedConversationList } from "@/lib/redis/inbox-state";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { getCommercialQueueIdSet } from "@/lib/queue/commercial";
import { NextResponse } from "next/server";

/** Busca nomes dos atendentes (bypass RLS — profiles só permite SELECT do próprio perfil). */
async function fetchAssignedNames(companyId: string, assignedIds: string[]): Promise<Record<string, string>> {
  if (assignedIds.length === 0) return {};
  const admin = createServiceRoleClient();
  const { data: profiles } = await admin
    .from("profiles")
    .select("user_id, full_name")
    .eq("company_id", companyId)
    .in("user_id", assignedIds);
  return (profiles ?? []).reduce(
    (acc, p) => ({ ...acc, [p.user_id]: (p.full_name ?? "").trim() || "—" }),
    {} as Record<string, string>
  );
}

function formatGroupJidForDisplay(jid: string): string {
  const raw = (jid || "").replace(/@.*$/, "").trim();
  if (raw.length > 12) return `Grupo ${raw.slice(0, 8)}…`;
  return raw ? `Grupo ${raw}` : "Grupo";
}

/** Normaliza customer_phone para exibição (Brasil): formato canônico 55+DDD+9 dígitos */
function normalizePhoneForDisplay(raw: string | null | undefined): string | null {
  if (raw == null || raw === "") return null;
  return toCanonicalDigits(raw) ?? raw;
}

/** Chave estável para deduplicar o mesmo contato quando phone/jid variam de formato. */
function conversationIdentityKey(c: {
  channel_id?: string | null;
  customer_phone?: string | null;
  wa_chat_jid?: string | null;
  external_id?: string | null;
}): string {
  const channel = c.channel_id ?? "";
  const phoneNorm = toCanonicalDigits(c.customer_phone ?? "") ?? "";
  const waNorm = toCanonicalDigits((c.wa_chat_jid ?? "").replace(/@.*$/, "")) ?? "";
  const extNorm = toCanonicalDigits((c.external_id ?? "").replace(/@.*$/, "")) ?? "";
  const bestDigits = phoneNorm || waNorm || extNorm;
  if (bestDigits) return `${channel}|${bestDigits}`;
  const waRaw = String(c.wa_chat_jid ?? "").trim().toLowerCase();
  const extRaw = String(c.external_id ?? "").trim().toLowerCase();
  return `${channel}|${waRaw || extRaw}`;
}

async function resolveStatusSlugsForList(
  supabase: Awaited<ReturnType<typeof createClient>>,
  companyId: string,
  queueId?: string
): Promise<{ active: string[]; closed: string[]; unassigned: string[] }> {
  const fallbackActive = ["open", "in_progress", "in_queue", "waiting"];
  const fallbackClosed = ["closed"];
  try {
    const query = supabase
      .from("company_ticket_statuses")
      .select("slug, is_closed, queue_id")
      .eq("company_id", companyId);
    const { data } = queueId
      ? await query.or(`queue_id.eq.${queueId},queue_id.is.null`)
      : await query;
    const rows = (data ?? []) as { slug: string; is_closed?: boolean; queue_id?: string | null }[];
    const active = [...new Set(rows.filter((r) => !r.is_closed).map((r) => String(r.slug || "").trim().toLowerCase()).filter(Boolean))];
    const closed = [...new Set(rows.filter((r) => !!r.is_closed).map((r) => String(r.slug || "").trim().toLowerCase()).filter(Boolean))];
    // Nunca remove os slugs base da operação; evita "sumir tudo" no chat/tickets
    // quando a configuração de status estiver incompleta.
    const activeFinal = [...new Set([...(active.length > 0 ? active : []), ...fallbackActive])];
    const closedFinal = [...new Set([...(closed.length > 0 ? closed : []), ...fallbackClosed])];
    const unassignedPreferred = activeFinal.filter((s) => s === "open" || s === "in_queue");
    const unassignedFinal = unassignedPreferred.length > 0 ? unassignedPreferred : activeFinal;
    return { active: activeFinal, closed: closedFinal, unassigned: unassignedFinal };
  } catch {
    return { active: fallbackActive, closed: fallbackClosed, unassigned: ["open", "in_queue"] };
  }
}

async function enrichWithStatusVisuals<T extends { status?: string; queue_id?: string | null; assigned_to?: string | null }>(
  supabase: Awaited<ReturnType<typeof createClient>>,
  companyId: string,
  list: T[]
): Promise<(T & { ticket_status_name?: string | null; ticket_status_color_hex?: string | null })[]> {
  if (list.length === 0) return list;
  try {
    const { data } = await supabase
      .from("company_ticket_statuses")
      .select("slug, name, color_hex, queue_id")
      .eq("company_id", companyId);
    const rows = (data ?? []) as { slug: string; name: string; color_hex?: string | null; queue_id?: string | null }[];
    const globalMap = new Map<string, { name: string; color_hex: string | null }>();
    const queueMap = new Map<string, Map<string, { name: string; color_hex: string | null }>>();
    for (const r of rows) {
      const slug = String(r.slug || "").trim().toLowerCase();
      if (!slug) continue;
      const payload = { name: r.name?.trim() || slug, color_hex: r.color_hex?.trim() || null };
      if (!r.queue_id) {
        if (!globalMap.has(slug)) globalMap.set(slug, payload);
      } else {
        const m = queueMap.get(r.queue_id) ?? new Map<string, { name: string; color_hex: string | null }>();
        m.set(slug, payload);
        queueMap.set(r.queue_id, m);
      }
    }
    return list.map((c) => {
      const raw = String(c.status || "open").trim().toLowerCase();
      // Mantém comportamento atual: quando atribuído e status "de entrada", exibe "Em atendimento".
      const effective =
        raw === "closed"
          ? "closed"
          : c.assigned_to && (raw === "open" || raw === "in_queue" || raw === "waiting")
            ? "in_progress"
            : (raw || "open");
      const queueScoped = c.queue_id ? queueMap.get(c.queue_id)?.get(effective) : null;
      const resolved = queueScoped ?? globalMap.get(effective) ?? null;
      return {
        ...c,
        ticket_status_name: resolved?.name ?? null,
        ticket_status_color_hex: resolved?.color_hex ?? null,
      };
    });
  } catch {
    return list;
  }
}

/**
 * Cards da inbox / filas: (1) conversas “novas” (sem atendente + open/in_queue) no topo;
 * (2) demais por última mensagem (WhatsApp / banco), mais recente primeiro; (3) empate em data → id estável.
 * Sync de histórico usa `last_message_at` real; placeholder sem timestamp na UAZ não deve ser “agora” (ver sync-history-config).
 */
function sortQueuesListNewFirst<
  T extends { id?: string; assigned_to?: string | null; status?: string; last_message_at: string },
>(list: T[]): T[] {
  return [...list].sort((a, b) => {
    const aNew = (a.assigned_to == null || a.assigned_to === "") && (a.status === "open" || a.status === "in_queue");
    const bNew = (b.assigned_to == null || b.assigned_to === "") && (b.status === "open" || b.status === "in_queue");
    if (aNew && !bNew) return -1;
    if (!aNew && bNew) return 1;
    const byTime = new Date(b.last_message_at).getTime() - new Date(a.last_message_at).getTime();
    if (byTime !== 0) return byTime;
    const aid = typeof a.id === "string" ? a.id : "";
    const bid = typeof b.id === "string" ? b.id : "";
    return bid.localeCompare(aid);
  });
}

export async function GET(request: Request) {
  const startTime = performance.now();
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
  const onlyUnassigned = searchParams.get("only_unassigned") === "1";
  const includeClosed = searchParams.get("include_closed") === "1";
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

  const commercialQueueIds =
    user && !canSeeAll && !canManageTickets
      ? await getCommercialQueueIdSet(supabase, companyId, allowedQueueIds)
      : new Set<string>();
  const shouldRestrictCommercial = !!user && !canSeeAll && !canManageTickets && commercialQueueIds.size > 0;
  const filterCommercialRows = <T extends { queue_id?: string | null; assigned_to?: string | null }>(rows: T[]): T[] => {
    if (!shouldRestrictCommercial || !user) return rows;
    return rows.filter((row) => {
      const qid = row.queue_id ?? null;
      if (!qid || !commercialQueueIds.has(qid)) return true;
      return row.assigned_to === user.id;
    });
  };

  type ConvRow = { id: string; channel_id: string; external_id: string; wa_chat_jid: string | null; kind: string; is_group: boolean; customer_phone: string; customer_name: string | null; queue_id: string | null; assigned_to: string | null; status: string; last_message_at: string; created_at: string };

  if (allowedQueueIds !== null && allowedQueueIds.length === 0 && allowedGroupKeys.length === 0) {
    const res = NextResponse.json({ data: [], total: 0, has_more: false, next_offset: 0 });
    return withMetricsHeaders(res, { cacheHit: false, startTime });
  }

  // Cache Redis para todos (inbox e tickets). Atendimento fluido: não esperar carregar toda vez.
  const useCache = !skipCache && offset === 0 && limit <= 500;
  if (useCache) {
    const userScope = user?.id ?? "anon";
    const cached = await getCachedConversationList(
      companyId,
      queueIdParam ?? "",
      status ?? "",
      onlyAssignedToMe ? "1" : "0",
      includeClosed,
      onlyUnassigned,
      offset,
      limit,
      userScope
    );
    if (cached) {
      let sorted = !onlyAssignedToMe && !includeClosed && !onlyUnassigned
        ? sortQueuesListNewFirst((cached.data ?? []) as { assigned_to?: string | null; status?: string; last_message_at: string; channel_id?: string; customer_phone?: string; is_group?: boolean }[])
        : (cached.data ?? []) as { assigned_to?: string | null; channel_id?: string; customer_phone?: string; is_group?: boolean }[];
      sorted = filterCommercialRows(
        sorted as { queue_id?: string | null; assigned_to?: string | null }[] & typeof sorted
      ) as typeof sorted;
      // Deduplica contatos (mesmo canal + mesmo telefone) também ao ler do cache
      const seen = new Set<string>();
      sorted = sorted.filter((c) => {
        if (c.is_group === true) return true;
        const key = conversationIdentityKey(c as {
          channel_id?: string | null;
          customer_phone?: string | null;
          wa_chat_jid?: string | null;
          external_id?: string | null;
        });
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
      // Garantir assigned_to_name mesmo quando veio do cache (cache antigo pode não ter)
      const cachedList = sorted as { assigned_to?: string | null; assigned_to_name?: string | null }[];
      const needNames = cachedList.some((c) => c.assigned_to && (c.assigned_to_name == null || c.assigned_to_name === ""));
      if (needNames) {
        const assignedIds = [...new Set(cachedList.map((c) => c.assigned_to).filter(Boolean))] as string[];
        const assignedNames = await fetchAssignedNames(companyId, assignedIds);
        sorted = cachedList.map((c) => ({
          ...c,
          assigned_to_name: c.assigned_to ? assignedNames[c.assigned_to] ?? null : null,
        })) as typeof sorted;
      }
      const sortedWithStatusVisuals = await enrichWithStatusVisuals(
        supabase,
        companyId,
        sorted as { status?: string; queue_id?: string | null; assigned_to?: string | null }[]
      );
      const cachedMeta = cached as { has_more?: boolean; next_offset?: number };
      const hasMoreCached =
        typeof cachedMeta.has_more === "boolean"
          ? cachedMeta.has_more
          : sortedWithStatusVisuals.length >= limit;
      const nextOffsetCached =
        typeof cachedMeta.next_offset === "number" ? cachedMeta.next_offset : hasMoreCached ? limit : offset;
      const res = NextResponse.json({
        data: sortedWithStatusVisuals,
        total: sortedWithStatusVisuals.length,
        has_more: hasMoreCached,
        next_offset: nextOffsetCached,
      });
      return withMetricsHeaders(res, { cacheHit: true, startTime });
    }
  }

  const selectFields = "id, channel_id, external_id, wa_chat_jid, kind, is_group, customer_phone, customer_name, queue_id, assigned_to, status, last_message_at, created_at";
  const { active: activeStatuses, closed: closedStatuses, unassigned: unassignedStatuses } =
    await resolveStatusSlugsForList(supabase, companyId, queueIdParam);
  const statusesForList = includeClosed
    ? [...new Set([...activeStatuses, ...closedStatuses])]
    : activeStatuses;

  let q = supabase
    .from("conversations")
    .select(selectFields, { count: "exact" })
    .eq("company_id", companyId)
    .order("last_message_at", { ascending: false })
    .order("id", { ascending: false });

  if (allowedQueueIds !== null) {
    if (allowedGroupKeys.length === 0) {
      q = q.in("queue_id", allowedQueueIds);
    } else {
      const groupPart = `external_id.in.("${allowedGroupKeys.map((k) => k.group_jid).join('","')}")`;
      const queuePart = allowedQueueIds.length > 0 ? `queue_id.in.(${allowedQueueIds.join(",")})` : "";
      q = q.or(queuePart ? `${queuePart},${groupPart}` : groupPart);
    }
  }
  if (onlyAssignedToMe && user) {
    q = q.eq("assigned_to", user.id);
  }
  if (onlyUnassigned) {
    q = q.is("assigned_to", null);
    q = q.in("status", unassignedStatuses);
  }
  if (status) {
    q = q.eq("status", status);
  } else {
    q = q.in("status", statusesForList);
  }
  if (queueIdParam) {
    q = q.eq("queue_id", queueIdParam);
    if (allowedQueueIds !== null && !allowedQueueIds.includes(queueIdParam)) {
      const groupJids = [...new Set(allowedGroupKeys.map((k) => k.group_jid))];
      if (groupJids.length === 0)
        return NextResponse.json({ data: [], total: 0, has_more: false, next_offset: offset });
      q = supabase
        .from("conversations")
        .select(selectFields, { count: "exact" })
        .eq("company_id", companyId)
        .in("external_id", groupJids)
        .order("last_message_at", { ascending: false })
        .order("id", { ascending: false });
      const filteredByChannel = (rows: ConvRow[]) => rows.filter((c) => allowedGroupKeys.some((k) => k.channel_id === c.channel_id && k.group_jid === c.external_id));
      const statusFilter = status ? q.eq("status", status) : q.in("status", statusesForList);
      const { data: groupData, error: groupErr } = await statusFilter.range(offset, offset + limit - 1);
      if (groupErr) return NextResponse.json({ error: groupErr.message }, { status: 500 });
      const rawGroupPageCount = (groupData ?? []).length;
      const list = filteredByChannel((groupData ?? []) as ConvRow[]);
      const commercialFiltered = filterCommercialRows(list);
      const gAssignedIds = [...new Set(commercialFiltered.map((c) => c.assigned_to).filter(Boolean))] as string[];
      const gAssignedNames = await fetchAssignedNames(companyId, gAssignedIds);
      const listWithNames = commercialFiltered.map((c) => ({ ...c, assigned_to_name: c.assigned_to ? gAssignedNames[c.assigned_to] ?? null : null }));
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
      const gWithStatusVisuals = await enrichWithStatusVisuals(supabase, companyId, gWithPreview);
      const gHasMore = rawGroupPageCount >= limit;
      const gNextOffset = offset + rawGroupPageCount;
      return NextResponse.json({
        data: gWithStatusVisuals,
        total: gWithStatusVisuals.length,
        has_more: gHasMore,
        next_offset: gNextOffset,
      });
    }
  }
  q = q.range(offset, offset + limit - 1);

  const { data, error } = await q;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  const rawPageRowCount = (data ?? []).length;
  let result = (data ?? []) as ConvRow[];
  if (allowedQueueIds !== null && allowedGroupKeys.length > 0) {
    result = result.filter((c) => {
      if (c.queue_id && allowedQueueIds!.includes(c.queue_id)) return true;
      if (allowedGroupKeys.some((k) => k.channel_id === c.channel_id && k.group_jid === c.external_id)) return true;
      return false;
    });
  }
  result = filterCommercialRows(result);

  const assignedIds = [...new Set(result.map((c) => c.assigned_to).filter(Boolean))] as string[];
  const assignedNames = await fetchAssignedNames(companyId, assignedIds);
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
  let channelNameById: Record<string, string> = {};
  if (channelIds.length > 0) {
    const { data: chList } = await supabase
      .from("channels")
      .select("id, name")
      .in("id", channelIds)
      .eq("company_id", companyId);
    channelNameById = ((chList ?? []) as { id: string; name: string | null }[]).reduce(
      (acc, ch) => ({ ...acc, [ch.id]: (ch.name ?? "").trim() || "—" }),
      {} as Record<string, string>
    );
  }
  let contactByKey: Record<string, { contact_name: string | null; first_name: string | null; avatar_url: string | null }> = {};
  let groupByKey: Record<string, { name: string | null; avatar_url: string | null }> = {};
  if (channelIds.length > 0) {
    const [contactsRes, groupsRes] = await Promise.all([
      supabase
        .from("channel_contacts")
        .select("channel_id, jid, contact_name, first_name, avatar_url")
        .in("channel_id", channelIds)
        .eq("company_id", companyId),
      supabase
        .from("channel_groups")
        .select("channel_id, jid, name, avatar_url")
        .in("channel_id", channelIds)
        .eq("company_id", companyId),
    ]);
    const list = (contactsRes.data ?? []) as { channel_id: string; jid: string; contact_name: string | null; first_name: string | null; avatar_url: string | null }[];
    for (const row of list) {
      const key = `${row.channel_id}|${row.jid}`;
      const val = { contact_name: row.contact_name, first_name: row.first_name, avatar_url: row.avatar_url ?? null };
      contactByKey[key] = val;
      const digitsOnly = row.jid.replace(/@.*$/, "").replace(/\D/g, "").trim() || row.jid;
      if (digitsOnly !== row.jid) contactByKey[`${row.channel_id}|${digitsOnly}`] = val;
      const withSuffix = row.jid.includes("@") ? row.jid : `${digitsOnly}@s.whatsapp.net`;
      if (withSuffix !== row.jid) contactByKey[`${row.channel_id}|${withSuffix}`] = val;
    }
    const groupList = (groupsRes.data ?? []) as { channel_id: string; jid: string; name: string | null; avatar_url: string | null }[];
    for (const g of groupList) {
      const key = `${g.channel_id}|${g.jid}`;
      groupByKey[key] = { name: g.name?.trim() || null, avatar_url: g.avatar_url?.trim() || null };
    }
  }
  const normalizeJid = (v: string) => (v && !v.includes("@") ? `${v.replace(/\D/g, "")}@s.whatsapp.net` : v);
  listWithPreview = listWithPreview.map((c) => {
    const jid = c.wa_chat_jid || c.external_id || c.customer_phone || "";
    const jidNorm = normalizeJid(jid);
    const key1 = `${c.channel_id}|${jid}`;
    const key2 = jid !== jidNorm ? `${c.channel_id}|${jidNorm}` : "";
    const jidDigits = jid.replace(/\D/g, "").replace(/@.*$/, "").trim();
    const key3 = jidDigits ? `${c.channel_id}|${jidDigits}` : "";
    const isGroup = c.is_group === true;
    const groupInfo = isGroup ? (groupByKey[key1] ?? groupByKey[key2] ?? { name: null, avatar_url: null }) : null;
    const groupName = groupInfo?.name ?? null;
    const cc = contactByKey[key1] || (key2 ? contactByKey[key2] : null) || (key3 ? contactByKey[key3] : null);
    const fromDb = cc?.contact_name?.trim() || cc?.first_name?.trim() || null;
    const customer_name = isGroup ? (groupName ?? c.customer_name ?? formatGroupJidForDisplay(jid)) : (fromDb ?? c.customer_name);
    const avatar_url = isGroup ? (groupInfo?.avatar_url ?? null) : (cc?.avatar_url?.trim() || null);
    const customer_phone = isGroup ? c.customer_phone : (normalizePhoneForDisplay(c.customer_phone) ?? c.customer_phone);
    return { ...c, customer_name, avatar_url, customer_phone };
  });

  listWithPreview = listWithPreview.map((c) => ({
    ...c,
    channel_name: channelNameById[c.channel_id] ?? null,
  }));
  listWithPreview = await enrichWithStatusVisuals(supabase, companyId, listWithPreview);

  // Evita mesmo contato aparecer 2x (ex.: external_id diferente ou customer_phone 55 vs sem 55)
  const seenTicketKey = new Set<string>();
  listWithPreview = listWithPreview.filter((c) => {
    if (c.is_group === true) return true;
    const key = conversationIdentityKey(c as {
      channel_id?: string | null;
      customer_phone?: string | null;
      wa_chat_jid?: string | null;
      external_id?: string | null;
    });
    if (seenTicketKey.has(key)) return false;
    seenTicketKey.add(key);
    return true;
  });

  if (!onlyAssignedToMe && !includeClosed) {
    listWithPreview = sortQueuesListNewFirst(listWithPreview);
  }

  const has_more = rawPageRowCount >= limit;
  const next_offset = offset + rawPageRowCount;
  const payload = { data: listWithPreview, total: listWithPreview.length, has_more, next_offset };
  if (useCache && !skipCache) {
    const userScope = user?.id ?? "anon";
    await setCachedConversationList(
      companyId,
      queueIdParam ?? "",
      status ?? "",
      onlyAssignedToMe ? "1" : "0",
      payload,
      includeClosed,
      onlyUnassigned,
      offset,
      limit,
      userScope
    );
  }
  const res = NextResponse.json(payload);
  return withMetricsHeaders(res, { cacheHit: false, startTime });
}
