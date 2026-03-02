"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { ChevronLeft, Loader2 } from "lucide-react";

type Company = {
  id: string;
  name: string;
  slug: string;
  nome_fantasia?: string;
  email?: string;
  logradouro?: string;
  numero?: string;
  complemento?: string;
  bairro?: string;
  cep?: string;
  uf?: string;
  municipio?: string;
};

export default function EditarPerfilPage() {
  const params = useParams();
  const router = useRouter();
  const slug = typeof params?.slug === "string" ? params.slug : "";
  const base = slug ? `/${slug}` : "";
  const [company, setCompany] = useState<Company | null>(null);
  const [form, setForm] = useState<Partial<Company>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadingCep, setLoadingCep] = useState(false);

  useEffect(() => {
    fetch("/api/company")
      .then((r) => r.json())
      .then((data) => {
        if (data?.id) {
          setCompany(data);
          setForm({
            name: data.name ?? "",
            nome_fantasia: data.nome_fantasia ?? "",
            email: data.email ?? "",
            logradouro: data.logradouro ?? "",
            numero: data.numero ?? "",
            complemento: data.complemento ?? "",
            bairro: data.bairro ?? "",
            cep: data.cep ?? "",
            uf: data.uf ?? "",
            municipio: data.municipio ?? "",
          });
        } else setCompany(null);
      })
      .catch(() => setCompany(null))
      .finally(() => setLoading(false));
  }, []);

  const fetchCep = () => {
    const digits = (form.cep ?? "").replace(/\D/g, "");
    if (digits.length !== 8) return;
    setLoadingCep(true);
    fetch(`https://viacep.com.br/ws/${digits}/json/`)
      .then((r) => r.json())
      .then((data) => {
        if (data.erro) setError("CEP não encontrado");
        else {
          setError(null);
          setForm((f) => ({
            ...f,
            logradouro: data.logradouro ?? f.logradouro,
            bairro: data.bairro ?? f.bairro,
            municipio: data.localidade ?? f.municipio,
            uf: data.uf ?? f.uf,
          }));
        }
      })
      .catch(() => setError("Erro ao buscar CEP"))
      .finally(() => setLoadingCep(false));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSaving(true);
    fetch("/api/company", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    })
      .then((r) => r.json().then((d) => ({ ok: r.ok, data: d })))
      .then(({ ok, data }) => {
        if (ok) router.push(`${base}/perfil`);
        else setError(data?.error ?? "Erro ao salvar");
      })
      .catch(() => setError("Erro de conexão"))
      .finally(() => setSaving(false));
  };

  const inputClass =
    "mt-1.5 w-full rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] px-4 py-3 text-[#1E293B] placeholder-[#94A3B8] focus:border-clicvend-blue focus:bg-white focus:outline-none focus:ring-2 focus:ring-clicvend-blue/20";

  if (loading) {
    return (
      <div className="flex min-h-[200px] items-center justify-center">
        <div className="text-[#64748B]">Carregando…</div>
      </div>
    );
  }

  if (!company) {
    return (
      <div className="flex min-h-[200px] flex-col items-center justify-center gap-4">
        <p className="text-[#64748B]">Não foi possível carregar os dados.</p>
        <Link href={`${base}/perfil`} className="text-sm font-medium text-clicvend-blue hover:underline">
          Voltar ao perfil
        </Link>
      </div>
    );
  }

  return (
    <div className="p-6">
      <Link
        href={`${base}/perfil`}
        className="mb-6 inline-flex items-center gap-1 text-sm font-medium text-[#64748B] hover:text-clicvend-blue"
      >
        <ChevronLeft className="h-4 w-4" />
        Voltar ao perfil
      </Link>

      <h1 className="text-xl font-bold text-[#1E293B]">Editar Perfil</h1>
      <p className="mt-1 text-sm text-[#64748B]">Atualize os dados da empresa e endereço.</p>

      <form onSubmit={handleSubmit} className="mt-8 max-w-2xl space-y-6">
        <div className="rounded-xl border border-[#E2E8F0] bg-white p-6">
          <h2 className="text-sm font-bold uppercase tracking-wide text-[#64748B]">Dados da empresa</h2>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-sm font-semibold text-[#1E293B]">Nome de exibição</label>
              <input
                type="text"
                value={form.name ?? ""}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                className={inputClass}
                placeholder="Minha Empresa"
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-[#1E293B]">Nome fantasia</label>
              <input
                type="text"
                value={form.nome_fantasia ?? ""}
                onChange={(e) => setForm((f) => ({ ...f, nome_fantasia: e.target.value }))}
                className={inputClass}
                placeholder="Nome fantasia"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-sm font-semibold text-[#1E293B]">E-mail</label>
              <input
                type="email"
                value={form.email ?? ""}
                onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                className={inputClass}
                placeholder="contato@empresa.com.br"
              />
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-[#E2E8F0] bg-white p-6">
          <h2 className="text-sm font-bold uppercase tracking-wide text-[#64748B]">Endereço</h2>
          <p className="mt-0.5 text-xs text-[#94A3B8]">Digite o CEP e clique fora para preencher automaticamente.</p>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-sm font-semibold text-[#1E293B]">CEP</label>
              <input
                type="text"
                value={(form.cep ?? "").length === 8 ? (form.cep ?? "").replace(/(\d{5})(\d{3})/, "$1-$2") : form.cep ?? ""}
                onChange={(e) => setForm((f) => ({ ...f, cep: e.target.value.replace(/\D/g, "").slice(0, 8) }))}
                onBlur={fetchCep}
                className={inputClass}
                placeholder="00000-000"
              />
              {loadingCep && <p className="mt-1 text-xs text-clicvend-blue">Buscando…</p>}
            </div>
            <div className="sm:col-span-2">
              <label className="block text-sm font-semibold text-[#1E293B]">Logradouro</label>
              <input
                type="text"
                value={form.logradouro ?? ""}
                onChange={(e) => setForm((f) => ({ ...f, logradouro: e.target.value }))}
                className={inputClass}
                placeholder="Rua, avenida..."
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-[#1E293B]">Número</label>
              <input
                type="text"
                value={form.numero ?? ""}
                onChange={(e) => setForm((f) => ({ ...f, numero: e.target.value }))}
                className={inputClass}
                placeholder="123"
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-[#1E293B]">Complemento</label>
              <input
                type="text"
                value={form.complemento ?? ""}
                onChange={(e) => setForm((f) => ({ ...f, complemento: e.target.value }))}
                className={inputClass}
                placeholder="Sala, andar..."
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-[#1E293B]">Bairro</label>
              <input
                type="text"
                value={form.bairro ?? ""}
                onChange={(e) => setForm((f) => ({ ...f, bairro: e.target.value }))}
                className={inputClass}
                placeholder="Centro"
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-[#1E293B]">Município</label>
              <input
                type="text"
                value={form.municipio ?? ""}
                onChange={(e) => setForm((f) => ({ ...f, municipio: e.target.value }))}
                className={inputClass}
                placeholder="São Paulo"
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-[#1E293B]">UF</label>
              <input
                type="text"
                value={form.uf ?? ""}
                onChange={(e) => setForm((f) => ({ ...f, uf: e.target.value.slice(0, 2).toUpperCase() }))}
                className={inputClass}
                placeholder="SP"
              />
            </div>
          </div>
        </div>

        {error && <p className="text-sm font-medium text-[#EF4444]">{error}</p>}

        <div className="flex gap-3">
          <button
            type="submit"
            disabled={saving}
            className="inline-flex items-center gap-2 rounded-xl bg-clicvend-orange px-5 py-3 font-semibold text-white shadow-lg shadow-clicvend-orange/25 hover:bg-clicvend-orange-dark disabled:bg-[#94A3B8] disabled:shadow-none"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {saving ? "Salvando…" : "Salvar"}
          </button>
          <Link
            href={`${base}/perfil`}
            className="inline-flex items-center rounded-xl border border-[#E2E8F0] bg-white px-5 py-3 font-medium text-[#1E293B] hover:bg-[#F8FAFC]"
          >
            Cancelar
          </Link>
        </div>
      </form>
    </div>
  );
}
