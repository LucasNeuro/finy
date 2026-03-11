import { NextResponse } from "next/server";
import { getCompanyIdFromRequest } from "@/lib/auth/get-company";
import { createClient } from "@/lib/supabase/server";

/** Máximo de respostas rápidas por fila (uso no chat pelos agentes). Independente da UAZAPI (WhatsApp permite só 1 por instância). */
const MAX_QUICK_REPLIES_PER_QUEUE = 40;

/**
 * GET /api/quick-replies
 * Lista respostas rápidas da empresa (apenas da aplicação, sem UAZAPI).
 * Cada fila pode ter até MAX_QUICK_REPLIES_PER_QUEUE respostas para os agentes usarem no atendimento.
 * Query params: queue_id? (filtra pelas respostas vinculadas a essa fila).
 */
export async function GET(request: Request) {
  const companyId = await getCompanyIdFromRequest(request);
  if (!companyId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const queueId = searchParams.get("queue_id")?.trim() || null;

  const supabase = await createClient();

  let query = supabase
    .from("quick_replies")
    .select("id, uazapi_id, short_cut, type, text, file, doc_name, on_whatsapp, enabled, created_at, updated_at, quick_reply_queues(queue_id)")
    .eq("company_id", companyId);

  if (queueId) {
    query = query.eq("quick_reply_queues.queue_id", queueId);
  }

  const { data: quickReplies, error } = await query;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Buscar canais vinculados às filas para exibir na listagem
  const allQueueIds = new Set<string>();
  quickReplies?.forEach((qr: any) => {
    if (Array.isArray(qr.quick_reply_queues)) {
      qr.quick_reply_queues.forEach((q: any) => {
        if (q.queue_id) allQueueIds.add(q.queue_id);
      });
    }
  });

  const queueChannelsMap: Record<string, { id: string; name: string }[]> = {};
  if (allQueueIds.size > 0) {
    const { data: cqData } = await supabase
      .from("channel_queues")
      .select("queue_id, channels(id, name)")
      .in("queue_id", Array.from(allQueueIds));

    cqData?.forEach((item: any) => {
      const qid = item.queue_id;
      const ch = item.channels; // Join com channels
      if (qid && ch) {
        if (!queueChannelsMap[qid]) queueChannelsMap[qid] = [];
        // ch pode ser array se relacionamento for 1:N reverso, mas channel_queues->channels é N:1 (channel_id FK)
        // O Supabase retorna objeto se for N:1.
        const channelObj = Array.isArray(ch) ? ch[0] : ch;
        if (channelObj && !queueChannelsMap[qid].find((c) => c.id === channelObj.id)) {
          queueChannelsMap[qid].push({ id: channelObj.id, name: channelObj.name });
        }
      }
    });
  }

  const items = (quickReplies ?? []).map((row: any) => {
    const queueIds = Array.isArray(row.quick_reply_queues)
      ? row.quick_reply_queues.map((q: any) => q.queue_id as string)
      : [];

    // Resolver canais únicos
    const channelsMap = new Map<string, string>();
    queueIds.forEach((qid) => {
      const chans = queueChannelsMap[qid];
      if (chans) {
        chans.forEach((c) => channelsMap.set(c.id, c.name));
      }
    });
    const channels = Array.from(channelsMap.entries()).map(([id, name]) => ({ id, name }));

    return {
      id: row.id as string,
      uazapiId: row.uazapi_id as string | null,
      shortCut: row.short_cut as string,
      type: row.type as string,
      text: row.text as string | null,
      file: row.file as string | null,
      docName: row.doc_name as string | null,
      onWhatsApp: Boolean(row.on_whatsapp),
      enabled: row.enabled !== false,
      createdAt: row.created_at as string,
      updatedAt: row.updated_at as string,
      queueIds,
      channels,
    };
  });

  return NextResponse.json({ data: items });
}

/**
 * POST /api/quick-replies
 * Cria, atualiza ou exclui resposta rápida apenas na aplicação (sem UAZAPI).
 * Cada fila pode ter até 40 respostas rápidas para os agentes usarem no chat durante o atendimento.
 * A UAZAPI/WhatsApp permite apenas 1 resposta rápida por instância; por isso esta parte fica só no banco.
 *
 * Body:
 * - quick_reply_id?: string (uuid nosso; para update ou toggle enabled)
 * - enabled?: boolean (só toggle quando quick_reply_id + enabled)
 * - delete?: boolean (excluir; enviar quick_reply_id)
 * - shortCut, type, text?, file?, docName?, queueIds?
 */
export async function POST(request: Request) {
  const companyId = await getCompanyIdFromRequest(request);
  if (!companyId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: any;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const quickReplyId = typeof body?.quick_reply_id === "string" ? body.quick_reply_id.trim() : "";
  const enabledPayload = typeof body.enabled === "boolean" ? body.enabled : undefined;
  const del = Boolean(body.delete);

  const supabase = await createClient();

  // Apenas toggle enabled (atualização local).
  if (quickReplyId && enabledPayload !== undefined && !del) {
    const { data: updated, error: updateError } = await supabase
      .from("quick_replies")
      .update({ enabled: enabledPayload, updated_at: new Date().toISOString() })
      .eq("id", quickReplyId)
      .eq("company_id", companyId)
      .select("id, uazapi_id, short_cut, type, text, file, doc_name, on_whatsapp, enabled, created_at, updated_at")
      .single();

    if (updateError || !updated) {
      return NextResponse.json(
        { error: updateError?.message ?? "Falha ao atualizar status" },
        { status: 500 }
      );
    }

    const { data: bindings } = await supabase
      .from("quick_reply_queues")
      .select("queue_id")
      .eq("quick_reply_id", quickReplyId);
    const queueIds = Array.isArray(bindings) ? bindings.map((b: any) => b.queue_id) : [];

    return NextResponse.json({
      id: updated.id,
      uazapiId: updated.uazapi_id,
      shortCut: updated.short_cut,
      type: updated.type,
      text: updated.text,
      file: updated.file,
      docName: updated.doc_name,
      onWhatsApp: Boolean(updated.on_whatsapp),
      enabled: updated.enabled !== false,
      createdAt: updated.created_at,
      updatedAt: updated.updated_at,
      queueIds,
    });
  }

  // Excluir: apenas no banco (por nosso id).
  if (del && quickReplyId) {
    const { error: delError } = await supabase
      .from("quick_replies")
      .delete()
      .eq("id", quickReplyId)
      .eq("company_id", companyId);

    if (delError) {
      return NextResponse.json({ error: delError.message }, { status: 500 });
    }
    return NextResponse.json({ ok: true });
  }

  // Excluir por id UAZAPI (retrocompatibilidade para registros antigos).
  const uazapiIdForDelete = typeof body.id === "string" && body.id.trim() ? body.id.trim() : undefined;
  if (del && uazapiIdForDelete) {
    const { error: delError } = await supabase
      .from("quick_replies")
      .delete()
      .eq("company_id", companyId)
      .eq("uazapi_id", uazapiIdForDelete);

    if (delError) {
      return NextResponse.json({ error: delError.message }, { status: 500 });
    }
    return NextResponse.json({ ok: true });
  }

  // Criar ou atualizar (apenas no banco).
  const shortCut = typeof body.shortCut === "string" ? body.shortCut.trim() : "";
  const type = typeof body.type === "string" ? body.type.trim() : "";
  const text = typeof body.text === "string" ? body.text : undefined;
  const file = typeof body.file === "string" ? body.file : undefined;
  const docName = typeof body.docName === "string" ? body.docName : undefined;
  const queueIds = Array.isArray(body.queueIds)
    ? (body.queueIds as string[]).map((q) => q.trim()).filter(Boolean)
    : [];
  const enabled = typeof body.enabled === "boolean" ? body.enabled : true;

  if (!shortCut || !type) {
    return NextResponse.json(
      { error: "shortCut e type são obrigatórios" },
      { status: 400 }
    );
  }

  // Limite de 40 respostas rápidas por fila (salvo só no banco; não depende da UAZAPI).
  if (queueIds.length > 0) {
    const { data: allBindings, error: bindError } = await supabase
      .from("quick_reply_queues")
      .select("queue_id")
      .eq("company_id", companyId)
      .in("queue_id", queueIds);

    if (!bindError && allBindings) {
      const countPerQueue = allBindings.reduce((acc: Record<string, number>, row: any) => {
        const qid = row.queue_id as string;
        acc[qid] = (acc[qid] ?? 0) + 1;
        return acc;
      }, {});

      let queuesWhereThisReplyAlreadyIn: Set<string> = new Set();
      if (quickReplyId) {
        const { data: current } = await supabase
          .from("quick_reply_queues")
          .select("queue_id")
          .eq("quick_reply_id", quickReplyId)
          .in("queue_id", queueIds);
        if (current) queuesWhereThisReplyAlreadyIn = new Set(current.map((r: any) => r.queue_id as string));
      }

      for (const qid of queueIds) {
        const count = countPerQueue[qid] ?? 0;
        const alreadyIn = queuesWhereThisReplyAlreadyIn.has(qid);
        if (alreadyIn && count <= MAX_QUICK_REPLIES_PER_QUEUE) continue;
        if (!alreadyIn && count >= MAX_QUICK_REPLIES_PER_QUEUE) {
          return NextResponse.json(
            { error: `Cada fila pode ter no máximo ${MAX_QUICK_REPLIES_PER_QUEUE} respostas rápidas. Uma das filas selecionadas já está no limite.` },
            { status: 400 }
          );
        }
      }
    }
  }

  const now = new Date().toISOString();

  // Atualizar existente (por quick_reply_id).
  if (quickReplyId) {
    const { data: existing, error: fetchError } = await supabase
      .from("quick_replies")
      .select("id")
      .eq("id", quickReplyId)
      .eq("company_id", companyId)
      .single();

    if (fetchError || !existing) {
      return NextResponse.json({ error: "Resposta rápida não encontrada" }, { status: 404 });
    }

    const { error: updateError } = await supabase
      .from("quick_replies")
      .update({
        short_cut: shortCut,
        type,
        text: text ?? null,
        file: file ?? null,
        doc_name: docName ?? null,
        enabled,
        updated_at: now,
      })
      .eq("id", quickReplyId)
      .eq("company_id", companyId);

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    const { error: delBindingsError } = await supabase
      .from("quick_reply_queues")
      .delete()
      .eq("company_id", companyId)
      .eq("quick_reply_id", quickReplyId);
    if (delBindingsError) {
      return NextResponse.json({ error: delBindingsError.message }, { status: 500 });
    }

    if (queueIds.length > 0) {
      const rows = queueIds.map((qid) => ({
        company_id: companyId,
        quick_reply_id: quickReplyId,
        queue_id: qid,
      }));
      const { error: insertBindingsError } = await supabase
        .from("quick_reply_queues")
        .insert(rows);
      if (insertBindingsError) {
        return NextResponse.json({ error: insertBindingsError.message }, { status: 500 });
      }
    }

    const { data: updated, error: selectError } = await supabase
      .from("quick_replies")
      .select("id, uazapi_id, short_cut, type, text, file, doc_name, on_whatsapp, enabled, created_at, updated_at")
      .eq("id", quickReplyId)
      .single();

    if (selectError || !updated) {
      return NextResponse.json({ error: "Erro ao ler resposta atualizada" }, { status: 500 });
    }

    return NextResponse.json({
      id: updated.id,
      uazapiId: updated.uazapi_id,
      shortCut: updated.short_cut,
      type: updated.type,
      text: updated.text,
      file: updated.file,
      docName: updated.doc_name,
      onWhatsApp: Boolean(updated.on_whatsapp),
      enabled: updated.enabled !== false,
      createdAt: updated.created_at,
      updatedAt: updated.updated_at,
      queueIds,
    });
  }

  // Criar nova (apenas na aplicação; uazapi_id null).
  const { data: inserted, error: insertError } = await supabase
    .from("quick_replies")
    .insert({
      company_id: companyId,
      uazapi_id: null,
      short_cut: shortCut,
      type,
      text: text ?? null,
      file: file ?? null,
      doc_name: docName ?? null,
      on_whatsapp: false,
      enabled,
    })
    .select("id, uazapi_id, short_cut, type, text, file, doc_name, on_whatsapp, enabled, created_at, updated_at")
    .single();

  if (insertError || !inserted) {
    return NextResponse.json(
      { error: insertError?.message ?? "Falha ao criar resposta rápida" },
      { status: 500 }
    );
  }

  const insertedId = inserted.id as string;

  if (queueIds.length > 0) {
    const rows = queueIds.map((qid) => ({
      company_id: companyId,
      quick_reply_id: insertedId,
      queue_id: qid,
    }));
    const { error: insertBindingsError } = await supabase
      .from("quick_reply_queues")
      .insert(rows);
    if (insertBindingsError) {
      return NextResponse.json({ error: insertBindingsError.message }, { status: 500 });
    }
  }

  return NextResponse.json({
    id: inserted.id,
    uazapiId: inserted.uazapi_id,
    shortCut: inserted.short_cut,
    type: inserted.type,
    text: inserted.text,
    file: inserted.file,
    docName: inserted.doc_name,
    onWhatsApp: Boolean(inserted.on_whatsapp),
    enabled: inserted.enabled !== false,
    createdAt: inserted.created_at,
    updatedAt: inserted.updated_at,
    queueIds,
  });
}
