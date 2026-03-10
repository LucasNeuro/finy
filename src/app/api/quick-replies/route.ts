import { NextResponse } from "next/server";
import { getCompanyIdFromRequest } from "@/lib/auth/get-company";
import { createClient } from "@/lib/supabase/server";
import { getChannelToken } from "@/lib/uazapi/channel-token";
import { editQuickReply, listQuickReplies, type QuickReply } from "@/lib/uazapi/client";

/**
 * GET /api/quick-replies
 * Lista respostas rápidas da empresa, com vínculos por fila.
 * Opcionalmente, se channel_id for informado, sincroniza com a UAZAPI antes de listar.
 *
 * Query params:
 * - channel_id?: string
 * - queue_id?: string (filtra pelas respostas vinculadas a essa fila)
 */
export async function GET(request: Request) {
  const companyId = await getCompanyIdFromRequest(request);
  if (!companyId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const channelId = searchParams.get("channel_id")?.trim() || null;
  const queueId = searchParams.get("queue_id")?.trim() || null;

  const supabase = await createClient();

  // Se veio um channel_id, sincroniza com a UAZAPI primeiro (espelha em quick_replies).
  if (channelId) {
    const resolved = await getChannelToken(channelId, companyId);
    if (!resolved) {
      return NextResponse.json({ error: "Channel not found" }, { status: 404 });
    }

    const result = await listQuickReplies(resolved.token);
    if (!result.ok) {
      return NextResponse.json(
        { error: result.error ?? "Failed to list quick replies from UAZAPI" },
        { status: 502 }
      );
    }

    const list = (result.data ?? []) as QuickReply[];
    if (list.length > 0) {
      const rows = list
        .filter((qr) => qr.id && qr.shortCut)
        .map((qr) => ({
          company_id: companyId,
          uazapi_id: qr.id as string,
          short_cut: qr.shortCut,
          type: (qr.type ?? "text") as string,
          text: qr.text ?? null,
          file: qr.file ?? null,
          doc_name: qr.docName ?? null,
          on_whatsapp: Boolean(qr.onWhatsApp),
        }));
      if (rows.length > 0) {
        const { error: upsertError } = await supabase
          .from("quick_replies")
          .upsert(rows, { onConflict: "company_id,uazapi_id" });
        if (upsertError) {
          // Não falhar a requisição por causa do espelho local – apenas logaria em ambiente real.
          // eslint-disable-next-line no-console
          console.error("Failed to upsert quick_replies mirror", upsertError);
        }
      }
    }
  }

  // Agora lista do nosso banco, com vínculos por fila.
  let query = supabase
    .from("quick_replies")
    .select("id, uazapi_id, short_cut, type, text, file, doc_name, on_whatsapp, enabled, created_at, updated_at, quick_reply_queues(queue_id)")
    .eq("company_id", companyId);

  if (queueId) {
    query = query.eq("quick_reply_queues.queue_id", queueId);
  }

  const { data, error } = await query;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const items = (data ?? []).map((row: any) => ({
    id: row.id as string,
    uazapiId: row.uazapi_id as string,
    shortCut: row.short_cut as string,
    type: row.type as string,
    text: row.text as string | null,
    file: row.file as string | null,
    docName: row.doc_name as string | null,
    onWhatsApp: Boolean(row.on_whatsapp),
    enabled: row.enabled !== false,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
    queueIds: Array.isArray(row.quick_reply_queues)
      ? row.quick_reply_queues.map((q: any) => q.queue_id as string)
      : [],
  }));

  return NextResponse.json({ data: items });
}

/**
 * POST /api/quick-replies
 * Cria/atualiza/exclui resposta rápida na UAZAPI e persiste espelho + vínculos por fila.
 * Ou apenas atualiza enabled (toggle ativar/desativar) quando quick_reply_id + enabled são enviados.
 *
 * Body:
 * {
 *   channel_id?: string;   // obrigatório para create/update/delete na UAZAPI
 *   quick_reply_id?: string;  // uuid nosso; se enviado com enabled, só atualiza enabled (channel_id opcional)
 *   enabled?: boolean;
 *   id?: string;          // id da UAZAPI (para update/delete)
 *   delete?: boolean;
 *   shortCut: string;
 *   type: string;
 *   text?: string;
 *   file?: string;
 *   docName?: string;
 *   queueIds?: string[];
 * }
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
  const channelId = typeof body?.channel_id === "string" ? body.channel_id.trim() : "";

  const supabase = await createClient();

  // Apenas toggle enabled (atualização local, sem UAZAPI).
  if (quickReplyId && enabledPayload !== undefined && !body.delete) {
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
      onWhatsApp: updated.on_whatsapp,
      enabled: updated.enabled !== false,
      createdAt: updated.created_at,
      updatedAt: updated.updated_at,
      queueIds,
    });
  }

  if (!channelId) {
    return NextResponse.json({ error: "channel_id is required" }, { status: 400 });
  }

  const resolved = await getChannelToken(channelId, companyId);
  if (!resolved) {
    return NextResponse.json({ error: "Channel not found" }, { status: 404 });
  }

  const shortCut = typeof body.shortCut === "string" ? body.shortCut.trim() : "";
  const type = typeof body.type === "string" ? body.type.trim() : "";
  const text = typeof body.text === "string" ? body.text : undefined;
  const file = typeof body.file === "string" ? body.file : undefined;
  const id = typeof body.id === "string" && body.id.trim() ? body.id.trim() : undefined;
  const del = Boolean(body.delete);
  const docName = typeof body.docName === "string" ? body.docName : undefined;
  const queueIds = Array.isArray(body.queueIds)
    ? (body.queueIds as string[]).map((q) => q.trim()).filter(Boolean)
    : [];
  const enabled = typeof body.enabled === "boolean" ? body.enabled : true;

  if (!shortCut || !type) {
    return NextResponse.json(
      { error: "shortCut and type are required" },
      { status: 400 }
    );
  }

  // Delete: apenas chama UAZAPI e remove espelho + vínculos locais.
  if (del && id) {
    const result = await editQuickReply(resolved.token, { id, delete: true, shortCut, type, ...(text ? { text } : {}), ...(file ? { file } : {}) });
    if (!result.ok) {
      return NextResponse.json(
        { error: result.error ?? "Failed to delete quick reply in UAZAPI" },
        { status: 502 }
      );
    }

    const { error: delError } = await supabase
      .from("quick_replies")
      .delete()
      .eq("company_id", companyId)
      .eq("uazapi_id", id);
    if (delError) {
      return NextResponse.json({ error: delError.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  }

  // Create/update via UAZAPI.
  const payload: any = { id, shortCut, type };
  if (text) payload.text = text;
  if (file) payload.file = file;
  if (docName) payload.docName = docName;

  const result = await editQuickReply(resolved.token, payload);
  if (!result.ok || !result.data || !result.data.id) {
    return NextResponse.json(
      { error: result.error ?? "Failed to save quick reply in UAZAPI" },
      { status: 502 }
    );
  }

  const qr = result.data as QuickReply;

  const { data: upserted, error: upsertError } = await supabase
    .from("quick_replies")
    .upsert(
      {
        company_id: companyId,
        uazapi_id: qr.id!,
        short_cut: qr.shortCut,
        type: (qr.type ?? type) as string,
        text: qr.text ?? text ?? null,
        file: qr.file ?? file ?? null,
        doc_name: qr.docName ?? docName ?? null,
        on_whatsapp: Boolean(qr.onWhatsApp),
        enabled,
      },
      { onConflict: "company_id,uazapi_id" }
    )
    .select("id, uazapi_id, short_cut, type, text, file, doc_name, on_whatsapp, enabled, created_at, updated_at")
    .single();

  if (upsertError || !upserted) {
    return NextResponse.json(
      { error: upsertError?.message ?? "Failed to upsert quick_replies mirror" },
      { status: 500 }
    );
  }

  // Atualizar vínculos com filas (quick_reply_queues).
  const upsertedId = upserted.id as string;

  // Limpa vínculos antigos e aplica os novos (inclusive se lista vazia, remove todos).
  const { error: delBindingsError } = await supabase
    .from("quick_reply_queues")
    .delete()
    .eq("company_id", companyId)
    .eq("quick_reply_id", upsertedId);
  if (delBindingsError) {
    return NextResponse.json({ error: delBindingsError.message }, { status: 500 });
  }

  if (queueIds.length > 0) {
    const rows = queueIds.map((qid) => ({
      company_id: companyId,
      quick_reply_id: upsertedId,
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
    id: upserted.id,
    uazapiId: upserted.uazapi_id,
    shortCut: upserted.short_cut,
    type: upserted.type,
    text: upserted.text,
    file: upserted.file,
    docName: upserted.doc_name,
    onWhatsApp: upserted.on_whatsapp,
    enabled: upserted.enabled !== false,
    createdAt: upserted.created_at,
    updatedAt: upserted.updated_at,
    queueIds,
  });
}

