import { getCompanyIdFromRequest } from "@/lib/auth/get-company";
import { toCanonicalDigits } from "@/lib/phone-canonical";
import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

/** Corrige Brasil: DDD+0+8 dígitos → DDD+9+8 (celular). */
function fixBrazilMobileZero(d: string): string {
  if (d.length === 11 && !d.startsWith("55")) {
    const ddd = d.slice(0, 2);
    const rest = d.slice(2);
    if (/^\d{2}$/.test(ddd) && rest.length >= 9 && rest[0] === "0") return ddd + "9" + rest.slice(1, 9);
  }
  if (d.length === 13 && d.startsWith("55")) {
    const after55 = d.slice(2);
    if (after55.length >= 9 && after55[2] === "0") {
      const ddd = after55.slice(0, 2);
      const rest = after55.slice(2, 11);
      if (/^\d{2}$/.test(ddd) && rest[0] === "0") return "55" + ddd + "9" + rest.slice(1);
    }
  }
  return d;
}
/** Normaliza telefone Brasil para exibição (corrige malformados, ex.: 0 após DDD → 9). */
function normalizePhoneForDisplay(raw: string | null | undefined): string | null {
  if (raw == null || raw === "") return null;
  let d = (raw ?? "").replace(/\D/g, "");
  d = fixBrazilMobileZero(d);
  if (d.length === 10 || d.length === 11) return "55" + d;
  if ((d.length === 12 || d.length === 13) && d.startsWith("55")) return d;
  if ((d.length === 14 || d.length === 15) && !d.startsWith("55")) {
    const ddd = d.slice(0, 2);
    const mobile = d.slice(2, 11);
    if (/^\d{2}$/.test(ddd) && /^\d{9}$/.test(mobile)) return "55" + ddd + mobile;
  }
  return d || raw;
}

/**
 * GET /api/contacts?channel_id=xxx (opcional)
 * Lista contatos da empresa, opcionalmente filtrados por canal.
 * Sem Redis: sempre lê do Supabase para Contatos/Grupos terem dados completos.
 */
export async function GET(request: Request) {
  try {
    const companyId = await getCompanyIdFromRequest(request);
    if (!companyId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const channelId = searchParams.get("channel_id")?.trim();

    const supabase = await createClient();
    const pageSize = 1000;
    type ContactRow = {
      id: string;
      channel_id: string;
      jid: string;
      phone: string | null;
      contact_name: string | null;
      first_name: string | null;
      avatar_url: string | null;
      synced_at: string;
      queue_names?: string[];
      tag_names?: string[];
    };
    const allRows: ContactRow[] = [];
    let offset = 0;
    let hasMore = true;

    while (hasMore) {
      let q = supabase
        .from("channel_contacts")
        .select("id, channel_id, jid, phone, contact_name, first_name, avatar_url, synced_at")
        .eq("company_id", companyId)
        .order("contact_name")
        .order("phone")
        .range(offset, offset + pageSize - 1);

      if (channelId) {
        q = q.eq("channel_id", channelId);
      }

      const { data, error } = await q;
      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
      const chunk = data ?? [];
      const normalized = chunk.map((row) => {
        const r = row as {
          id: string;
          channel_id: string;
          jid: string;
          phone: string | null;
          contact_name: string | null;
          first_name: string | null;
          avatar_url: string | null;
          synced_at: string;
        };
        const normalizedPhone = normalizePhoneForDisplay(r.phone) ?? r.phone;
        return { ...r, phone: normalizedPhone };
      });
      allRows.push(...normalized);
      hasMore = chunk.length === pageSize;
      offset += pageSize;
    }

    // 1) Deduplicação robusta por canal + telefone canônico (ou jid quando não houver telefone)
    const byKey = new Map<string, ContactRow>();
    for (const row of allRows) {
      const digitsFromPhone = toCanonicalDigits(row.phone ?? null);
      const digitsFromJid = toCanonicalDigits((row.jid ?? "").replace(/@.*$/, ""));
      const canonical = digitsFromPhone || digitsFromJid;
      const key = `${row.channel_id}:${canonical || row.jid}`;
      const prev = byKey.get(key);
      if (!prev) {
        byKey.set(key, row);
        continue;
      }
      const prevScore =
        (prev.contact_name?.trim() ? 4 : 0) +
        (prev.first_name?.trim() ? 2 : 0) +
        (prev.avatar_url?.trim() ? 2 : 0) +
        (prev.phone?.trim() ? 1 : 0);
      const nextScore =
        (row.contact_name?.trim() ? 4 : 0) +
        (row.first_name?.trim() ? 2 : 0) +
        (row.avatar_url?.trim() ? 2 : 0) +
        (row.phone?.trim() ? 1 : 0);
      if (nextScore > prevScore) {
        byKey.set(key, row);
      } else if (nextScore === prevScore) {
        const prevSynced = new Date(prev.synced_at || 0).getTime();
        const nextSynced = new Date(row.synced_at || 0).getTime();
        if (nextSynced > prevSynced) byKey.set(key, row);
      }
    }
    const deduped = Array.from(byKey.values());
    const contactIds = deduped.map((c) => c.id);

    // 2) Tags por contato (para coluna Tags)
    const tagsByContact = new Map<string, string[]>();
    if (contactIds.length > 0) {
      const { data: tagRows } = await supabase
        .from("contact_tags")
        .select("channel_contact_id, tags(name)")
        .eq("company_id", companyId)
        .in("channel_contact_id", contactIds);

      for (const row of (tagRows ?? []) as Array<{ channel_contact_id: string; tags: { name?: string } | { name?: string }[] | null }>) {
        const t = Array.isArray(row.tags) ? row.tags[0] : row.tags;
        const tagName = t?.name?.trim();
        if (!tagName) continue;
        const prev = tagsByContact.get(row.channel_contact_id) ?? [];
        if (!prev.includes(tagName)) prev.push(tagName);
        tagsByContact.set(row.channel_contact_id, prev);
      }
    }

    // 3) Filas ativas por contato (conversas não encerradas)
    const statusMeta = new Map<string, boolean>();
    const { data: statusRows } = await supabase
      .from("company_ticket_statuses")
      .select("slug, queue_id, is_closed")
      .eq("company_id", companyId);
    for (const s of (statusRows ?? []) as Array<{ slug: string; queue_id: string | null; is_closed: boolean | null }>) {
      statusMeta.set(`${s.queue_id ?? "__global__"}:${String(s.slug).toLowerCase()}`, s.is_closed === true);
    }
    const isClosedByMeta = (slugRaw: string, queueId: string | null | undefined) => {
      const slug = String(slugRaw || "").toLowerCase();
      const byQueue = statusMeta.get(`${queueId ?? "__global__"}:${slug}`);
      if (typeof byQueue === "boolean") return byQueue;
      const byGlobal = statusMeta.get(`__global__:${slug}`);
      if (typeof byGlobal === "boolean") return byGlobal;
      return slug === "closed";
    };

    const contactKeyToQueues = new Map<string, Set<string>>();
    const { data: convRows } = await supabase
      .from("conversations")
      .select("channel_id, customer_phone, external_id, queue_id, status, queues(name)")
      .eq("company_id", companyId);
    for (const c of (convRows ?? []) as Array<{
      channel_id: string | null;
      customer_phone: string | null;
      external_id: string | null;
      queue_id: string | null;
      status: string | null;
      queues: { name?: string } | { name?: string }[] | null;
    }>) {
      if (!c.channel_id) continue;
      if (isClosedByMeta(String(c.status ?? "open"), c.queue_id)) continue;
      const digits = toCanonicalDigits(c.customer_phone ?? c.external_id ?? "");
      if (!digits) continue;
      const key = `${c.channel_id}:${digits}`;
      const q = Array.isArray(c.queues) ? c.queues[0] : c.queues;
      const queueName = q?.name?.trim();
      if (!queueName) continue;
      const current = contactKeyToQueues.get(key) ?? new Set<string>();
      current.add(queueName);
      contactKeyToQueues.set(key, current);
    }

    const enriched = deduped.map((c) => {
      const digits = toCanonicalDigits(c.phone ?? c.jid?.replace(/@.*$/, "") ?? "");
      const key = `${c.channel_id}:${digits ?? c.jid}`;
      return {
        ...c,
        queue_names: Array.from(contactKeyToQueues.get(key) ?? []),
        tag_names: tagsByContact.get(c.id) ?? [],
      };
    });

    return NextResponse.json(enriched);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erro ao listar contatos";
    if (process.env.NODE_ENV !== "test") {
      console.error("[GET /api/contacts]", err);
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
