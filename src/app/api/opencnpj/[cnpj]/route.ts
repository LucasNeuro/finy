import { NextResponse } from "next/server";

const OPENCNPJ_BASE = "https://api.opencnpj.org";

function normalizeCnpj(cnpj: string): string {
  return cnpj.replace(/\D/g, "");
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ cnpj: string }> }
) {
  const { cnpj: raw } = await params;
  const cnpj = normalizeCnpj(raw);
  if (cnpj.length !== 14) {
    return NextResponse.json(
      { error: "CNPJ deve ter 14 dígitos" },
      { status: 400 }
    );
  }

  try {
    const res = await fetch(`${OPENCNPJ_BASE}/${cnpj}`, {
      headers: { Accept: "application/json" },
      next: { revalidate: 3600 },
    });

    if (res.status === 404) {
      return NextResponse.json({ error: "CNPJ não encontrado" }, { status: 404 });
    }
    if (res.status === 429) {
      return NextResponse.json(
        { error: "Muitas consultas. Tente novamente em instantes." },
        { status: 429 }
      );
    }
    if (!res.ok) {
      return NextResponse.json(
        { error: "Erro ao consultar CNPJ" },
        { status: 502 }
      );
    }

    const data = await res.json();
    return NextResponse.json(data);
  } catch {
    return NextResponse.json(
      { error: "Erro de conexão com a API de CNPJ" },
      { status: 502 }
    );
  }
}
