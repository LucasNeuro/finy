"use client";

import { memo, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import {
  ShieldCheck,
  Calculator,
  Save,
  Send,
  PencilLine,
  ChevronsLeft,
  ChevronsRight,
  ChevronLeft,
  ChevronRight,
  RotateCcw,
} from "lucide-react";
import { queryKeys } from "@/lib/query-keys";
import {
  publicInsurancePartnerLogoUrlCandidates,
  storagePathsToTryForPartnerSlug,
} from "@/lib/insurance-multicalculo";

type QuoteRow = {
  partner_id?: string;
  slug?: string;
  insurer: string;
  price: number;
  coverages: string;
  discount: string;
  logo_url?: string | null;
};

function insurerInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return (parts[0]![0]! + parts[1]![0]!).toUpperCase();
}

/** URLs para tentar no <img>: API (absoluta), depois caminhos padrão no bucket (pasta slug ou raiz). */
function buildLogoCandidates(q: QuoteRow): string[] {
  const urls: string[] = [];
  const fromApi = q.logo_url?.trim();
  if (fromApi) {
    if (/^https?:\/\//i.test(fromApi)) urls.push(fromApi);
    else urls.push(...publicInsurancePartnerLogoUrlCandidates(fromApi));
  }
  if (q.slug) {
    for (const p of storagePathsToTryForPartnerSlug(q.slug)) {
      urls.push(...publicInsurancePartnerLogoUrlCandidates(p));
    }
  }
  return [...new Set(urls)];
}

/**
 * Descobre a primeira URL válida com `Image()` antes de renderizar o <img>,
 * evitando piscar (vários onError em sequência no DOM).
 */
function QuoteLogo({ name, candidates }: { name: string; candidates: string[] }) {
  const [resolvedUrl, setResolvedUrl] = useState<string | null>(null);
  const [probing, setProbing] = useState(true);
  const sig = candidates.join("\0");

  useEffect(() => {
    let cancelled = false;
    setResolvedUrl(null);
    setProbing(true);
    if (candidates.length === 0) {
      setProbing(false);
      return;
    }
    let i = 0;
    const tryNext = () => {
      if (cancelled) return;
      if (i >= candidates.length) {
        setProbing(false);
        return;
      }
      const url = candidates[i]!;
      i += 1;
      const img = new Image();
      img.onload = () => {
        if (!cancelled) {
          setResolvedUrl(url);
          setProbing(false);
        }
      };
      img.onerror = () => tryNext();
      img.src = url;
    };
    tryNext();
    return () => {
      cancelled = true;
    };
  }, [sig]); // eslint-disable-line react-hooks/exhaustive-deps -- sig resume candidates

  const initials = (
    <div
      className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-violet-200/90 text-sm font-bold text-violet-900"
      aria-hidden
    >
      {insurerInitials(name)}
    </div>
  );

  if (probing) {
    return (
      <div className="relative h-14 w-14 shrink-0">
        <div className="opacity-40">{initials}</div>
      </div>
    );
  }

  if (resolvedUrl) {
    return (
      <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-slate-100 bg-white">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={resolvedUrl} alt={name} className="max-h-full max-w-full object-contain p-1" loading="lazy" decoding="async" />
      </div>
    );
  }

  return initials;
}

const QuoteResultCard = memo(function QuoteResultCard({ q }: { q: QuoteRow }) {
  const logoCandidates = useMemo(
    () => buildLogoCandidates(q),
    [q.partner_id, q.slug, q.logo_url, q.insurer],
  );
  return (
    <article
      className="min-w-[min(100%,280px)] max-w-[320px] shrink-0 snap-start rounded-2xl border border-violet-200/70 bg-gradient-to-b from-white to-violet-50/50 p-4 shadow-sm"
    >
      <div className="mb-3 flex items-center gap-3">
        <QuoteLogo name={q.insurer} candidates={logoCandidates} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-violet-950">{q.insurer}</p>
          <p className="text-lg font-bold text-emerald-600">
            {q.price.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
          </p>
        </div>
      </div>
      <p className="text-xs leading-relaxed text-slate-600">{q.coverages}</p>
      <p className="mt-2 text-xs font-medium text-violet-800">Desconto: {q.discount}</p>
    </article>
  );
});

type FormState = {
  insured_data: { cpfCnpj: string; nome: string; cep: string; email: string };
  driver_data: { hasMainDriver: boolean; nome: string };
  vehicle_data: { placa: string; chassi: string; anoModelo: string };
  questionnaire_data: { tipoUso: string; kmMensal: string };
  policy_data: { tipoSeguro: "novo" | "renovacao"; vigenciaInicial: string; vigenciaFinal: string };
  coverage_data: { tipoCobertura: string; franquia: string };
  services_data: { assistencia: string; vidros: string; carroReserva: string };
};

const STEPS = ["Segurado", "Condutor", "Veículo", "Questionário", "Seguro", "Coberturas", "Serviços"] as const;
const EMPTY: FormState = {
  insured_data: { cpfCnpj: "", nome: "", cep: "", email: "" },
  driver_data: { hasMainDriver: true, nome: "" },
  vehicle_data: { placa: "", chassi: "", anoModelo: "" },
  questionnaire_data: { tipoUso: "particular", kmMensal: "" },
  policy_data: { tipoSeguro: "novo", vigenciaInicial: "", vigenciaFinal: "" },
  coverage_data: { tipoCobertura: "compreensiva", franquia: "normal" },
  services_data: { assistencia: "sim", vidros: "sim", carroReserva: "sim" },
};

function getCompanySlug(pathname: string | null): string {
  const fromPath = pathname?.split("/").filter(Boolean)[0] ?? "";
  if (fromPath && !["login", "api", "onboarding", "auth"].includes(fromPath)) return fromPath;
  if (typeof document !== "undefined") {
    const match = document.cookie.match(/\bclicvend_slug=([^;]+)/);
    if (match?.[1]) return match[1].trim();
  }
  return fromPath;
}

function validateStep(step: number, f: FormState): string | null {
  if (step === 0) {
    const doc = f.insured_data.cpfCnpj.replace(/\D/g, "");
    if (![11, 14].includes(doc.length)) return "CPF/CNPJ inválido.";
    if (!f.insured_data.nome.trim()) return "Nome é obrigatório.";
    if (f.insured_data.cep.replace(/\D/g, "").length !== 8) return "CEP inválido.";
  }
  if (step === 1 && f.driver_data.hasMainDriver && !f.driver_data.nome.trim()) return "Nome do condutor é obrigatório.";
  if (step === 2 && !f.vehicle_data.placa.trim()) return "Placa é obrigatória.";
  if (step === 4 && (!f.policy_data.vigenciaInicial || !f.policy_data.vigenciaFinal)) return "Informe vigência inicial/final.";
  return null;
}

export default function MulticalculoPage() {
  const pathname = usePathname();
  const router = useRouter();
  const slug = getCompanySlug(pathname);
  const apiHeaders = useMemo(() => (slug ? { "X-Company-Slug": slug } : undefined), [slug]);
  const [step, setStep] = useState(0);
  const [formData, setFormData] = useState<FormState>(EMPTY);
  const [quotes, setQuotes] = useState<QuoteRow[]>([]);
  const [recordId, setRecordId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [okMsg, setOkMsg] = useState("");
  const [isCalculating, setIsCalculating] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const carouselRef = useRef<HTMLDivElement>(null);

  const { data: permissionsData } = useQuery({
    queryKey: queryKeys.permissions(slug ?? ""),
    queryFn: () => fetch("/api/auth/permissions", { credentials: "include", headers: apiHeaders }).then((r) => r.json()),
    enabled: !!slug,
    staleTime: 5 * 60 * 1000,
  });

  const permissions = Array.isArray(permissionsData?.permissions) ? permissionsData.permissions : [];
  const canAccess =
    permissionsData?.multicalculo_seguros_enabled === true &&
    (permissions.includes("insurance_multicalculo.view") || permissions.includes("insurance_multicalculo.manage"));

  useEffect(() => {
    if (slug && permissionsData !== undefined && !canAccess) router.replace(`/${slug}/conversas`);
  }, [slug, permissionsData, canAccess, router]);

  useEffect(() => {
    if (!slug || !canAccess) return;
    const run = async () => {
      const res = await fetch("/api/insurance-multicalculo/quotes?latest=1", { credentials: "include", headers: apiHeaders });
      if (!res.ok) return;
      const data = await res.json();
      if (!data) return;
      setRecordId(data.id);
      const raw = Array.isArray(data.quotes_result) ? data.quotes_result : [];
      setQuotes(
        raw.map((q: Record<string, unknown>) => ({
          insurer: String(q.insurer ?? ""),
          price: Number(q.price) || 0,
          coverages: String(q.coverages ?? ""),
          discount: String(q.discount ?? ""),
          partner_id: typeof q.partner_id === "string" ? q.partner_id : undefined,
          slug: typeof q.slug === "string" ? q.slug : undefined,
          logo_url: typeof q.logo_url === "string" ? q.logo_url : (q.logo_url === null ? null : undefined),
        })),
      );
      setFormData({
        insured_data: { ...EMPTY.insured_data, ...(data.insured_data ?? {}) },
        driver_data: { ...EMPTY.driver_data, ...(data.driver_data ?? {}) },
        vehicle_data: { ...EMPTY.vehicle_data, ...(data.vehicle_data ?? {}) },
        questionnaire_data: { ...EMPTY.questionnaire_data, ...(data.questionnaire_data ?? {}) },
        policy_data: { ...EMPTY.policy_data, ...(data.policy_data ?? {}) },
        coverage_data: { ...EMPTY.coverage_data, ...(data.coverage_data ?? {}) },
        services_data: { ...EMPTY.services_data, ...(data.services_data ?? {}) },
      });
    };
    void run();
  }, [slug, canAccess, apiHeaders]);

  const isLastStep = step === STEPS.length - 1;
  const progressPct = Math.round(((step + 1) / STEPS.length) * 100);
  const segBase = "inline-flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-medium transition-colors sm:px-3.5 sm:py-2 sm:text-sm";
  const segInactive = "text-[#64748B] hover:bg-[#F8FAFC]";
  const segActive = "bg-violet-200/80 text-violet-900";
  const payload = useMemo(() => ({ title: `Simulação ${new Date().toLocaleDateString("pt-BR")}`, ...formData, quotes_result: quotes }), [formData, quotes]);

  const save = async (status: "draft" | "calculated" | "proposal_sent" = "draft") => {
    setIsSaving(true);
    setError("");
    const url = recordId ? `/api/insurance-multicalculo/quotes/${recordId}` : "/api/insurance-multicalculo/quotes";
    const method = recordId ? "PATCH" : "POST";
    const res = await fetch(url, { method, credentials: "include", headers: { "Content-Type": "application/json", ...(apiHeaders ?? {}) }, body: JSON.stringify({ ...payload, status }) });
    const data = await res.json();
    setIsSaving(false);
    if (!res.ok) return setError(data?.error ?? "Falha ao salvar.");
    setRecordId(data.id);
    setOkMsg("Simulação salva.");
  };

  const calculate = async () => {
    const err = validateStep(step, formData);
    if (err) return setError(err);
    setError("");
    setIsCalculating(true);
    const res = await fetch("/api/insurance-multicalculo/calculate", { method: "POST", credentials: "include", headers: { "Content-Type": "application/json", ...(apiHeaders ?? {}) }, body: JSON.stringify(payload) });
    const data = await res.json();
    setIsCalculating(false);
    if (!res.ok) return setError(data?.error ?? "Falha ao calcular.");
    const list = Array.isArray(data.quotes) ? data.quotes : [];
    setQuotes(
      list.map((q: Record<string, unknown>) => ({
        insurer: String(q.insurer ?? ""),
        price: Number(q.price) || 0,
        coverages: String(q.coverages ?? ""),
        discount: String(q.discount ?? ""),
        partner_id: typeof q.partner_id === "string" ? q.partner_id : undefined,
        slug: typeof q.slug === "string" ? q.slug : undefined,
        logo_url: typeof q.logo_url === "string" ? q.logo_url : (q.logo_url === null ? null : undefined),
      })),
    );
    setOkMsg(`Sorteio aleatório concluído (${list.length} cotações).`);
    await save("calculated");
  };

  const nextStep = () => {
    const err = validateStep(step, formData);
    if (err) return setError(err);
    setError("");
    setStep((p) => Math.min(STEPS.length - 1, p + 1));
  };

  /** Limpa tudo e inicia nova simulação (não apaga registro antigo no banco até você salvar de novo). */
  const startNewSimulation = () => {
    setFormData({ ...EMPTY });
    setQuotes([]);
    setRecordId(null);
    setStep(0);
    setError("");
    setOkMsg("Formulário limpo. Preencha e use Calcular para um novo sorteio de seguradoras.");
  };

  if (permissionsData !== undefined && !canAccess) return null;
  const inputCls =
    "rounded-lg border border-violet-200/80 bg-white px-3 py-2 text-sm outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-200/60";

  return (
    <div className="min-h-0 flex-1 overflow-auto bg-gradient-to-b from-violet-50/80 to-[#f4f0fb] p-4 lg:p-5">
      <div className="mx-auto flex w-full max-w-[1600px] flex-col gap-4">
        <div className="rounded-2xl border border-violet-200/80 bg-white p-5 shadow-sm shadow-violet-100/50">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-violet-800">
              <ShieldCheck className="h-5 w-5 text-violet-500" />
              <h1 className="text-lg font-semibold">Módulo de Multicálculo de Seguros</h1>
            </div>
            <button
              type="button"
              onClick={startNewSimulation}
              className="inline-flex items-center gap-1.5 rounded-full border border-violet-300/70 bg-violet-100/80 px-3 py-1.5 text-xs font-medium text-violet-900 hover:bg-violet-200/90"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              Nova simulação
            </button>
          </div>
          <div className="h-2 w-full rounded-full bg-violet-100">
            <div className="h-2 rounded-full bg-violet-400 transition-all" style={{ width: `${progressPct}%` }} />
          </div>
          <p className="mt-2 text-xs text-slate-500">
            Etapa {step + 1} de {STEPS.length}: <span className="font-medium text-violet-800">{STEPS[step]}</span>
          </p>
          {error ? <p className="mt-2 text-sm text-red-600">{error}</p> : null}
          {okMsg ? <p className="mt-2 text-sm text-violet-800">{okMsg}</p> : null}
        </div>

        <div className="rounded-2xl border border-violet-200/80 bg-white p-3 shadow-sm shadow-violet-100/40">
          <div className="overflow-x-auto pb-0.5 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            <div className="inline-flex min-w-min overflow-hidden rounded-full border border-violet-200 bg-white">
              {STEPS.map((label, idx) => (
                <button
                  key={label}
                  type="button"
                  onClick={() => setStep(idx)}
                  className={`${segBase} whitespace-nowrap ${idx > 0 ? "border-l border-violet-200" : ""} ${step === idx ? segActive : segInactive}`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-violet-200/80 bg-white p-4 shadow-sm shadow-violet-100/40">
          <h2 className="mb-4 text-base font-semibold text-violet-950">{STEPS[step]}</h2>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 2xl:grid-cols-4">
            {step === 0 ? <><input className={inputCls} placeholder="CPF/CNPJ *" value={formData.insured_data.cpfCnpj} onChange={(e) => setFormData((p) => ({ ...p, insured_data: { ...p.insured_data, cpfCnpj: e.target.value } }))} /><input className={inputCls} placeholder="Nome *" value={formData.insured_data.nome} onChange={(e) => setFormData((p) => ({ ...p, insured_data: { ...p.insured_data, nome: e.target.value } }))} /><input className={inputCls} placeholder="CEP *" value={formData.insured_data.cep} onChange={(e) => setFormData((p) => ({ ...p, insured_data: { ...p.insured_data, cep: e.target.value } }))} /><input className={inputCls} placeholder="E-mail" value={formData.insured_data.email} onChange={(e) => setFormData((p) => ({ ...p, insured_data: { ...p.insured_data, email: e.target.value } }))} /></> : null}
            {step === 1 ? <><select className={inputCls} value={formData.driver_data.hasMainDriver ? "sim" : "nao"} onChange={(e) => setFormData((p) => ({ ...p, driver_data: { ...p.driver_data, hasMainDriver: e.target.value === "sim" } }))}><option value="sim">Condutor principal: Sim</option><option value="nao">Condutor principal: Não</option></select>{formData.driver_data.hasMainDriver ? <input className={inputCls} placeholder="Nome condutor *" value={formData.driver_data.nome} onChange={(e) => setFormData((p) => ({ ...p, driver_data: { ...p.driver_data, nome: e.target.value } }))} /> : null}</> : null}
            {step === 2 ? <><input className={inputCls} placeholder="Placa *" value={formData.vehicle_data.placa} onChange={(e) => setFormData((p) => ({ ...p, vehicle_data: { ...p.vehicle_data, placa: e.target.value } }))} /><input className={inputCls} placeholder="Chassi" value={formData.vehicle_data.chassi} onChange={(e) => setFormData((p) => ({ ...p, vehicle_data: { ...p.vehicle_data, chassi: e.target.value } }))} /><input className={inputCls} placeholder="Ano/Modelo" value={formData.vehicle_data.anoModelo} onChange={(e) => setFormData((p) => ({ ...p, vehicle_data: { ...p.vehicle_data, anoModelo: e.target.value } }))} /></> : null}
            {step === 3 ? <><select className={inputCls} value={formData.questionnaire_data.tipoUso} onChange={(e) => setFormData((p) => ({ ...p, questionnaire_data: { ...p.questionnaire_data, tipoUso: e.target.value } }))}><option value="particular">Uso particular</option><option value="comercial">Uso comercial</option></select><input className={inputCls} placeholder="KM mensal" value={formData.questionnaire_data.kmMensal} onChange={(e) => setFormData((p) => ({ ...p, questionnaire_data: { ...p.questionnaire_data, kmMensal: e.target.value } }))} /></> : null}
            {step === 4 ? <><select className={inputCls} value={formData.policy_data.tipoSeguro} onChange={(e) => setFormData((p) => ({ ...p, policy_data: { ...p.policy_data, tipoSeguro: e.target.value as "novo" | "renovacao" } }))}><option value="novo">Seguro novo</option><option value="renovacao">Renovação</option></select><input type="date" className={inputCls} value={formData.policy_data.vigenciaInicial} onChange={(e) => setFormData((p) => ({ ...p, policy_data: { ...p.policy_data, vigenciaInicial: e.target.value } }))} /><input type="date" className={inputCls} value={formData.policy_data.vigenciaFinal} onChange={(e) => setFormData((p) => ({ ...p, policy_data: { ...p.policy_data, vigenciaFinal: e.target.value } }))} /></> : null}
            {step === 5 ? <><select className={inputCls} value={formData.coverage_data.tipoCobertura} onChange={(e) => setFormData((p) => ({ ...p, coverage_data: { ...p.coverage_data, tipoCobertura: e.target.value } }))}><option value="compreensiva">Compreensiva</option><option value="terceiros">Terceiros</option></select><input className={inputCls} placeholder="Franquia" value={formData.coverage_data.franquia} onChange={(e) => setFormData((p) => ({ ...p, coverage_data: { ...p.coverage_data, franquia: e.target.value } }))} /></> : null}
            {step === 6 ? <><select className={inputCls} value={formData.services_data.assistencia} onChange={(e) => setFormData((p) => ({ ...p, services_data: { ...p.services_data, assistencia: e.target.value } }))}><option value="sim">Assistência: Sim</option><option value="nao">Assistência: Não</option></select><select className={inputCls} value={formData.services_data.vidros} onChange={(e) => setFormData((p) => ({ ...p, services_data: { ...p.services_data, vidros: e.target.value } }))}><option value="sim">Vidros: Sim</option><option value="nao">Vidros: Não</option></select></> : null}
          </div>
        </div>

        <div className="rounded-2xl border border-violet-200/80 bg-white p-4 shadow-sm shadow-violet-100/40">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-base font-semibold text-violet-950">Resultado da Simulação</h3>
            {quotes.length > 1 ? (
              <div className="inline-flex rounded-full border border-violet-200 bg-violet-50/90 p-0.5">
                <button
                  type="button"
                  aria-label="Anterior"
                  className="rounded-full p-1.5 text-violet-700 hover:bg-white hover:shadow-sm"
                  onClick={() => carouselRef.current?.scrollBy({ left: -320, behavior: "smooth" })}
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  aria-label="Próximo"
                  className="rounded-full p-1.5 text-violet-700 hover:bg-white hover:shadow-sm"
                  onClick={() => carouselRef.current?.scrollBy({ left: 320, behavior: "smooth" })}
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            ) : null}
          </div>
          {quotes.length ? (
            <div
              ref={carouselRef}
              className="flex snap-x snap-mandatory gap-4 overflow-x-auto overflow-y-hidden pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden [&::-webkit-scrollbar]:h-0 [&::-webkit-scrollbar]:w-0"
            >
              {quotes.map((q) => (
                <QuoteResultCard key={q.partner_id ?? q.slug ?? q.insurer} q={q} />
              ))}
            </div>
          ) : (
            <div className="rounded-lg border border-dashed border-violet-200 bg-violet-50/40 p-6 text-center text-sm text-slate-600">
              {isLastStep ? "Clique em Calcular para gerar cotações." : "Avance até Serviços para calcular."}
            </div>
          )}
        </div>

        <div className="sticky bottom-2 z-20 rounded-2xl border border-violet-200/80 bg-white p-3 shadow-lg shadow-violet-200/30">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="inline-flex shrink-0 overflow-hidden rounded-full border border-violet-200 bg-white">
              <button type="button" disabled={step === 0} onClick={() => setStep((p) => Math.max(0, p - 1))} className={`${segBase} min-h-[36px] min-w-[44px] px-3 disabled:opacity-40 ${segInactive}`}><ChevronsLeft className="h-4 w-4" /></button>
              <button type="button" disabled={step >= STEPS.length - 1} onClick={nextStep} className={`${segBase} min-h-[36px] min-w-[44px] border-l border-violet-200 px-3 disabled:opacity-40 ${segInactive}`}><ChevronsRight className="h-4 w-4" /></button>
            </div>
            <div className="inline-flex max-w-full overflow-hidden rounded-full border border-violet-200 bg-white">
              <button type="button" onClick={() => void save("draft")} disabled={isSaving} className={`${segBase} border-r border-violet-200 ${segInactive} disabled:opacity-60`}><Save className="h-3.5 w-3.5" />Salvar</button>
              <button type="button" onClick={() => setOkMsg("Edição ativa.")} className={`${segBase} border-r border-violet-200 ${segInactive}`}><PencilLine className="h-3.5 w-3.5" />Editar</button>
              <button type="button" onClick={() => void save("proposal_sent")} className={`${segBase} ${isLastStep ? "border-r border-violet-200" : ""} ${segInactive}`}><Send className="h-3.5 w-3.5" />Enviar</button>
              {isLastStep ? <button type="button" onClick={() => void calculate()} disabled={isCalculating} className={`${segBase} ${isCalculating ? segInactive : `${segActive} font-semibold`}`}><Calculator className="h-3.5 w-3.5" />{isCalculating ? "Calculando..." : "Calcular"}</button> : null}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
