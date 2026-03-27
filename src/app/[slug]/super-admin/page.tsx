"use client";

import { useState, useEffect, useMemo } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  Building2,
  Power,
  PowerOff,
  Loader2,
  RefreshCw,
  DollarSign,
  Settings,
  ExternalLink,
  TrendingUp,
  BarChart3,
  Users,
  CreditCard,
} from "lucide-react";
import { CompanyDetailSideOver, type Company, PLAN_LABELS, PLAN_VALUES } from "./CompanyDetailSideOver";

const BILLING_LABELS: Record<string, string> = {
  active: "Ativo",
  trial: "Trial",
  suspended: "Suspenso",
  cancelled: "Cancelado",
};

export default function SuperAdminPage() {
  const params = useParams();
  const router = useRouter();
  const slug = params?.slug as string | undefined;
  const [companies, setCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [updating, setUpdating] = useState<string | null>(null);
  const [sideOverOpen, setSideOverOpen] = useState(false);
  const [selectedCompany, setSelectedCompany] = useState<Company | null>(null);
  const [sideOverTab, setSideOverTab] = useState<"boletos" | "config" | "implantacao">("boletos");

  async function fetchCompanies() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/companies", { credentials: "include" });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setCompanies(data.companies ?? []);
      } else {
        if (res.status === 401 && slug) {
          router.replace(`/${slug}/conversas`);
          return;
        }
        setError(data?.error ?? "Erro ao carregar");
      }
    } catch {
      setError("Erro de conexão");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchCompanies();
  }, []);

  async function toggleActive(c: Company) {
    setUpdating(c.id);
    try {
      const res = await fetch(`/api/admin/companies/${c.id}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_active: !c.is_active }),
      });
      if (res.ok) {
        setCompanies((prev) =>
          prev.map((x) => (x.id === c.id ? { ...x, is_active: !x.is_active } : x))
        );
        if (selectedCompany?.id === c.id) {
          setSelectedCompany((prev) =>
            prev ? { ...prev, is_active: !prev.is_active } : null
          );
        }
      }
    } finally {
      setUpdating(null);
    }
  }

  function openDetail(
    c: Company,
    tab: "boletos" | "config" | "implantacao" = "config"
  ) {
    setSelectedCompany(c);
    setSideOverTab(tab);
    setSideOverOpen(true);
  }

  function handleSideOverSaved(updated: Company) {
    setCompanies((prev) =>
      prev.map((x) => (x.id === updated.id ? updated : x))
    );
    if (selectedCompany?.id === updated.id) {
      setSelectedCompany(updated);
    }
  }

  function formatDate(s: string | null) {
    if (!s) return "—";
    try {
      return new Date(s).toLocaleDateString("pt-BR", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
      });
    } catch {
      return "—";
    }
  }

  const metrics = useMemo(() => {
    const active = companies.filter((c) => c.is_active);
    const paying = active.filter((c) => (c.billing_status ?? "active") === "active");
    const mrr = paying.reduce((sum, c) => sum + (PLAN_VALUES[c.billing_plan ?? "basic"] ?? 0), 0);
    const arr = mrr * 12;

    // Implantação é taxa única: conta para empresas ativas, independentemente do billing_status.
    const implantationsThisYearCents = active.reduce(
      (sum, c) => sum + (c.implantations_this_year_total_cents ?? 0),
      0
    );
    const implantationsThisYearCount = active.reduce(
      (sum, c) => sum + (c.implantations_this_year_count ?? 0),
      0
    );
    const arrInclImpl = arr + implantationsThisYearCents / 100;

    const now = new Date();
    const thisMonth = now.getMonth();
    const thisYear = now.getFullYear();
    const newThisMonth = companies.filter((c) => {
      if (!c.created_at) return false;
      const d = new Date(c.created_at);
      return d.getMonth() === thisMonth && d.getFullYear() === thisYear;
    }).length;
    return {
      total: companies.length,
      active: active.length,
      inactive: companies.length - active.length,
      mrr,
      arr,
      arrInclImpl,
      implantationsThisYearReais: implantationsThisYearCents / 100,
      implantationsThisYearCount,
      newThisMonth,
    };
  }, [companies]);

  if (loading && companies.length === 0) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="h-8 w-8 animate-spin text-emerald-600" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[#1E293B]">Super Admin</h1>
          <p className="text-sm text-[#64748B] mt-0.5">
            Gerencie empresas e controle pagamentos (acesso restrito ao dono da plataforma)
          </p>
        </div>
        <button
          type="button"
          onClick={() => fetchCompanies()}
          disabled={loading}
          className="flex h-10 w-10 items-center justify-center rounded-full bg-[#F1F5F9] text-[#64748B] hover:bg-[#E2E8F0] transition-colors"
          aria-label="Atualizar"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
        </button>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-red-700">
          {error}
        </div>
      )}

      {companies.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-xl border border-[#E2E8F0] bg-white p-4 shadow-sm">
            <div className="flex items-center gap-2 text-[#64748B]">
              <TrendingUp className="h-4 w-4" />
              <span className="text-xs font-medium uppercase tracking-wider">Receita mensal (MRR)</span>
            </div>
            <p className="mt-2 text-2xl font-bold text-[#1E293B]">
              R$ {metrics.mrr.toLocaleString("pt-BR")}
            </p>
            <p className="mt-0.5 text-xs text-[#94A3B8]">
              R$ {metrics.arrInclImpl.toLocaleString("pt-BR")}/ano (ARR + Implantação)
            </p>
          </div>
          <div className="rounded-xl border border-[#E2E8F0] bg-white p-4 shadow-sm">
            <div className="flex items-center gap-2 text-[#64748B]">
              <ExternalLink className="h-4 w-4" />
              <span className="text-xs font-medium uppercase tracking-wider">Implantação(s)</span>
            </div>
            <p className="mt-2 text-2xl font-bold text-[#1E293B]">
              R$ {metrics.implantationsThisYearReais.toLocaleString("pt-BR")}
            </p>
            <p className="mt-0.5 text-xs text-[#94A3B8]">
              {metrics.implantationsThisYearCount} cobrança(s) no total
            </p>
          </div>
          <div className="rounded-xl border border-[#E2E8F0] bg-white p-4 shadow-sm">
            <div className="flex items-center gap-2 text-[#64748B]">
              <Users className="h-4 w-4" />
              <span className="text-xs font-medium uppercase tracking-wider">Empresas</span>
            </div>
            <p className="mt-2 text-2xl font-bold text-[#1E293B]">
              {metrics.total}
            </p>
            <p className="mt-0.5 text-xs text-[#94A3B8]">
              {metrics.active} ativas · {metrics.inactive} inativas
            </p>
          </div>
          <div className="rounded-xl border border-[#E2E8F0] bg-white p-4 shadow-sm">
            <div className="flex items-center gap-2 text-[#64748B]">
              <CreditCard className="h-4 w-4" />
              <span className="text-xs font-medium uppercase tracking-wider">Novas este mês</span>
            </div>
            <p className="mt-2 text-2xl font-bold text-[#1E293B]">
              {metrics.newThisMonth}
            </p>
            <p className="mt-0.5 text-xs text-[#94A3B8]">
              Empresas cadastradas
            </p>
          </div>
        </div>
      )}

      {companies.length === 0 ? (
        <div className="rounded-xl border border-[#E2E8F0] bg-white p-8 text-center">
          <Building2 className="mx-auto h-12 w-12 text-[#94A3B8]" />
          <p className="mt-2 text-[#64748B]">Nenhuma empresa cadastrada.</p>
        </div>
      ) : (
        <div className="rounded-xl border border-[#E2E8F0] bg-white shadow-sm overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[#E2E8F0] bg-[#F8FAFC] px-4 py-3">
            <p className="text-sm text-[#64748B]">
              {companies.length} empresa(s) ·{" "}
              <span className="font-medium text-[#1E293B]">
                {companies.filter((c) => c.is_active).length} ativas
              </span>
            </p>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px]">
              <thead>
                <tr className="border-b border-[#E2E8F0] bg-[#F8FAFC]">
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-[#64748B]">
                    Empresa
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-[#64748B]">
                    Slug
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-[#64748B]">
                    Criada em
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-[#64748B]">
                    Status
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-[#64748B]">
                    Pagamento
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-[#64748B]">
                    Plano
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-[#64748B]">
                    Ações
                  </th>
                </tr>
              </thead>
              <tbody>
                {companies.map((c) => (
                  <tr
                    key={c.id}
                    className="border-b border-[#E2E8F0] transition-colors hover:bg-[#F8FAFC]"
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <Building2 className="h-4 w-4 text-[#94A3B8] shrink-0" />
                        <span className="font-medium text-[#1E293B]">{c.name}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <a
                        href={`/${c.slug}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-sm text-emerald-600 hover:underline font-mono"
                      >
                        /{c.slug}
                        <ExternalLink className="h-3.5 w-3.5" />
                      </a>
                    </td>
                    <td className="px-4 py-3 text-sm text-[#64748B]">
                      {formatDate(c.created_at)}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ${
                          c.is_active
                            ? "bg-emerald-100 text-emerald-700"
                            : "bg-red-100 text-red-700"
                        }`}
                      >
                        {c.is_active ? "Ativa" : "Desativada"}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ${
                          (c.billing_status ?? "active") === "active"
                            ? "bg-emerald-100 text-emerald-700"
                            : (c.billing_status ?? "") === "trial"
                              ? "bg-amber-100 text-amber-700"
                              : (c.billing_status ?? "") === "suspended"
                                ? "bg-red-100 text-red-700"
                                : "bg-[#F1F5F9] text-[#64748B]"
                        }`}
                      >
                        <DollarSign className="h-3.5 w-3.5" />
                        {BILLING_LABELS[c.billing_status ?? "active"] ?? c.billing_status}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-sm font-medium text-[#1E293B]">
                        {PLAN_LABELS[c.billing_plan ?? "basic"] ?? c.billing_plan} — R$ {PLAN_VALUES[c.billing_plan ?? "basic"] ?? 0}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        {updating === c.id ? (
                          <span className="rounded-lg p-2 text-[#64748B]">
                            <Loader2 className="h-5 w-5 animate-spin" />
                          </span>
                        ) : (
                          <>
                            <button
                              type="button"
                              onClick={() => toggleActive(c)}
                              className={`flex items-center justify-center rounded-lg p-2 transition-colors ${
                                c.is_active
                                  ? "text-amber-600 hover:bg-amber-50"
                                  : "text-emerald-600 hover:bg-emerald-50"
                              } disabled:opacity-50`}
                              title={c.is_active ? "Desativar" : "Ativar"}
                            >
                              {c.is_active ? (
                                <PowerOff className="h-5 w-5" />
                              ) : (
                                <Power className="h-5 w-5" />
                              )}
                            </button>
                            <button
                              type="button"
                              onClick={() => openDetail(c, "config")}
                              className="rounded-lg p-2 text-[#64748B] hover:bg-[#F1F5F9] hover:text-[#1E293B] transition-colors"
                              title="Configurações"
                            >
                              <Settings className="h-5 w-5" />
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <CompanyDetailSideOver
        open={sideOverOpen}
        onClose={() => {
          setSideOverOpen(false);
          setSelectedCompany(null);
        }}
        company={selectedCompany}
        onSaved={handleSideOverSaved}
        initialTab={sideOverTab}
      />
    </div>
  );
}
