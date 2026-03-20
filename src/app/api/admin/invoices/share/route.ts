import { NextResponse } from "next/server";
import { verifyPlatformOwnerAuth } from "@/lib/admin-auth";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { sendText } from "@/lib/uazapi/client";

const INVOICES_BUCKET = "company-invoices";
const SIGNED_URL_EXPIRES = 60 * 60; // 1 hora

export async function POST(request: Request) {
  const ok = await verifyPlatformOwnerAuth();
  if (!ok) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  let body: { company_id?: string; invoice_id?: string; phone?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const companyId = body.company_id;
  const invoiceId = body.invoice_id;
  const phoneRaw = body.phone;

  if (!companyId) return NextResponse.json({ error: "company_id é obrigatório" }, { status: 400 });
  if (!invoiceId) return NextResponse.json({ error: "invoice_id é obrigatório" }, { status: 400 });
  if (typeof phoneRaw !== "string" || !phoneRaw.trim()) {
    return NextResponse.json({ error: "phone é obrigatório" }, { status: 400 });
  }

  const phone = phoneRaw.replace(/\D/g, "");
  if (phone.length < 10) {
    return NextResponse.json({ error: "Telefone inválido (informe com DDD)" }, { status: 400 });
  }

  const admin = createServiceRoleClient();

  const { data: invoice, error: invErr } = await admin
    .from("company_invoices")
    .select("id, company_id, month, year, storage_path, bank_slip_url")
    .eq("id", invoiceId)
    .eq("company_id", companyId)
    .single();

  if (invErr || !invoice) {
    return NextResponse.json(
      { error: "Boleto não encontrado para esta empresa", details: invErr?.message ?? undefined },
      { status: 404 }
    );
  }

  let link = invoice.bank_slip_url ?? null;

  if (invoice.storage_path) {
    try {
      const { data: signedData, error: signedErr } = await admin.storage
        .from(INVOICES_BUCKET)
        .createSignedUrl(invoice.storage_path, SIGNED_URL_EXPIRES);

      if (!signedErr && signedData?.signedUrl) {
        link = signedData.signedUrl;
      }
    } catch {
      // fallback: manter bank_slip_url
    }
  }

  if (!link) {
    return NextResponse.json({ error: "Não foi possível gerar link do boleto (sem storage_path/pdf)" }, { status: 400 });
  }

  const { data: channel, error: chErr } = await admin
    .from("channels")
    .select("id, uazapi_token_encrypted")
    .eq("company_id", companyId)
    .eq("is_active", true)
    .not("uazapi_token_encrypted", "is", null)
    .limit(1)
    .single();

  if (chErr || !channel?.uazapi_token_encrypted) {
    return NextResponse.json(
      { error: "Nenhuma conexão WhatsApp ativa com token configurado. Configure em Conexões." },
      { status: 400 }
    );
  }

  const message = `Olá! Segue seu boleto (${invoice.month}/${invoice.year}):\n${link}`;

  const result = await sendText(channel.uazapi_token_encrypted as string, phone, message, {
    linkPreview: true,
  });

  if (!result.ok) {
    return NextResponse.json(
      { error: "Falha ao enviar no WhatsApp", details: result.error },
      { status: 502 }
    );
  }

  return NextResponse.json({ ok: true, sent_to: phone });
}

