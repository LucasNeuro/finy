import { getCompanyIdFromRequest } from "@/lib/auth/get-company";
import { requirePermission } from "@/lib/auth/get-profile";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { mergeConversationsInto } from "@/lib/conversations/merge-conversations";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { NextResponse } from "next/server";

/**
 * POST /api/conversations/merge
 * Corpo JSON: { "keep_id": "<uuid>", "drop_id": "<uuid>" }
 * Une dois tickets do mesmo canal quando o histórico é o mesmo (ex.: LID vs número,
 * sync duplicado). Mantém `keep_id`, remove `drop_id`, deduplica mensagens pelo external_id.
 * Requer permissão de gestão de tickets.
 */
export async function POST(request: Request) {
  const companyId = await getCompanyIdFromRequest(request);
  if (!companyId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const permErr = await requirePermission(companyId, PERMISSIONS.inbox.manage_tickets);
  if (permErr) {
    return NextResponse.json({ error: permErr.error }, { status: permErr.status });
  }

  let body: { keep_id?: string; drop_id?: string };
  try {
    body = (await request.json()) as { keep_id?: string; drop_id?: string };
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const keepId = String(body.keep_id ?? "").trim();
  const dropId = String(body.drop_id ?? "").trim();
  if (!keepId || !dropId) {
    return NextResponse.json({ error: "keep_id e drop_id são obrigatórios" }, { status: 400 });
  }
  if (keepId === dropId) {
    return NextResponse.json({ error: "keep_id e drop_id devem ser diferentes" }, { status: 400 });
  }

  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json({ error: "Serviço indisponível" }, { status: 503 });
  }

  try {
    const supabase = createServiceRoleClient();
    await mergeConversationsInto({
      supabase,
      keepId,
      dropId,
      companyId,
      invalidateCaches: true,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Falha ao mesclar";
    const isBiz =
      msg.includes("merge:") ||
      msg.includes("canal diferente") ||
      msg.includes("não encontradas");
    return NextResponse.json({ error: msg }, { status: isBiz ? 400 : 500 });
  }

  return NextResponse.json({ ok: true, keep_id: keepId });
}
