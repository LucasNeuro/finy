import { getCompanyIdFromRequest } from "@/lib/auth/get-company";
import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

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
    const allRows: Record<string, unknown>[] = [];
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
      allRows.push(...chunk);
      hasMore = chunk.length === pageSize;
      offset += pageSize;
    }

    return NextResponse.json(allRows);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erro ao listar contatos";
    if (process.env.NODE_ENV !== "test") {
      console.error("[GET /api/contacts]", err);
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
