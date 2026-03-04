import { getCompanyIdFromRequest } from "@/lib/auth/get-company";
import { requirePermission } from "@/lib/auth/get-profile";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { createClient } from "@/lib/supabase/server";
import { getChatDetails } from "@/lib/uazapi/client";
import { NextResponse } from "next/server";

/**
 * POST /api/users/whatsapp-profile
 * Usa o número de WhatsApp para buscar dados completos do contato na UAZAPI (/chat/details)
 * e retornar nome e avatar para facilitar o cadastro de usuários.
 */
export async function POST(request: Request) {
  const companyId = await getCompanyIdFromRequest(request);
  if (!companyId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const err = await requirePermission(companyId, PERMISSIONS.users.manage);
  if (err) {
    return NextResponse.json({ error: err.error }, { status: err.status });
  }

  let body: { phone?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const rawPhone = typeof body?.phone === "string" ? body.phone : "";
  const normalizedPhone = rawPhone.replace(/\D/g, "").trim();
  if (!normalizedPhone) {
    return NextResponse.json({ error: "Telefone é obrigatório" }, { status: 400 });
  }

  const supabase = await createClient();
  const { data: channel, error: chError } = await supabase
    .from("channels")
    .select("id, uazapi_token_encrypted")
    .eq("company_id", companyId)
    .not("uazapi_token_encrypted", "is", null)
    .order("created_at", { ascending: true })
    .limit(1)
    .single();

  if (chError || !channel?.uazapi_token_encrypted) {
    return NextResponse.json(
      { error: "Nenhuma conexão WhatsApp está configurada para esta empresa." },
      { status: 400 }
    );
  }

  const token = channel.uazapi_token_encrypted as string;
  const { ok, data, error } = await getChatDetails(token, normalizedPhone, { preview: true });

  if (!ok || !data) {
    return NextResponse.json(
      { error: error ?? "Falha ao consultar dados do WhatsApp. Verifique se o número está correto." },
      { status: 502 }
    );
  }

  const fullName =
    (data.lead_fullName && data.lead_fullName.trim()) ||
    (data.lead_name && data.lead_name.trim()) ||
    (data.wa_contactName && data.wa_contactName.trim()) ||
    (data.wa_name && data.wa_name.trim()) ||
    (data.name && data.name.trim()) ||
    undefined;

  const avatarUrl =
    (typeof data.imagePreview === "string" && data.imagePreview.trim()) ||
    (typeof data.image === "string" && data.image.trim()) ||
    undefined;

  const phoneFromChat =
    (typeof data.phone === "string" && data.phone.replace(/\D/g, "").trim()) || normalizedPhone;

  return NextResponse.json({
    full_name: fullName,
    phone: phoneFromChat,
    avatar_url: avatarUrl,
    source: "whatsapp",
  });
}

