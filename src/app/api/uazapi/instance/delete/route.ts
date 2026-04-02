import { getCompanyIdFromRequest } from "@/lib/auth/get-company";
import { requireAdmin } from "@/lib/auth/get-profile";
import { deleteInstance } from "@/lib/uazapi/client";
import { invalidateUazInstanceWebhookCache } from "@/lib/redis/uaz-instance-webhook-cache";
import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";


export async function DELETE(request: Request) {
  const companyId = await getCompanyIdFromRequest(request);
  if (!companyId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const adminErr = await requireAdmin(companyId);
  if (adminErr) {
    return NextResponse.json({ error: adminErr.error }, { status: adminErr.status });
  }

  const { searchParams } = new URL(request.url);
  const channelId = searchParams.get("channel_id")?.trim();
  if (!channelId) {
    return NextResponse.json({ error: "channel_id is required" }, { status: 400 });
  }

  const forceLocal =
    searchParams.get("force_local") === "1" ||
    searchParams.get("force_local")?.toLowerCase() === "true";

  const supabase = await createClient();
  const { data: row, error: rowErr } = await supabase
    .from("channels")
    .select("id, uazapi_instance_id, uazapi_token_encrypted")
    .eq("id", channelId)
    .eq("company_id", companyId)
    .single();

  if (rowErr || !row) {
    return NextResponse.json({ error: "Channel not found" }, { status: 404 });
  }

  const instanceIdForCache = String((row as { uazapi_instance_id?: string }).uazapi_instance_id ?? "").trim();
  const token = (row as { uazapi_token_encrypted?: string | null }).uazapi_token_encrypted?.trim() ?? "";

  if (forceLocal) {
    if (instanceIdForCache) await invalidateUazInstanceWebhookCache(instanceIdForCache);
    await supabase.from("channels").delete().eq("id", channelId).eq("company_id", companyId);
    return NextResponse.json({
      response: "Channel removed locally",
      channel_id: channelId,
      warning:
        "Registro removido só no Smart Vendas. Se a instância ainda existir na UAZAPI, apague-a no painel da UAZ para encerrar o número de lá.",
    });
  }

  if (!token) {
    return NextResponse.json(
      {
        error:
          "Este canal não tem token da UAZAPI. Use Remover só do sistema ou atualize o token. Você também pode chamar esta rota com ?force_local=1 (apenas admin).",
        code: "missing_token",
      },
      { status: 400 }
    );
  }

  const result = await deleteInstance(token);
  if (!result.ok) {
    return NextResponse.json(
      {
        error: result.error ?? "Failed to delete instance",
        code: "uazapi_delete_failed",
        hint: "Se o token está inválido, use a opção para remover só o registro no Smart Vendas.",
      },
      { status: 502 }
    );
  }

  if (instanceIdForCache) await invalidateUazInstanceWebhookCache(instanceIdForCache);

  await supabase.from("channels").delete().eq("id", channelId).eq("company_id", companyId);

  return NextResponse.json({
    response: "Instance deleted",
    channel_id: channelId,
  });
}
