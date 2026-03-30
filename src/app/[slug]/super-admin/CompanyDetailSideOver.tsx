"use client";

import { useState, useEffect } from "react";
import { SideOver } from "@/components/SideOver";
import {
  Building2,
  DollarSign,
  Loader2,
  Power,
  PowerOff,
  Save,
  FileText,
  ExternalLink,
  FileDown,
  Copy,
  Settings,
  LayoutGrid,
} from "lucide-react";
import {
  COMPANY_MODULE_LABELS,
  normalizeEnabledModules,
} from "@/lib/company/enabled-modules";

type Invoice = {
  id: string;
  month: number;
  year: number;
  amount_cents: number;
  due_date: string;
  status: string;
  bank_slip_url: string | null;
  pdf_url: string | null;
  created_at: string;
};

export type Company = {
  id: string;
  name: string;
  slug: string;
  is_active: boolean;
  billing_status: string;
  billing_notes: string | null;
  billing_updated_at: string | null;
  billing_plan: string;
  created_at: string;
  updated_at: string;
  enabled_modules?: unknown;
  multicalculo_seguros_enabled?: boolean;

  // Implantação(s) do ano atual para compor métricas do dashboard.
  implantations_this_year_total_cents?: number;
  implantations_this_year_count?: number;
};

const BILLING_LABELS: Record<string, string> = {
  active: "Ativo",
  trial: "Trial",
  suspended: "Suspenso",
  cancelled: "Cancelado",
};

export const PLAN_LABELS: Record<string, string> = {
  basic: "Basic",
  plus: "Plus",
  extra: "Extra",
};

export const PLAN_VALUES: Record<string, number> = {
  basic: 350,
  plus: 600,
  extra: 980,
};

const MONTH_NAMES = [
  "Jan", "Fev", "Mar", "Abr", "Mai", "Jun",
  "Jul", "Ago", "Set", "Out", "Nov", "Dez",
];

type CompanyDetailSideOverProps = {
  open: boolean;
  onClose: () => void;
  company: Company | null;
  onSaved?: (company: Company) => void;
  /** Aba inicial ao abrir */
  initialTab?: "boletos" | "config" | "implantacao";
};

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

function toISODateLocal(d: Date): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatBRL(value: number): string {
  const n = Number.isFinite(value) ? value : 0;
  // Intl formata como "R$ 1.234,00" (com NBSP). Normalizamos para espaço comum.
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" })
    .format(n)
    .replace(/\u00A0/g, " ");
}

function parseBRL(input: string): number | null {
  const s = input
    .replace(/\u00A0/g, " ")
    .replace(/^R\$\s*/i, "")
    .trim();
  if (!s) return null;

  // Mantém apenas dígitos e separadores.
  const cleaned = s.replace(/[^\d,.-]/g, "");
  if (!cleaned) return null;

  const hasComma = cleaned.includes(",");
  const hasDot = cleaned.includes(".");

  // Se tiver vírgula, assumimos que é decimal e ponto pode ser milhar.
  let normalized = cleaned;
  if (hasComma) {
    normalized = normalized.replace(/\./g, "");
    normalized = normalized.replace(/,/g, ".");
  } else if (hasDot) {
    // Sem vírgula, deixamos ponto como decimal.
    normalized = normalized.replace(/,/g, ".");
  }

  const n = Number(normalized);
  return Number.isFinite(n) ? n : null;
}

export function CompanyDetailSideOver({
  open,
  onClose,
  company,
  onSaved,
  initialTab = "config",
}: CompanyDetailSideOverProps) {
  const [billingStatus, setBillingStatus] = useState(company?.billing_status ?? "active");
  const [billingPlan, setBillingPlan] = useState(company?.billing_plan ?? "basic");
  const [billingNotes, setBillingNotes] = useState(company?.billing_notes ?? "");
  const [saving, setSaving] = useState(false);
  const [toggling, setToggling] = useState(false);
  const [emitting, setEmitting] = useState(false);
  const [emitMonths, setEmitMonths] = useState(12);
  const [emitResult, setEmitResult] = useState<{
    emitted: number;
    total: number;
    error?: string;
    firstError?: string;
  } | null>(null);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [invoicesError, setInvoicesError] = useState<string | null>(null);
  const [invoicesLoading, setInvoicesLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<"boletos" | "config" | "implantacao" | "modulos">("boletos");

  const [modulesDraft, setModulesDraft] = useState<Record<string, boolean>>(() => normalizeEnabledModules(null));
  const [multicalculoDraft, setMulticalculoDraft] = useState(false);
  const [savingModules, setSavingModules] = useState(false);

  const [implantValue, setImplantValue] = useState<number>(0);
  const [implantValueDisplay, setImplantValueDisplay] = useState<string>(formatBRL(0));
  const [implantDueDate, setImplantDueDate] = useState<string>("");
  const [implantLoading, setImplantLoading] = useState(false);
  const [implantResult, setImplantResult] = useState<{
    bank_slip_url: string | null;
    pix_emv: string | null;
    pdf_signed_url: string | null;
    due_date?: string;
    month?: number;
    year?: number;
    amount_cents?: number;
    status?: string;
    error?: string;
  } | null>(null);
  const [implantCopyToast, setImplantCopyToast] = useState<string | null>(null);
  // (removido) botão de backfill: agora o usuário popula via SQL quando necessário

  useEffect(() => {
    if (open) setActiveTab(initialTab);
  }, [open, initialTab]);

  useEffect(() => {
    if (company) {
      setBillingStatus(company.billing_status ?? "active");
      setBillingPlan(company.billing_plan ?? "basic");
      setBillingNotes(company.billing_notes ?? "");
      const n = normalizeEnabledModules(company.enabled_modules);
      const colMulti = company.multicalculo_seguros_enabled === true;
      setMulticalculoDraft(colMulti);
      setModulesDraft({ ...n, multicalculo: colMulti });

      // Defaults para a cobrança de implantação (valores iniciais).
      setImplantValue(PLAN_VALUES[(company.billing_plan as string) ?? "basic"] ?? 350);
      const defaultDue = new Date();
      defaultDue.setDate(defaultDue.getDate() + 1);
      setImplantDueDate(toISODateLocal(defaultDue));
      setImplantValueDisplay(
        formatBRL(PLAN_VALUES[(company.billing_plan as string) ?? "basic"] ?? 350)
      );
    }
    if (!open) {
      setEmitResult(null);
      setInvoices([]);
      setInvoicesError(null);
      setImplantValue(0);
      setImplantDueDate("");
      setImplantValueDisplay(formatBRL(0));
      setImplantLoading(false);
      setImplantResult(null);
    }
  }, [company, open]);

  useEffect(() => {
    if (!open || !company) return;
    setInvoicesLoading(true);
    setInvoicesError(null);
    fetch(`/api/admin/invoices?company_id=${company.id}`, { credentials: "include" })
      .then(async (r) => {
        const d = await r.json().catch(() => ({}));
        if (!r.ok) {
          throw new Error(d.error ?? `HTTP ${r.status}`);
        }
        setInvoices(d.invoices ?? []);
      })
      .catch((e) => {
        console.error("[Super Admin] Erro ao carregar boletos:", e);
        setInvoices([]);
        setInvoicesError(e instanceof Error ? e.message : "Erro ao carregar boletos");
      })
      .finally(() => setInvoicesLoading(false));
  }, [open, company?.id]);

  async function handleSave() {
    if (!company) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/companies/${company.id}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          billing_status: billingStatus,
          billing_plan: billingPlan,
          billing_notes: billingNotes.trim() || null,
        }),
      });
      if (res.ok) {
        const data = await res.json().catch(() => ({}));
        onSaved?.(data.company ?? { ...company, billing_status: billingStatus, billing_plan: billingPlan, billing_notes: billingNotes.trim() || null });
      }
    } finally {
      setSaving(false);
    }
  }

  async function handleEmitBoletos() {
    if (!company) return;
    setEmitting(true);
    setEmitResult(null);
    try {
      const res = await fetch("/api/admin/invoices/emit", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ company_id: company.id, months: emitMonths }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        const emitted = data.emitted ?? 0;
        const total = data.total ?? emitMonths;
        const firstError = data.firstError;
        const isSuccess = emitted > 0;
        setEmitResult({
          emitted,
          total,
          error: isSuccess ? undefined : firstError ?? data.error ?? "Nenhum boleto foi emitido.",
          firstError,
        });
        if (isSuccess) {
          fetch(`/api/admin/invoices?company_id=${company.id}`, { credentials: "include" })
            .then(async (r) => {
              const d = await r.json().catch(() => ({}));
              if (!r.ok) {
                throw new Error(d.error ?? `HTTP ${r.status}`);
              }
              setInvoices(d.invoices ?? []);
              setInvoicesError(null);
            })
            .catch((e) => {
              console.error("[Super Admin] Erro ao recarregar boletos:", e);
              setInvoices([]);
              setInvoicesError(e instanceof Error ? e.message : "Erro ao recarregar boletos");
            });
        }
      } else {
        setEmitResult({ emitted: 0, total: emitMonths, error: data.error ?? "Erro ao emitir" });
      }
    } catch {
      setEmitResult({ emitted: 0, total: emitMonths, error: "Erro de conexão" });
    } finally {
      setEmitting(false);
    }
  }

  async function handleCreateImplantacao() {
    if (!company) return;
    setImplantLoading(true);
    setImplantResult(null);
    setImplantCopyToast(null);
    try {
      const amountReais = Number(implantValue);
      if (!Number.isFinite(amountReais) || amountReais <= 0) {
        setImplantResult({
          bank_slip_url: null,
          pix_emv: null,
          pdf_signed_url: null,
          error: "Informe um valor válido (R$).",
        });
        return;
      }
      if (!implantDueDate) {
        setImplantResult({
          bank_slip_url: null,
          pix_emv: null,
          pdf_signed_url: null,
          error: "Informe a data de vencimento.",
        });
        return;
      }

      const res = await fetch("/api/admin/invoices/implantacao", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          company_id: company.id,
          amount_reais: amountReais,
          due_date: implantDueDate, // YYYY-MM-DD
        }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setImplantResult({
          bank_slip_url: null,
          pix_emv: null,
          pdf_signed_url: null,
          error: data.error ?? "Falha ao gerar link de pagamento",
        });
        return;
      }

      const [y, m] = implantDueDate.split("-").slice(0, 2);
      const month = Number(m);
      const year = Number(y);
      const amountCents = Math.max(500, Math.round(amountReais * 100));

      setImplantResult({
        bank_slip_url: data.bank_slip_url ?? null,
        pix_emv: data.pix_emv ?? null,
        pdf_signed_url: data.pdf_signed_url ?? null,
        due_date: implantDueDate,
        month,
        year,
        amount_cents: amountCents,
        status: "OPEN",
      });
    } catch (e) {
      setImplantResult({
        bank_slip_url: null,
        pix_emv: null,
        pdf_signed_url: null,
        error: e instanceof Error ? e.message : "Erro de conexão",
      });
    } finally {
      setImplantLoading(false);
    }
  }

  async function handleCopyImplantPaymentLink() {
    const link = implantResult?.bank_slip_url;
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      setImplantCopyToast("Link do pagamento copiado!");
      window.setTimeout(() => setImplantCopyToast(null), 2000);
    } catch {
      setImplantCopyToast("Não foi possível copiar automaticamente.");
      window.setTimeout(() => setImplantCopyToast(null), 2000);
    }
  }

  async function handleSaveModules() {
    if (!company) return;
    setSavingModules(true);
    try {
      const enabled_modules = { ...modulesDraft, multicalculo: multicalculoDraft };
      const res = await fetch(`/api/admin/companies/${company.id}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          enabled_modules,
          multicalculo_seguros_enabled: multicalculoDraft,
        }),
      });
      if (res.ok) {
        const data = await res.json().catch(() => ({}));
        const updated = data.company as Company | undefined;
        if (updated) {
          onSaved?.(updated);
        } else {
          onSaved?.({
            ...company,
            enabled_modules,
            multicalculo_seguros_enabled: multicalculoDraft,
          });
        }
      }
    } finally {
      setSavingModules(false);
    }
  }

  async function handleToggleActive() {
    if (!company) return;
    setToggling(true);
    try {
      const res = await fetch(`/api/admin/companies/${company.id}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_active: !company.is_active }),
      });
      if (res.ok) {
        const data = await res.json().catch(() => ({}));
        onSaved?.(data.company ?? { ...company, is_active: !company.is_active });
      }
    } finally {
      setToggling(false);
    }
  }

  if (!company) return null;

  const hasChanges =
    billingStatus !== (company.billing_status ?? "active") ||
    billingPlan !== (company.billing_plan ?? "basic") ||
    (billingNotes.trim() || "") !== (company.billing_notes ?? "");

  const normalizedCompanyModules = normalizeEnabledModules(company.enabled_modules);
  const colMulti = company.multicalculo_seguros_enabled === true;
  const baselineModules = { ...normalizedCompanyModules, multicalculo: colMulti };
  const modulesDirty =
    multicalculoDraft !== colMulti ||
    COMPANY_MODULE_LABELS.some((row) => modulesDraft[row.key] !== baselineModules[row.key]) ||
    modulesDraft.multicalculo !== baselineModules.multicalculo;

  const tabModulos = (
    <div className="space-y-5">
      <p className="text-sm text-[#64748B]">
        Ative ou desative módulos do menu desta empresa. Alterações valem após salvar — usuários podem precisar atualizar a
        página.
      </p>

      <div className="rounded-lg border border-emerald-200 bg-emerald-50/60 p-4">
        <label className="flex cursor-pointer items-start gap-3">
          <input
            type="checkbox"
            checked={multicalculoDraft}
            onChange={(e) => {
              const v = e.target.checked;
              setMulticalculoDraft(v);
              setModulesDraft((prev) => ({ ...prev, multicalculo: v }));
            }}
            className="mt-1 h-4 w-4 rounded border-[#E2E8F0] text-emerald-600 focus:ring-emerald-500"
          />
          <span>
            <span className="font-medium text-[#1E293B]">Seguros — Multicalculo</span>
            <span className="mt-0.5 block text-xs text-[#64748B]">
              Habilita a aba Multicalculo e integrações de seguros. Sincroniza com o flag <code className="rounded bg-white px-1">multicalculo_seguros_enabled</code> e o módulo <code className="rounded bg-white px-1">multicalculo</code> no JSON.
            </span>
          </span>
        </label>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {COMPANY_MODULE_LABELS.map((row) => (
          <label
            key={row.key}
            className="flex cursor-pointer items-start gap-3 rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] p-3 transition-colors hover:bg-[#F1F5F9]"
          >
            <input
              type="checkbox"
              checked={modulesDraft[row.key] !== false}
              onChange={(e) =>
                setModulesDraft((prev) => ({
                  ...prev,
                  [row.key]: e.target.checked,
                }))
              }
              className="mt-0.5 h-4 w-4 shrink-0 rounded border-[#E2E8F0] text-emerald-600 focus:ring-emerald-500"
            />
            <span className="min-w-0">
              <span className="font-medium text-[#1E293B]">{row.label}</span>
              {row.description ? <span className="mt-0.5 block text-xs text-[#64748B]">{row.description}</span> : null}
            </span>
          </label>
        ))}
      </div>

      {modulesDirty && (
        <div className="flex justify-end pt-2">
          <button
            type="button"
            onClick={handleSaveModules}
            disabled={savingModules}
            className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50 transition-colors"
          >
            {savingModules ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Salvar módulos
          </button>
        </div>
      )}
    </div>
  );

  const tabBoletos = (
    <div className="space-y-4">
      <div className="rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] p-4">
        <div className="flex items-center gap-2 text-sm font-medium text-[#1E293B]">
          <FileText className="h-4 w-4 text-[#64748B]" />
          Emitir boletos (Cora)
        </div>
        <p className="mt-1 text-xs text-[#64748B]">
          Gera boletos para os próximos meses. Requer CNPJ e endereço cadastrados.
        </p>
        <div className="mt-3 flex items-center gap-2">
          <select
            value={emitMonths}
            onChange={(e) => setEmitMonths(Number(e.target.value))}
            className="rounded-lg border border-[#E2E8F0] bg-white px-3 py-2 text-sm text-[#1E293B] focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
          >
            {[1, 3, 6, 12].map((n) => (
              <option key={n} value={n}>
                {n} {n === 1 ? "mês" : "meses"}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={handleEmitBoletos}
            disabled={emitting}
            className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50 transition-colors"
          >
            {emitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
            Emitir boletos
          </button>
        </div>
        {emitResult && (
          <div
            className={`mt-3 rounded-lg px-3 py-2 text-sm ${
              emitResult.emitted > 0 ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"
            }`}
          >
            {emitResult.emitted > 0
              ? `${emitResult.emitted} de ${emitResult.total} boleto(s) emitido(s) com sucesso.`
              : emitResult.error ?? "Nenhum boleto foi emitido."}
          </div>
        )}
      </div>

      <div>
        <h3 className="mb-2 text-sm font-medium text-[#1E293B]">Boletos emitidos</h3>
        {invoicesError && (
          <p className="mb-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {invoicesError}
          </p>
        )}
        {invoicesLoading ? (
          <div className="flex items-center gap-2 rounded-lg border border-[#E2E8F0] bg-white px-4 py-4 text-sm text-[#64748B]">
            <Loader2 className="h-4 w-4 animate-spin" />
            Carregando...
          </div>
        ) : invoices.length === 0 ? (
          <p className="rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] px-4 py-6 text-center text-sm text-[#94A3B8]">
            Nenhum boleto emitido ainda.
          </p>
        ) : (
          <div className="overflow-hidden rounded-lg border border-[#E2E8F0]">
            <table className="w-full min-w-[400px] text-sm">
              <thead>
                <tr className="border-b border-[#E2E8F0] bg-[#F8FAFC]">
                  <th className="px-4 py-2 text-left text-xs font-medium text-[#64748B]">Mês/Ano</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-[#64748B]">Vencimento</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-[#64748B]">Status</th>
                  <th className="px-4 py-2 text-right text-xs font-medium text-[#64748B]">Valor</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-[#64748B]">Ação</th>
                </tr>
              </thead>
              <tbody>
                {invoices.map((inv) => {
                  const url = inv.pdf_url ?? inv.bank_slip_url;
                  const label = `${MONTH_NAMES[inv.month - 1]} ${inv.year}`;
                  const due = formatDate(inv.due_date);
                  const statusColor =
                    inv.status === "PAID"
                      ? "bg-emerald-100 text-emerald-700"
                      : inv.status === "OPEN"
                        ? "bg-amber-100 text-amber-700"
                        : "bg-[#F1F5F9] text-[#64748B]";
                  return (
                    <tr key={inv.id} className="border-b border-[#E2E8F0] last:border-0">
                      <td className="px-4 py-2 font-medium text-[#1E293B]">{label}</td>
                      <td className="px-4 py-2 text-[#64748B]">{due}</td>
                      <td className="px-4 py-2">
                        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${statusColor}`}>
                          {inv.status === "PAID" ? "Pago" : inv.status === "OPEN" ? "Aberto" : inv.status}
                        </span>
                      </td>
                      <td className="px-4 py-2 text-right font-medium text-[#1E293B]">
                        R$ {(inv.amount_cents / 100).toLocaleString("pt-BR")}
                      </td>
                      <td className="px-4 py-2">
                        {url ? (
                          <a
                            href={url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-emerald-600 hover:bg-emerald-50"
                            title="Abrir / Baixar PDF"
                          >
                            <FileDown className="h-4 w-4" />
                          </a>
                        ) : (
                          <span className="text-[#94A3B8]">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );

  const tabImplantacao = (
    <div className="space-y-4">
      <div className="rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] p-4">
        <div className="flex items-center gap-2 text-sm font-medium text-[#1E293B]">
          <FileText className="h-4 w-4 text-[#64748B]" />
          Cobrança - Taxa de Implantação
        </div>
        <p className="mt-1 text-xs text-[#64748B]">
          Gere um link de pagamento (boleto/pix) para a taxa de implantação preenchendo o valor e o vencimento.
        </p>

        <div className="mt-4 space-y-3">
          <div>
            <label className="block text-sm font-medium text-[#1E293B]">Valor (R$)</label>
            <input
              type="text"
              value={implantValueDisplay}
              onChange={(e) => {
                const next = e.target.value;
                setImplantValueDisplay(next);
                const parsed = parseBRL(next);
                setImplantValue(parsed ?? 0);
              }}
              onBlur={() => {
                const parsed = parseBRL(implantValueDisplay);
                setImplantValueDisplay(formatBRL(parsed ?? 0));
                setImplantValue(parsed ?? 0);
              }}
              placeholder="R$ 0,00"
              className="mt-2 w-full rounded-lg border border-[#E2E8F0] bg-white px-3 py-2 text-sm text-[#1E293B] focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-[#1E293B]">Vencimento</label>
            <input
              type="date"
              value={implantDueDate}
              onChange={(e) => setImplantDueDate(e.target.value)}
              className="mt-2 w-full rounded-lg border border-[#E2E8F0] bg-white px-3 py-2 text-sm text-[#1E293B] focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
            />
          </div>

          <div className="pt-2">
            <button
              type="button"
              onClick={handleCreateImplantacao}
              disabled={implantLoading}
              className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50 transition-colors"
            >
              {implantLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ExternalLink className="h-4 w-4" />}
              Gerar link de pagamento
            </button>
          </div>
        </div>
      </div>

      {implantResult && (
        <div className="space-y-3">
          <div>
            <h3 className="mb-2 text-sm font-medium text-[#1E293B]">Cobrança gerada</h3>
            {implantResult.error ? (
              <p className="text-sm text-red-700">{implantResult.error}</p>
            ) : (
              <div className="overflow-hidden rounded-lg border border-[#E2E8F0] bg-white">
                <table className="w-full min-w-[420px] text-sm">
                  <thead>
                    <tr className="border-b border-[#E2E8F0] bg-[#F8FAFC]">
                      <th className="px-4 py-2 text-left text-xs font-medium text-[#64748B]">Mês/Ano</th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-[#64748B]">Vencimento</th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-[#64748B]">Status</th>
                      <th className="px-4 py-2 text-right text-xs font-medium text-[#64748B]">Valor</th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-[#64748B]">Ação</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr className="border-b border-[#E2E8F0] last:border-0">
                      <td className="px-4 py-2 font-medium text-[#1E293B]">
                        {implantResult.month && implantResult.year
                          ? `${MONTH_NAMES[implantResult.month - 1]} ${implantResult.year}`
                          : "—"}
                      </td>
                      <td className="px-4 py-2 text-[#64748B]">{formatDate(implantResult.due_date ?? null)}</td>
                      <td className="px-4 py-2">
                        <span
                          className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                            implantResult.status === "PAID"
                              ? "bg-emerald-100 text-emerald-700"
                              : implantResult.status === "OPEN"
                                ? "bg-amber-100 text-amber-700"
                                : "bg-[#F1F5F9] text-[#64748B]"
                          }`}
                        >
                          {implantResult.status === "PAID"
                            ? "Pago"
                            : implantResult.status === "OPEN"
                              ? "Aberto"
                              : implantResult.status ?? "—"}
                        </span>
                      </td>
                      <td className="px-4 py-2 text-right font-medium text-[#1E293B]">
                        R$ {((implantResult.amount_cents ?? 0) / 100).toLocaleString("pt-BR")}
                      </td>
                      <td className="px-4 py-2">
                        <div className="flex items-center justify-end gap-2">
                          {implantResult.bank_slip_url && (
                            <button
                              type="button"
                              onClick={handleCopyImplantPaymentLink}
                              className="inline-flex items-center justify-center rounded-lg p-1 text-emerald-700 hover:bg-emerald-50 disabled:opacity-50 transition-colors"
                              title="Copiar link de pagamento"
                            >
                              <Copy className="h-4 w-4" />
                            </button>
                          )}
                          {(implantResult.pdf_signed_url || implantResult.bank_slip_url) && (
                            <a
                              href={implantResult.pdf_signed_url ?? (implantResult.bank_slip_url as string)}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center justify-center rounded-lg p-1 text-emerald-600 hover:bg-emerald-50"
                              title="Baixar / abrir PDF"
                            >
                              <FileDown className="h-4 w-4" />
                            </a>
                          )}
                        </div>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {implantCopyToast && <p className="text-xs text-emerald-700">{implantCopyToast}</p>}

          {implantResult.pix_emv && (
            <div className="rounded-lg border border-[#E2E8F0] bg-white p-4">
              <p className="text-xs font-medium text-[#64748B]">Pix (copia e cola)</p>
              <textarea
                readOnly
                value={implantResult.pix_emv}
                rows={4}
                className="mt-2 w-full rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] px-3 py-2 text-xs text-[#1E293B] font-mono"
              />
            </div>
          )}
        </div>
      )}
    </div>
  );

  const tabConfig = (
    <div className="space-y-6">
      <div>
        <div className="flex items-center gap-2 text-sm text-[#64748B]">
          <Building2 className="h-4 w-4" />
          <a
            href={`/${company.slug}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-emerald-600 hover:underline font-mono"
          >
            /{company.slug}
          </a>
        </div>
        <p className="mt-1 text-xs text-[#94A3B8]">Criada em {formatDate(company.created_at)}</p>
      </div>

      <div className="flex items-center justify-between rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] px-4 py-3">
        <div>
          <p className="text-sm font-medium text-[#1E293B]">Status da empresa</p>
          <p className="text-xs text-[#64748B]">Ativar ou desativar acesso à plataforma</p>
        </div>
        <div className="flex items-center gap-2">
          <span
            className={`px-2.5 py-1 rounded-full text-xs font-medium ${
              company.is_active ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700"
            }`}
          >
            {company.is_active ? "Ativa" : "Desativada"}
          </span>
          <button
            type="button"
            onClick={handleToggleActive}
            disabled={toggling}
            className={`flex items-center justify-center rounded-lg p-2 transition-colors ${
              company.is_active ? "text-amber-600 hover:bg-amber-50" : "text-emerald-600 hover:bg-emerald-50"
            } disabled:opacity-50`}
            title={company.is_active ? "Desativar" : "Ativar"}
          >
            {toggling ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : company.is_active ? (
              <PowerOff className="h-4 w-4" />
            ) : (
              <Power className="h-4 w-4" />
            )}
          </button>
        </div>
      </div>

      <div>
        <label className="flex items-center gap-2 text-sm font-medium text-[#1E293B]">
          <DollarSign className="h-4 w-4 text-[#64748B]" />
          Status de pagamento
        </label>
        <select
          value={billingStatus}
          onChange={(e) => setBillingStatus(e.target.value)}
          className="mt-2 w-full rounded-lg border border-[#E2E8F0] bg-white px-3 py-2 text-sm text-[#1E293B] focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
        >
          {Object.entries(BILLING_LABELS).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="block text-sm font-medium text-[#1E293B]">Plano / Mensalidade</label>
        <select
          value={billingPlan}
          onChange={(e) => setBillingPlan(e.target.value)}
          className="mt-2 w-full rounded-lg border border-[#E2E8F0] bg-white px-3 py-2 text-sm text-[#1E293B] focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
        >
          <option value="basic">Basic — R$ 350/mês</option>
          <option value="plus">Plus — R$ 600/mês</option>
          <option value="extra">Extra — R$ 980/mês</option>
        </select>
      </div>

      <div>
        <label className="block text-sm font-medium text-[#1E293B]">Notas de pagamento</label>
        <textarea
          value={billingNotes}
          onChange={(e) => setBillingNotes(e.target.value)}
          placeholder="Observações sobre pagamento/mensalidade..."
          rows={4}
          className="mt-2 w-full rounded-lg border border-[#E2E8F0] bg-white px-3 py-2 text-sm text-[#1E293B] placeholder-[#94A3B8] focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 resize-none"
        />
      </div>

      {hasChanges && (
        <div className="flex justify-end pt-2">
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50 transition-colors"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Salvar alterações
          </button>
        </div>
      )}
    </div>
  );

  return (
    <SideOver open={open} onClose={onClose} title={company.name} width="780px">
      <div className="flex border-b border-[#E2E8F0]">
        <button
          type="button"
          onClick={() => setActiveTab("modulos")}
          className={`flex items-center gap-2 px-4 py-3 text-sm font-medium transition-colors ${
            activeTab === "modulos"
              ? "border-b-2 border-emerald-600 text-emerald-600"
              : "text-[#64748B] hover:text-[#1E293B]"
          }`}
        >
          <LayoutGrid className="h-4 w-4" />
          Módulos
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("config")}
          className={`flex items-center gap-2 px-4 py-3 text-sm font-medium transition-colors ${
            activeTab === "config"
              ? "border-b-2 border-emerald-600 text-emerald-600"
              : "text-[#64748B] hover:text-[#1E293B]"
          }`}
        >
          <Settings className="h-4 w-4" />
          Configurações
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("boletos")}
          className={`flex items-center gap-2 px-4 py-3 text-sm font-medium transition-colors ${
            activeTab === "boletos"
              ? "border-b-2 border-emerald-600 text-emerald-600"
              : "text-[#64748B] hover:text-[#1E293B]"
          }`}
        >
          <FileText className="h-4 w-4" />
          Boletos
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("implantacao")}
          className={`flex items-center gap-2 px-4 py-3 text-sm font-medium transition-colors ${
            activeTab === "implantacao"
              ? "border-b-2 border-emerald-600 text-emerald-600"
              : "text-[#64748B] hover:text-[#1E293B]"
          }`}
        >
          <ExternalLink className="h-4 w-4" />
          Implantação
        </button>
      </div>
      <div className="mt-4">
        {activeTab === "boletos"
          ? tabBoletos
          : activeTab === "implantacao"
            ? tabImplantacao
            : activeTab === "modulos"
              ? tabModulos
              : tabConfig}
      </div>
    </SideOver>
  );
}
