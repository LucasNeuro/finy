import { NextResponse } from "next/server";
import { getCompanyIdFromRequest } from "@/lib/auth/get-company";
import { createClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
  const companyId = await getCompanyIdFromRequest(request);
  if (!companyId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const quickReplyIds = Array.isArray(body.quick_reply_ids) ? body.quick_reply_ids : [];
    const queueIds = Array.isArray(body.queue_ids) ? body.queue_ids : [];

    if (quickReplyIds.length === 0 || queueIds.length === 0) {
      return NextResponse.json(
        { error: "Selecione pelo menos uma resposta rápida e uma fila." },
        { status: 400 }
      );
    }

    const supabase = await createClient();

    // Validar se as filas pertencem à empresa (segurança)
    const { data: validQueues, error: queueError } = await supabase
      .from("queues")
      .select("id")
      .eq("company_id", companyId)
      .in("id", queueIds);

    if (queueError) {
      return NextResponse.json({ error: "Erro ao validar filas." }, { status: 500 });
    }

    const validQueueIds = validQueues?.map((q) => q.id) ?? [];
    if (validQueueIds.length === 0) {
      return NextResponse.json({ error: "Nenhuma fila válida encontrada." }, { status: 400 });
    }

    // Preparar dados para inserção
    const insertData: {
      company_id: string;
      quick_reply_id: string;
      queue_id: string;
    }[] = [];

    for (const qrId of quickReplyIds) {
      for (const qId of validQueueIds) {
        insertData.push({
          company_id: companyId,
          quick_reply_id: qrId,
          queue_id: qId,
        });
      }
    }

    // Inserir ignorando conflitos (se já existir o vínculo, não faz nada)
    const { error: insertError } = await supabase
      .from("quick_reply_queues")
      .upsert(insertData, { onConflict: "quick_reply_id, queue_id", ignoreDuplicates: true });

    if (insertError) {
      console.error("Erro ao vincular filas:", insertError);
      return NextResponse.json({ error: "Erro ao salvar vínculos." }, { status: 500 });
    }

    return NextResponse.json({ success: true, count: insertData.length });
  } catch (err) {
    console.error("Erro interno em bulk-link:", err);
    return NextResponse.json({ error: "Erro interno do servidor." }, { status: 500 });
  }
}
