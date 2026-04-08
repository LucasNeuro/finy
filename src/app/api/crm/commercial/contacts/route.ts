import { createServiceRoleClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { toCanonicalDigits } from "@/lib/phone-canonical";
import { isCommercialQueue } from "@/lib/queue/commercial";
import { NextResponse } from "next/server";

function isMissingOwnersTableError(message?: string | null): boolean {
  const m = (message ?? "").toLowerCase();
  return (
    m.includes("relation \"public.commercial_contact_owners\" does not exist") ||
    m.includes("could not find the table 'public.commercial_contact_owners' in the schema cache")
  );
}

/**
 * GET  /api/crm/commercial/contacts
 *   Lista a carteira do consultor autenticado (ou de um consultor específico se gestor).
 *   Query params:
 *     queue_id   – filtrar por fila
 *     user_id    – gestor pode ver carteira de outro consultor
 *     page, limit
 *
 * POST /api/crm/commercial/contacts
 *   Adiciona um contato manualmente à carteira do consultor.
 *   Body: { queue_id, phone, channel_id, notes? }
 */

export async function GET(request: Request) {
  const supabaseUser = await createClient();
  const {
    data: { user },
  } = await supabaseUser.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(request.url);
  const queueId = url.searchParams.get("queue_id");
  const targetUserId = url.searchParams.get("user_id") ?? user.id;
  const page = Math.max(1, parseInt(url.searchParams.get("page") ?? "1", 10));
  const limit = Math.min(100, Math.max(1, parseInt(url.searchParams.get("limit") ?? "50", 10)));
  const offset = (page - 1) * limit;

  const supabase = createServiceRoleClient();

  // Buscar company_id e role do usuário autenticado
  const { data: profile } = await supabase
    .from("profiles")
    .select("company_id, role")
    .eq("user_id", user.id)
    .single();

  if (!profile) return NextResponse.json({ error: "Profile not found" }, { status: 404 });

  const companyId = (profile as { company_id: string }).company_id;
  const role = (profile as { role: string }).role;

  // Somente admin/supervisor podem ver carteira de outro consultor
  const isManager = role === "admin" || role === "supervisor";
  const viewUserId = isManager ? targetUserId : user.id;

  let query = supabase
    .from("commercial_contact_owners")
    .select(
      "id, phone_canonical, queue_id, channel_id, owner_user_id, source, notes, lead_score, estimated_value_cents, created_at, updated_at",
      { count: "exact" }
    )
    .eq("company_id", companyId)
    .eq("owner_user_id", viewUserId)
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (queueId) query = query.eq("queue_id", queueId);

  const { data, error, count } = await query;

  if (error) {
    // Fallback: tabela de carteira não existe ainda.
    if (isMissingOwnersTableError(error.message)) {
      let commercialQueueIds: string[] = [];
      {
        const { data: queuesData } = await supabase
          .from("queues")
          .select("id")
          .eq("company_id", companyId)
          .eq("queue_type", "commercial");
        commercialQueueIds = (queuesData ?? []).map((q) => (q as { id: string }).id);
      }

      if (queueId) {
        commercialQueueIds = commercialQueueIds.filter((id) => id === queueId);
      }

      if (commercialQueueIds.length === 0) {
        return NextResponse.json({
          data: [],
          total: 0,
          page,
          limit,
          readonly_fallback: true,
          fallback_reason: "Nenhuma fila comercial encontrada para montar a carteira.",
        });
      }

      const { data: convData, error: convError } = await supabase
        .from("conversations")
        .select("id, customer_phone, channel_id, queue_id, created_at, last_message_at")
        .eq("company_id", companyId)
        .eq("assigned_to", viewUserId)
        .in("queue_id", commercialQueueIds)
        .order("last_message_at", { ascending: false });

      if (convError) {
        return NextResponse.json({ error: convError.message }, { status: 500 });
      }

      const dedup = new Map<
        string,
        { id: string; customer_phone: string | null; channel_id: string | null; queue_id: string | null; created_at: string | null; last_message_at: string | null }
      >();

      for (const row of convData ?? []) {
        const r = row as {
          id: string;
          customer_phone: string | null;
          channel_id: string | null;
          queue_id: string | null;
          created_at: string | null;
          last_message_at: string | null;
        };
        const canonical = toCanonicalDigits((r.customer_phone ?? "").replace(/\D/g, ""));
        if (!canonical || !r.channel_id || !r.queue_id) continue;
        const key = `${r.channel_id}:${canonical}`;
        if (!dedup.has(key)) dedup.set(key, r);
      }

      const allRows = Array.from(dedup.values()).map((r) => ({
        id: r.id,
        phone_canonical: toCanonicalDigits((r.customer_phone ?? "").replace(/\D/g, "")) ?? (r.customer_phone ?? ""),
        queue_id: r.queue_id!,
        channel_id: r.channel_id!,
        source: "conversation_fallback",
        notes: null,
        created_at: r.last_message_at ?? r.created_at ?? new Date().toISOString(),
        owner: null,
      }));

      const total = allRows.length;
      const paged = allRows.slice(offset, offset + limit);

      return NextResponse.json({
        data: paged,
        total,
        page,
        limit,
        readonly_fallback: true,
        fallback_reason:
          "Tabela de carteira comercial ainda não existe. Exibindo contatos detectados nas conversas atribuídas (somente leitura).",
      });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const rows = (data ?? []) as Array<{
    id: string;
    phone_canonical: string;
    queue_id: string;
    channel_id: string;
    owner_user_id: string;
    source: string;
    notes: string | null;
    lead_score?: number | null;
    estimated_value_cents?: number | null;
    created_at: string;
    updated_at: string;
  }>;

  const ownerIds = Array.from(new Set(rows.map((r) => r.owner_user_id).filter(Boolean)));
  let ownerMap = new Map<string, { id: string; full_name: string | null; email: string | null; avatar_url: string | null }>();
  if (ownerIds.length > 0) {
    const { data: owners } = await supabase
      .from("profiles")
      .select("user_id, full_name, email, avatar_url")
      .eq("company_id", companyId)
      .in("user_id", ownerIds);

    ownerMap = new Map(
      (owners ?? []).map((o: { user_id: string; full_name: string | null; email: string | null; avatar_url: string | null }) => [
        o.user_id,
        { id: o.user_id, full_name: o.full_name, email: o.email, avatar_url: o.avatar_url },
      ])
    );
  }

  const enriched = rows.map((row) => ({
    id: row.id,
    phone_canonical: row.phone_canonical,
    queue_id: row.queue_id,
    channel_id: row.channel_id,
    source: row.source,
    notes: row.notes,
    lead_score: row.lead_score ?? null,
    estimated_value_cents: row.estimated_value_cents ?? null,
    created_at: row.created_at,
    owner: ownerMap.get(row.owner_user_id) ?? null,
  }));

  return NextResponse.json({ data: enriched, total: count ?? 0, page, limit });
}

export async function POST(request: Request) {
  const supabaseUser = await createClient();
  const {
    data: { user },
  } = await supabaseUser.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await request.json()) as {
    queue_id: string;
    channel_id: string;
    phone: string;
    notes?: string;
    owner_user_id?: string; // gestor pode atribuir a outro consultor
    lead_score?: number | null;
    estimated_value_cents?: number | null;
  };

  if (!body.queue_id || !body.channel_id || !body.phone) {
    return NextResponse.json({ error: "queue_id, channel_id e phone são obrigatórios" }, { status: 400 });
  }

  const supabase = createServiceRoleClient();

  const { data: profile } = await supabase
    .from("profiles")
    .select("company_id, role")
    .eq("user_id", user.id)
    .single();

  if (!profile) return NextResponse.json({ error: "Profile not found" }, { status: 404 });

  const companyId = (profile as { company_id: string }).company_id;
  const role = (profile as { role: string }).role;
  const isManager = role === "admin" || role === "supervisor";

  // Verificar se a fila é comercial
  const commercial = await isCommercialQueue(supabase, companyId, body.queue_id);
  if (!commercial) {
    return NextResponse.json({ error: "Fila não é do tipo comercial" }, { status: 400 });
  }

  const ownerUserId = isManager && body.owner_user_id ? body.owner_user_id : user.id;
  const canonical = toCanonicalDigits(body.phone.replace(/\D/g, "")) ?? body.phone.replace(/\D/g, "");

  if (!canonical) {
    return NextResponse.json({ error: "Número de telefone inválido" }, { status: 400 });
  }

  let leadScore: number | null = null;
  if (body.lead_score !== undefined && body.lead_score !== null) {
    const n = Number(body.lead_score);
    if (!Number.isFinite(n) || n < 0 || n > 100) {
      return NextResponse.json({ error: "lead_score deve ser entre 0 e 100" }, { status: 400 });
    }
    leadScore = Math.round(n);
  }
  let valueCents: number | null = null;
  if (body.estimated_value_cents !== undefined && body.estimated_value_cents !== null) {
    const v = Number(body.estimated_value_cents);
    if (!Number.isFinite(v) || v < 0) {
      return NextResponse.json({ error: "estimated_value_cents inválido" }, { status: 400 });
    }
    valueCents = Math.round(v);
  }

  const upsertPayload: Record<string, unknown> = {
    company_id: companyId,
    channel_id: body.channel_id,
    queue_id: body.queue_id,
    phone_canonical: canonical,
    owner_user_id: ownerUserId,
    source: "manual",
    notes: body.notes ?? null,
    updated_at: new Date().toISOString(),
  };
  if (leadScore !== null) upsertPayload.lead_score = leadScore;
  if (valueCents !== null) upsertPayload.estimated_value_cents = valueCents;

  const { data, error } = await supabase
    .from("commercial_contact_owners")
    .upsert(upsertPayload, { onConflict: "company_id,channel_id,phone_canonical" })
    .select("id, phone_canonical, queue_id, channel_id, source, notes, lead_score, estimated_value_cents, created_at, updated_at")
    .single();

  if (error) {
    if (isMissingOwnersTableError(error.message)) {
      return NextResponse.json(
        {
          error:
            "A estrutura de carteira comercial ainda não foi criada no banco. Rode a migration da tabela commercial_contact_owners para habilitar cadastro manual.",
        },
        { status: 409 }
      );
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ data }, { status: 201 });
}
