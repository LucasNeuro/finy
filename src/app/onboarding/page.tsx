"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { ClicVendLogo } from "@/components/ClicVendLogo";
import { PublicHeader } from "@/components/PublicHeader";
import { Eye, EyeOff, ChevronLeft, ChevronRight, Check, Copy, CheckCircle2, Plus, Trash2 } from "lucide-react";

const STEPS = [
  { id: 1, title: "Dados da empresa" },
  { id: 2, title: "Dados de acesso" },
  { id: 3, title: "Endereço" },
  { id: 4, title: "Configuração do serviço" },
  { id: 5, title: "Revisão" },
] as const;

type CompanyData = {
  cnpj: string;
  razao_social: string;
  nome_fantasia: string;
  name: string;
  slug: string;
  email: string;
  telefones: unknown;
  logradouro: string;
  numero: string;
  complemento: string;
  bairro: string;
  cep: string;
  uf: string;
  municipio: string;
  opencnpj_raw: unknown;
};

function slugFromName(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .slice(0, 50);
}

const emptyCompany: CompanyData = {
  cnpj: "",
  razao_social: "",
  nome_fantasia: "",
  name: "",
  slug: "",
  email: "",
  telefones: undefined,
  logradouro: "",
  numero: "",
  complemento: "",
  bairro: "",
  cep: "",
  uf: "",
  municipio: "",
  opencnpj_raw: undefined,
};

export default function OnboardingPage() {
  const [step, setStep] = useState(1);
  const [company, setCompany] = useState<CompanyData>(emptyCompany);
  const [sectors, setSectors] = useState<string[]>(["Padrão"]);
  const [newSectorName, setNewSectorName] = useState("");
  const [userEmail, setUserEmail] = useState("");
  const [userPassword, setUserPassword] = useState("");
  const [userPasswordConfirm, setUserPasswordConfirm] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showPasswordConfirm, setShowPasswordConfirm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadingCnpj, setLoadingCnpj] = useState(false);
  const [loadingCep, setLoadingCep] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ slug: string; link: string; slug_adjusted?: boolean } | null>(null);
  const [linkCopied, setLinkCopied] = useState(false);
  const [authChecked, setAuthChecked] = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  /** Evita reaplicar e-mail da Receita/OpenCNPJ no campo de login após o usuário limpar ou editar. */
  const userEmailTouchedRef = useRef(false);

  const supabase = createClient();

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      setAuthChecked(true);
      setIsLoggedIn(!!user);
      if (user && company.email && !userEmailTouchedRef.current) {
        setUserEmail((prev) => prev || company.email);
      }
    });
  }, [company.email]);

  const fetchCnpj = async () => {
    const digits = company.cnpj.replace(/\D/g, "");
    if (digits.length !== 14) {
      setError("CNPJ deve ter 14 dígitos");
      return;
    }
    setError(null);
    setLoadingCnpj(true);
    try {
      const res = await fetch(`/api/opencnpj/${digits}`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (res.status === 403) {
          setError("Limite de consultas excedido. Tente novamente mais tarde.");
        } else if (res.status === 429) {
          setError("Muitas consultas. Aguarde um momento.");
        } else if (res.status === 404) {
          setError("CNPJ não encontrado");
        } else {
          setError(data.error ?? "Erro ao buscar CNPJ");
        }
        setLoadingCnpj(false);
        return;
      }
      const razao = data.razao_social ?? "";
      const fantasia = data.nome_fantasia ?? "";
      const name = (fantasia || razao).trim() || "Minha Empresa";
      setCompany({
        cnpj: digits,
        razao_social: razao,
        nome_fantasia: fantasia,
        name,
        slug: slugFromName(name),
        email: data.email ?? "",
        telefones: data.telefones,
        logradouro: data.logradouro ?? "",
        numero: data.numero ?? "",
        complemento: data.complemento ?? "",
        bairro: data.bairro ?? "",
        cep: (data.cep ?? "").replace(/\D/g, "").slice(0, 8),
        uf: data.uf ?? "",
        municipio: data.municipio ?? "",
        opencnpj_raw: data,
      });
      if (!userEmailTouchedRef.current) {
        setUserEmail(data.email ?? "");
      }
    } catch {
      setError("Erro ao buscar CNPJ");
    } finally {
      setLoadingCnpj(false);
    }
  };

  const fetchCep = async () => {
    const digits = company.cep.replace(/\D/g, "");
    if (digits.length !== 8) return;
    setLoadingCep(true);
    try {
      const res = await fetch(`/api/viacep/${digits}`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data.erro) {
        setError(data.error ?? "CEP não encontrado");
      } else {
        setError(null);
        setCompany((c) => ({
          ...c,
          logradouro: data.logradouro ?? c.logradouro,
          bairro: data.bairro ?? c.bairro,
          municipio: data.localidade ?? c.municipio,
          uf: data.uf ?? c.uf,
        }));
      }
    } catch {
      setError("Erro ao buscar CEP");
    } finally {
      setLoadingCep(false);
    }
  };

  const handleSubmitFinal = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      if (!isLoggedIn) {
        if (userPassword.length < 6) {
          setError("Senha deve ter no mínimo 6 caracteres");
          setLoading(false);
          return;
        }
        if (userPassword !== userPasswordConfirm) {
          setError("As senhas não coincidem");
          setLoading(false);
          return;
        }
      }

      const res = await fetch("/api/onboarding", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: company.name,
          slug: company.slug,
          cnpj: company.cnpj || undefined,
          razao_social: company.razao_social || undefined,
          nome_fantasia: company.nome_fantasia || undefined,
          email: company.email || undefined,
          telefones: company.telefones,
          logradouro: company.logradouro || undefined,
          numero: company.numero || undefined,
          complemento: company.complemento || undefined,
          bairro: company.bairro || undefined,
          cep: company.cep || undefined,
          uf: company.uf || undefined,
          municipio: company.municipio || undefined,
          opencnpj_raw: company.opencnpj_raw,
          queue_names: sectors.filter((s) => s.trim()).length ? sectors.filter((s) => s.trim()) : ["Padrão"],
          ...(!isLoggedIn && {
            user_email: userEmail.trim(),
            user_password: userPassword,
          }),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Erro ao criar empresa");
        setLoading(false);
        return;
      }
      const s = data.company?.slug ?? company.slug;
      const link = typeof window !== "undefined" ? `${window.location.origin}/${s}` : `/${s}`;

      if (!isLoggedIn) {
        const { error: signInError } = await supabase.auth.signInWithPassword({
          email: userEmail.trim(),
          password: userPassword,
        });
        if (signInError) {
          setError("Empresa criada, mas falha ao entrar: " + signInError.message);
          setLoading(false);
          return;
        }
      }

      setResult({ slug: s, link, slug_adjusted: data.company?.slug_adjusted });
    } catch {
      setError("Erro de conexão");
    } finally {
      setLoading(false);
    }
  };

  const inputClass =
    "mt-1.5 w-full rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] px-4 py-3 text-[#1E293B] placeholder-[#94A3B8] focus:border-clicvend-blue focus:bg-white focus:outline-none focus:ring-2 focus:ring-clicvend-blue/20 transition-all";
  const labelClass = "block text-sm font-semibold text-[#1E293B]";
  const btnPrimary =
    "inline-flex items-center gap-2 rounded-xl bg-clicvend-orange px-5 py-3 font-semibold text-white shadow-lg shadow-clicvend-orange/25 hover:bg-clicvend-orange-dark disabled:bg-[#94A3B8] disabled:shadow-none transition-all";
  const btnSecondary = "inline-flex items-center gap-2 rounded-xl border border-[#E2E8F0] bg-white px-5 py-3 font-medium text-[#1E293B] hover:bg-[#F8FAFC] transition-all";

  if (!authChecked) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#F8FAFC]">
        <div className="text-[#64748B]">Carregando…</div>
      </main>
    );
  }

  const copyLink = () => {
    if (!result) return;
    navigator.clipboard.writeText(result.link).then(() => {
      setLinkCopied(true);
      setTimeout(() => setLinkCopied(false), 2000);
    });
  };

  if (result) {
    return (
      <main className="min-h-screen bg-[#F8FAFC] pt-14">
        <PublicHeader />
        <div className="flex flex-col items-center justify-center p-8">
          <div className="w-full max-w-md rounded-2xl border border-[#E2E8F0] bg-white p-8 shadow-sm">
            <Link href="/" className="flex justify-center focus:outline-none focus:ring-2 focus:ring-clicvend-blue focus:ring-offset-2 rounded">
              <ClicVendLogo size="md" />
            </Link>
          <h1 className="mt-6 text-xl font-bold text-[#0F172A]">Empresa criada</h1>
          {result.slug_adjusted && (
            <p className="mt-4 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
              O link desejado já estava em uso. Seu acesso foi criado com um link alternativo.
            </p>
          )}
          <p className="mt-4 text-sm font-medium text-[#64748B]">Seu link de acesso:</p>
          <div className="mt-2 flex items-center gap-2 rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] p-3">
            <a
              href={result.link}
              className="min-w-0 flex-1 break-all font-mono text-sm font-medium text-clicvend-blue hover:underline"
            >
              {result.link}
            </a>
            <button
              type="button"
              onClick={copyLink}
              className="flex shrink-0 items-center gap-2 rounded-lg p-2 text-sm font-medium transition-colors hover:bg-[#E2E8F0]"
              title={linkCopied ? "Copiado!" : "Copiar link"}
            >
              {linkCopied ? (
                <>
                  <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                  <span className="text-emerald-600">Copiado!</span>
                </>
              ) : (
                <>
                  <Copy className="h-4 w-4 text-[#64748B]" />
                  <span className="text-[#64748B]">Copiar</span>
                </>
              )}
            </button>
          </div>
          <p className="mt-4 text-sm text-[#64748B]">Use este link para acessar o painel e configurar canais e filas.</p>
          <a href={result.link} className={`mt-6 inline-block w-full text-center ${btnPrimary}`}>
            Acessar painel
          </a>
        </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#F8FAFC] pt-14">
      <PublicHeader />
      <div className="mx-auto max-w-4xl px-4 py-10">
        {/* Step indicator - 5 colunas iguais, círculos e labels centralizados */}
        <div className="mt-10 grid grid-cols-5 gap-0">
          {STEPS.map((s, idx) => (
            <div key={s.id} className="flex flex-col items-center">
              <div className="flex w-full items-center">
                <div className="flex-1" />
                <button
                  type="button"
                  onClick={() => setStep(s.id)}
                  className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full font-bold text-sm transition-all ${
                    step === s.id
                      ? "bg-clicvend-orange text-white shadow-lg shadow-clicvend-orange/30 ring-4 ring-clicvend-orange/20"
                      : step > s.id
                        ? "bg-clicvend-orange text-white"
                        : "bg-[#E2E8F0] text-[#64748B] hover:bg-[#CBD5E1]"
                  }`}
                >
                  {step > s.id ? <Check className="h-5 w-5" strokeWidth={2.5} /> : s.id}
                </button>
                {idx < STEPS.length - 1 ? (
                  <div className={`flex-1 h-0.5 min-w-[4px] mx-0.5 ${step > s.id ? "bg-clicvend-orange" : "bg-[#E2E8F0]"}`} />
                ) : (
                  <div className="flex-1" />
                )}
              </div>
              <span
                className={`mt-3 w-full text-center text-[11px] font-semibold leading-tight sm:text-xs ${
                  step === s.id ? "text-clicvend-blue" : step > s.id ? "text-[#64748B]" : "text-[#94A3B8]"
                }`}
              >
                {s.title}
              </span>
            </div>
          ))}
        </div>

        <div className="mt-10 rounded-2xl border border-[#E2E8F0] bg-white p-8 shadow-sm sm:p-10">
          <h2 className="text-lg font-bold text-[#0F172A]">{STEPS[step - 1].title}</h2>
          <p className="mt-0.5 text-sm text-[#64748B]">Etapa {step} de 5</p>

          {step === 1 && (
            <div className="mt-8 grid grid-cols-2 gap-5 md:grid-cols-4">
              <div className="col-span-2">
                <label className={labelClass}>CNPJ *</label>
                <input
                  type="text"
                  placeholder="00.000.000/0000-00"
                  value={
                    company.cnpj.length === 14
                      ? company.cnpj.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, "$1.$2.$3/$4-$5")
                      : company.cnpj
                  }
                  onChange={(e) => setCompany((c) => ({ ...c, cnpj: e.target.value.replace(/\D/g, "").slice(0, 14) }))}
                  onBlur={() => {
                    if (company.cnpj.replace(/\D/g, "").length === 14) fetchCnpj();
                  }}
                  className={inputClass}
                />
                <p className="mt-1 text-xs text-[#64748B]">Digite e clique fora do campo para preencher automaticamente.</p>
                {loadingCnpj && <p className="mt-1 text-xs text-clicvend-blue">Buscando…</p>}
              </div>
              <div className="col-span-2">
                <label className={labelClass}>Razão social *</label>
                <input
                  type="text"
                  value={company.razao_social}
                  onChange={(e) => setCompany((c) => ({ ...c, razao_social: e.target.value }))}
                  placeholder="Nome completo da empresa"
                  className={inputClass}
                />
              </div>
              <div className="col-span-2">
                <label className={labelClass}>Nome fantasia</label>
                <input
                  type="text"
                  value={company.nome_fantasia}
                  onChange={(e) => setCompany((c) => ({ ...c, nome_fantasia: e.target.value }))}
                  placeholder="Nome fantasia"
                  className={inputClass}
                />
              </div>
              <div className="col-span-2">
                <label className={labelClass}>Nome de exibição *</label>
                <input
                  type="text"
                  value={company.name}
                  onChange={(e) => setCompany((c) => ({ ...c, name: e.target.value, slug: slugFromName(e.target.value) }))}
                  placeholder="Ex.: Minha Loja"
                  className={inputClass}
                />
              </div>
              <div className="col-span-2">
                <label className={labelClass}>Slug (URL) *</label>
                <input
                  type="text"
                  value={company.slug}
                  onChange={(e) => setCompany((c) => ({ ...c, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "") }))}
                  placeholder="minha-loja"
                  className={inputClass}
                />
                <p className="mt-1 text-xs text-[#64748B]">Apenas letras minúsculas, números e hífen.</p>
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="mt-8 grid grid-cols-2 gap-5 md:grid-cols-4">
              <div className={isLoggedIn ? "col-span-4" : "col-span-2"}>
                <label className={labelClass}>E-mail *</label>
                <input
                  type="email"
                  value={userEmail}
                  onChange={(e) => {
                    userEmailTouchedRef.current = true;
                    setUserEmail(e.target.value);
                  }}
                  placeholder="seu@empresa.com.br"
                  className={inputClass}
                  autoComplete="email"
                />
                <p className="mt-1 text-xs text-[#64748B]">Este será o acesso do administrador da empresa.</p>
              </div>
              {!isLoggedIn && (
                <>
                  <div className="col-span-2">
                    <label className={labelClass}>Senha *</label>
                    <div className="relative">
                      <input
                        type={showPassword ? "text" : "password"}
                        value={userPassword}
                        onChange={(e) => setUserPassword(e.target.value)}
                        placeholder="Mínimo 6 caracteres"
                        className={inputClass + " pr-12"}
                        autoComplete="new-password"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-[#64748B] hover:text-[#1E293B] transition-colors"
                        aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}
                      >
                        {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                  </div>
                  <div className="col-span-2">
                    <label className={labelClass}>Confirmar senha *</label>
                    <div className="relative">
                      <input
                        type={showPasswordConfirm ? "text" : "password"}
                        value={userPasswordConfirm}
                        onChange={(e) => setUserPasswordConfirm(e.target.value)}
                        placeholder="Digite a senha novamente"
                        className={inputClass + " pr-12"}
                        autoComplete="new-password"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPasswordConfirm(!showPasswordConfirm)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-[#64748B] hover:text-[#1E293B] transition-colors"
                        aria-label={showPasswordConfirm ? "Ocultar senha" : "Mostrar senha"}
                      >
                        {showPasswordConfirm ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                  </div>
                </>
              )}
            </div>
          )}

          {step === 3 && (
            <div className="mt-8">
              <div className="mb-6 rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] p-5">
                <h3 className="text-sm font-bold uppercase tracking-wide text-[#64748B]">Endereço da empresa</h3>
              </div>
              <div className="grid grid-cols-2 gap-5 md:grid-cols-4">
                <div>
                  <label className={labelClass}>CEP</label>
                  <input
                    type="text"
                    value={
                      company.cep.length === 8
                        ? company.cep.replace(/(\d{5})(\d{3})/, "$1-$2")
                        : company.cep
                    }
                    onChange={(e) => setCompany((c) => ({ ...c, cep: e.target.value.replace(/\D/g, "").slice(0, 8) }))}
                    onBlur={() => {
                      if (company.cep.replace(/\D/g, "").length === 8) fetchCep();
                    }}
                    placeholder="00000-000"
                    className={inputClass}
                  />
                  {loadingCep && <p className="mt-1 text-xs text-clicvend-blue">Buscando…</p>}
                </div>
                <div className="col-span-2">
                  <label className={labelClass}>Logradouro</label>
                  <input type="text" value={company.logradouro} onChange={(e) => setCompany((c) => ({ ...c, logradouro: e.target.value }))} placeholder="Rua, avenida..." className={inputClass} />
                </div>
                <div>
                  <label className={labelClass}>Número</label>
                  <input type="text" value={company.numero} onChange={(e) => setCompany((c) => ({ ...c, numero: e.target.value }))} placeholder="123" className={inputClass} />
                </div>
                <div>
                  <label className={labelClass}>Complemento</label>
                  <input type="text" value={company.complemento} onChange={(e) => setCompany((c) => ({ ...c, complemento: e.target.value }))} placeholder="Sala, andar..." className={inputClass} />
                </div>
                <div>
                  <label className={labelClass}>Bairro</label>
                  <input type="text" value={company.bairro} onChange={(e) => setCompany((c) => ({ ...c, bairro: e.target.value }))} placeholder="Centro" className={inputClass} />
                </div>
                <div>
                  <label className={labelClass}>Município</label>
                  <input type="text" value={company.municipio} onChange={(e) => setCompany((c) => ({ ...c, municipio: e.target.value }))} placeholder="São Paulo" className={inputClass} />
                </div>
                <div>
                  <label className={labelClass}>UF</label>
                  <input type="text" value={company.uf} onChange={(e) => setCompany((c) => ({ ...c, uf: e.target.value.slice(0, 2).toUpperCase() }))} placeholder="SP" className={inputClass} />
                </div>
              </div>
            </div>
          )}

          {step === 4 && (
            <div className="mt-8">
              <div className="mb-6 rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] p-5">
                <h3 className="text-sm font-bold uppercase tracking-wide text-[#64748B]">Setores de atendimento</h3>
                <p className="mt-0.5 text-xs text-[#94A3B8]">Crie os setores que você terá no seu atendimento. Opcional — pode ser feito depois no painel.</p>
              </div>
              <div className="space-y-3">
                {sectors.map((name, idx) => (
                  <div key={idx} className="flex items-center gap-2">
                    <input
                      type="text"
                      value={name}
                      onChange={(e) =>
                        setSectors((prev) => {
                          const next = [...prev];
                          next[idx] = e.target.value;
                          return next;
                        })
                      }
                      placeholder="Ex: Vendas, Suporte"
                      className={inputClass + " flex-1"}
                    />
                    <button
                      type="button"
                      onClick={() => setSectors((prev) => prev.filter((_, i) => i !== idx))}
                      className="rounded-xl p-3 text-[#64748B] hover:bg-red-50 hover:text-red-600 transition-colors"
                      title="Remover setor"
                    >
                      <Trash2 className="h-5 w-5" />
                    </button>
                  </div>
                ))}
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={newSectorName}
                    onChange={(e) => setNewSectorName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        const n = newSectorName.trim();
                        if (n && !sectors.includes(n)) {
                          setSectors((prev) => [...prev, n]);
                          setNewSectorName("");
                        }
                      }
                    }}
                    placeholder="Adicionar setor..."
                    className={inputClass + " flex-1"}
                  />
                  <button
                    type="button"
                    onClick={() => {
                      const n = newSectorName.trim();
                      if (n && !sectors.includes(n)) {
                        setSectors((prev) => [...prev, n]);
                        setNewSectorName("");
                      }
                    }}
                    className="inline-flex items-center gap-2 rounded-xl border border-[#E2E8F0] bg-white px-4 py-3 font-medium text-[#64748B] hover:bg-[#F8FAFC] transition-colors"
                  >
                    <Plus className="h-5 w-5" />
                    Adicionar
                  </button>
                </div>
              </div>
            </div>
          )}

          {step === 5 && (
            <div className="mt-6 space-y-4 text-sm">
              <div className="rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] p-4">
                <h3 className="text-xs font-bold uppercase tracking-wide text-[#64748B] mb-3">Empresa</h3>
                <p><span className="text-[#64748B]">Nome:</span> <strong>{company.name}</strong></p>
                <p><span className="text-[#64748B]">Link:</span> <strong>/{company.slug}</strong></p>
                {company.cnpj && <p><span className="text-[#64748B]">CNPJ:</span> {company.cnpj.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, "$1.$2.$3/$4-$5")}</p>}
              </div>
              <div className="rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] p-4">
                <h3 className="text-xs font-bold uppercase tracking-wide text-[#64748B] mb-3">Acesso</h3>
                <p><span className="text-[#64748B]">E-mail (admin):</span> {userEmail || "—"}</p>
              </div>
              {(company.logradouro || company.cep || company.municipio) && (
                <div className="rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] p-4">
                  <h3 className="text-xs font-bold uppercase tracking-wide text-[#64748B] mb-3">Endereço</h3>
                  <p>
                    {[company.logradouro, company.numero, company.complemento].filter(Boolean).join(", ")}
                    {company.bairro && ` — ${company.bairro}`}
                  </p>
                  <p>{[company.municipio, company.uf].filter(Boolean).join(" — ")}</p>
                  {company.cep && <p>CEP: {company.cep.replace(/(\d{5})(\d{3})/, "$1-$2")}</p>}
                </div>
              )}
              <div className="rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] p-4">
                <h3 className="text-xs font-bold uppercase tracking-wide text-[#64748B] mb-3">Setores</h3>
                <p><span className="text-[#64748B]">Setores de atendimento:</span> {sectors.filter((s) => s.trim()).join(", ") || "Padrão"}</p>
              </div>
            </div>
          )}

          {error && <p className="mt-4 text-sm font-medium text-[#EF4444]">{error}</p>}

          <div className="mt-10 flex flex-col-reverse gap-3 sm:flex-row sm:justify-between sm:items-center">
            {step > 1 ? (
              <button type="button" onClick={() => setStep(step - 1)} className={btnSecondary}>
                <ChevronLeft className="h-4 w-4" />
                Anterior
              </button>
            ) : (
              <Link href="/" className={btnSecondary + " inline-flex w-fit"}>
                <ChevronLeft className="h-4 w-4" />
                Voltar
              </Link>
            )}
            {step < 5 ? (
              <button
                type="button"
                onClick={() => setStep(step + 1)}
                disabled={
                  (step === 1 && (!company.name.trim() || !company.slug.trim())) ||
                  (step === 2 &&
                    (!userEmail.trim() ||
                      (!isLoggedIn && (userPassword.length < 6 || userPassword !== userPasswordConfirm))))
                }
                className={btnPrimary + " sm:ml-auto"}
              >
                Próximo
                <ChevronRight className="h-4 w-4" />
              </button>
            ) : (
              <button type="button" onClick={handleSubmitFinal} disabled={loading} className={btnPrimary + " sm:ml-auto"}>
                {loading ? "Criando…" : "Criar empresa"}
              </button>
            )}
          </div>
        </div>

        <p className="mt-6 text-center text-xs text-[#64748B]">Sem cartão de crédito • Sem compromisso</p>
        <p className="mt-2 text-center text-sm text-[#64748B]">
          Já tem conta? <Link href="/login" className="font-semibold text-clicvend-blue hover:underline">Faça login aqui</Link>
        </p>
      </div>
    </main>
  );
}
