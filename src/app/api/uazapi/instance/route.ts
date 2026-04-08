import { getCompanyIdFromRequest } from "@/lib/auth/get-company";
import { requireAdmin } from "@/lib/auth/get-profile";
import { createInstance } from "@/lib/uazapi/client";
import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

/**
 * POST /api/uazapi/instance
 * Cria uma instância UAZAPI (admin) e opcionalmente um canal na empresa.
 * Body: { name: string, createChannel?: boolean, queue_id?: string }
 */
export async function POST(request: Request) {
  const companyId = await getCompanyIdFromRequest(request);
  if (!companyId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const adminErr = await requireAdmin(companyId);
  if (adminErr) {
    return NextResponse.json({ error: adminErr.error }, { status: adminErr.status });
  }

  let body: { name?: string; createChannel?: boolean; queue_id?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const name = typeof body?.name === "string" ? body.name.trim() : "";
  if (!name) {
    return NextResponse.json({ error: "name is required" }, { status: 400 });
  }

  const supabase = await createClient();
  if (body.createChannel) {
    const { count } = await supabase
      .from("channels")
      .select("id", { count: "exact", head: true })
      .eq("company_id", companyId);
    if ((count ?? 0) >= 3) {
      return NextResponse.json(
        { error: "Limite de 3 números por empresa atingido." },
        { status: 403 }
      );
    }
  }

  const result = await createInstance({
    name,
    adminField01: companyId,
  });

  if (!result.ok || !result.token || !result.instance) {
    const raw = (result.error ?? "Failed to create UAZAPI instance").trim();
    const lower = raw.toLowerCase();
    let error = raw;
    if (
      lower.includes("maximum number of instances") ||
      lower.includes("max instances") ||
      lower.includes("instance limit")
    ) {
      error =
        "Limite de instâncias WhatsApp no provedor UAZAPI atingido para este admintoken. " +
        "Não é o limite de 3 canais da empresa: é o teto do plano/conta UAZ. " +
        "Remova instâncias antigas no painel UAZ, ou aumente o plano, ou use outro UAZAPI_ADMIN_TOKEN com vagas.";
    }
    return NextResponse.json({ error }, { status: 502 });
  }

  const instanceId = result.instance.id ?? result.instance.name ?? "";
  const token = result.token;

  if (body.createChannel) {
    const { data: queue } = body.queue_id
      ? await supabase.from("queues").select("id").eq("company_id", companyId).eq("id", body.queue_id).single()
      : { data: null };
    const { data: channel, error: chError } = await supabase
      .from("channels")
      .insert({
        company_id: companyId,
        name: name,
        uazapi_instance_id: instanceId,
        uazapi_token_encrypted: token,
        queue_id: queue?.id ?? null,
        is_active: true,
      })
      .select("id, name, uazapi_instance_id, queue_id, is_active, created_at")
      .single();

    if (chError) {
      return NextResponse.json(
        {
          instance: result.instance,
          token,
          instanceId,
          channelError: chError.message,
          message: "Instance created but channel creation failed",
        },
        { status: 201 }
      );
    }

    if (queue?.id) {
      await supabase.from("channel_queues").insert({
        channel_id: channel.id,
        queue_id: queue.id,
        is_default: true,
      });
    }

    return NextResponse.json({
      instance: result.instance,
      token,
      instanceId,
      channel: { id: channel.id, name: channel.name, uazapi_instance_id: channel.uazapi_instance_id },
    });
  }

  return NextResponse.json({
    instance: result.instance,
    token,
    instanceId,
  });
}
