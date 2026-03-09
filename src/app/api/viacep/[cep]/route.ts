import { NextResponse } from "next/server";

const VIACEP_BASE = "https://viacep.com.br/ws";

function normalizeCep(cep: string): string {
  return cep.replace(/\D/g, "");
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ cep: string }> }
) {
  const { cep: raw } = await params;
  const cep = normalizeCep(raw);
  if (cep.length !== 8) {
    return NextResponse.json(
      { error: "CEP deve ter 8 dígitos" },
      { status: 400 }
    );
  }

  try {
    const res = await fetch(`${VIACEP_BASE}/${cep}/json/`, {
      headers: { Accept: "application/json" },
      next: { revalidate: 86400 },
    });

    if (!res.ok) {
      return NextResponse.json(
        { error: "Erro ao consultar CEP" },
        { status: 502 }
      );
    }

    const data = await res.json();
    if (data.erro) {
      return NextResponse.json({ error: "CEP não encontrado" }, { status: 404 });
    }
    return NextResponse.json(data);
  } catch {
    return NextResponse.json(
      { error: "Erro de conexão com a API de CEP" },
      { status: 502 }
    );
  }
}
