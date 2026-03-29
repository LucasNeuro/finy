"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { LandingHeader } from "@/components/landing/LandingHeader";
import { LandingFooter } from "@/components/landing/LandingFooter";
import { BRAND_NAME } from "@/lib/brand";
import { motion, AnimatePresence } from "framer-motion";
import {
  MessageSquare,
  Zap,
  Plug,
  Users,
  Ticket,
  Inbox,
  X,
  Loader2,
  ExternalLink,
  ChevronRight,
} from "lucide-react";

const ACTION_CHIPS = [
  { icon: "💊", label: "Lembrar minha mãe de tomar as vitaminas" },
  { icon: "⏳", label: "Programar uma mensagem de WhatsApp" },
  { icon: "🔔", label: "Me lembrar de alongar" },
  { icon: "🎤", label: "Transcrever um áudio" },
  { icon: "📋", label: "Lembrar lista de compras" },
  { icon: "🔍", label: "Melhores séries de crime" },
  { icon: "🎁", label: "Sugerir um presente especial" },
  { icon: "🍽️", label: "Informação nutricional do meu prato" },
  { icon: "🎤", label: "Converter um áudio em texto" },
  { icon: "👤", label: "Lembrar meu colega do PDF" },
  { icon: "📌", label: "Enviar um lembrete para um colega" },
  { icon: "🎉", label: "Me lembrar da festa sexta" },
  { icon: "✍️", label: "Escrever uma mensagem em inglês" },
  { icon: "🔌", label: "Me lembrar de levar o carregador" },
  { icon: "📅", label: "Agendar um compromisso" },
];

const LOGO_GOOGLE = "https://xrzhxzmcleacacitbjqn.supabase.co/storage/v1/object/public/logo_landing-llm/Google_AI.png";
const LOGO_MISTRAL = "https://xrzhxzmcleacacitbjqn.supabase.co/storage/v1/object/public/logo_landing-llm/mistral-ai-20252037.logowik.com.webp";

const FEATURE_CARDS = [
  {
    title: "Centralização de Conversas",
    desc: "Gerencie todas as conversas em um único painel, com histórico completo e atribuição inteligente de atendentes.",
    icon: MessageSquare,
  },
  {
    title: "Filas Inteligentes",
    desc: "Organize por departamentos (Vendas, Suporte) com distribuição automática entre sua equipe.",
    icon: Inbox,
  },
  {
    title: "Respostas Rápidas",
    desc: "Biblioteca de modelos prontos para responder em um clique e aumentar a produtividade.",
    icon: Zap,
  },
  {
    title: "Multi-Canais",
    desc: "Conecte múltiplos números WhatsApp e gerencie tudo de forma unificada e organizada.",
    icon: Plug,
  },
  {
    title: "Gestão de Contatos",
    desc: "Sincronize e organize contatos, grupos e comunidades com exportação completa em CSV.",
    icon: Users,
  },
  {
    title: "Sistema de Tickets",
    desc: "Quadro Kanban com status personalizáveis para acompanhamento detalhado de cada atendimento.",
    icon: Ticket,
  },
];

export default function HomePage() {
  const [modal, setModal] = useState<"termos" | "privacidade" | "pedir-acesso" | null>(null);
  const [pedirCnpj, setPedirCnpj] = useState("");
  const [pedirLoading, setPedirLoading] = useState(false);
  const [pedirResult, setPedirResult] = useState<{ slug: string; name?: string } | null>(null);
  const [pedirError, setPedirError] = useState<string | null>(null);
  const [email, setEmail] = useState("");

  useEffect(() => {
    const hash = typeof window !== "undefined" ? window.location.hash.slice(1) : "";
    if (hash === "termos") setModal("termos");
    if (hash === "privacidade") setModal("privacidade");
  }, []);

  const handlePedirAcesso = async () => {
    const cnpj = pedirCnpj.replace(/\D/g, "");
    if (cnpj.length !== 14) {
      setPedirError("Informe um CNPJ válido (14 dígitos).");
      return;
    }
    setPedirError(null);
    setPedirResult(null);
    setPedirLoading(true);
    try {
      const res = await fetch(`/api/lookup-company?cnpj=${encodeURIComponent(cnpj)}`);
      const data = await res.json();
      if (!res.ok) {
        setPedirError(data?.error ?? "Empresa não encontrada.");
        return;
      }
      setPedirResult({ slug: data.slug, name: data.name });
    } catch {
      setPedirError("Erro ao buscar. Tente novamente.");
    } finally {
      setPedirLoading(false);
    }
  };

  const closePedirModal = () => {
    setModal(null);
    setPedirCnpj("");
    setPedirResult(null);
    setPedirError(null);
  };

  return (
    <main className="min-h-screen bg-white flex flex-col">
      <LandingHeader onPedirAcesso={() => setModal("pedir-acesso")} />

      {/* Hero - Menos verde, fundo neutro */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-[#1E293B] via-[#0F172A] to-[#020617]" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_50%_at_50%_-20%,rgba(52,176,151,0.08),transparent)]" />
        <div className="relative mx-auto w-[92%] max-w-6xl px-4 py-20 md:py-28">
          <div className="mx-auto max-w-2xl text-center">
            <motion.h1
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4 }}
              className="font-display text-4xl font-bold tracking-tight text-white md:text-5xl lg:text-6xl"
            >
              Centralize todos os seus WhatsApp em um único painel
            </motion.h1>
            <motion.p
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: 0.1 }}
              className="mt-6 font-display text-lg leading-relaxed text-white/90 md:text-xl"
            >
              Gerencie múltiplos números, equipes e conversas do WhatsApp em uma plataforma única. Atendimento profissional escalável para sua empresa.
            </motion.p>
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: 0.2 }}
              className="mt-10 flex flex-col gap-4 sm:flex-row sm:justify-center"
            >
              <Link
                href="/onboarding"
                className="inline-flex items-center justify-center gap-2 rounded-full bg-gradient-to-r from-[#34B097] to-[#2D9B85] px-8 py-4 text-base font-semibold text-white shadow-lg transition-all hover:from-[#2D9B85] hover:to-[#268571] hover:shadow-xl hover:shadow-[#34B097]/25"
              >
                <span className="font-display">Começar gratuitamente</span>
                <ChevronRight className="h-5 w-5 shrink-0" />
              </Link>
              <button
                onClick={() => setModal("pedir-acesso")}
                className="inline-flex items-center justify-center gap-2 rounded-full border-2 border-white px-8 py-4 text-base font-semibold text-white transition-all hover:bg-white/10"
              >
                <span className="font-display">Já tenho acesso</span>
              </button>
            </motion.div>
          </div>
        </div>
      </section>

      {/* Action Chips - Melhor responsividade */}
      <section className="border-b border-[#E2E8F0] bg-white py-8 md:py-12">
        <div className="mx-auto w-[92%] max-w-6xl px-4">
          <div className="flex flex-wrap justify-center gap-2 md:gap-3">
            {ACTION_CHIPS.map((chip) => (
              <button
                key={chip.label}
                type="button"
                aria-label={chip.label}
                className="inline-flex items-center gap-1.5 rounded-full border border-[#C8E6C9] bg-[#E8F5E9] px-3 py-2 text-xs font-medium text-[#1E293B] transition-colors hover:border-[#A5D6A7] hover:bg-[#C8E6C9] md:gap-2 md:px-4 md:py-2.5 md:text-sm"
              >
                <span className="text-sm md:text-base" aria-hidden="true">{chip.icon}</span>
                <span className="truncate">{chip.label}</span>
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* O que você pode fazer */}
      <section className="bg-white py-20">
        <div className="mx-auto w-[92%] max-w-6xl">
          <h2 className="mb-12 text-center text-3xl font-bold text-[#1E293B] md:text-4xl">
            Recursos poderosos para transformar seu atendimento
          </h2>
          <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURE_CARDS.map(({ title, desc }) => (
              <div
                key={title}
                className="flex h-full flex-col overflow-hidden rounded-3xl border border-[#E2E8F0] bg-white shadow-lg shadow-[#E2E8F0]/40 transition-all hover:-translate-y-1 hover:shadow-2xl"
              >
                <div className="relative bg-[#F1F5F9] px-6 pt-6 pb-4">
                  <div className="absolute inset-x-10 top-4 h-2 rounded-full bg-gradient-to-r from-[#22C55E]/30 via-[#34B097]/40 to-[#22C55E]/30 blur" />
                  <div className="relative mx-auto max-w-xs rounded-2xl border border-[#E2E8F0] bg-white/95 p-3 shadow-sm">
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-[#22C55E] text-xs font-semibold text-white">
                          WA
                        </span>
                        <div className="text-xs">
                          <p className="font-semibold text-[#0F172A]">WhatsApp</p>
                          <p className="text-[10px] text-[#64748B]">Conectado ao {BRAND_NAME}</p>
                        </div>
                      </div>
                      <span className="rounded-full bg-[#E5F3FF] px-2 py-0.5 text-[10px] font-medium text-[#0369A1]">
                        Automação ativa
                      </span>
                    </div>
                    <div className="space-y-1.5 text-[11px] leading-snug">
                      <div className="inline-flex max-w-[80%] flex-col rounded-2xl bg-[#E5E7EB] px-3 py-1.5 text-[#111827]">
                        <span>Não esqueça os documentos ✉️</span>
                        <span className="mt-0.5 self-end text-[9px] text-[#6B7280]">17:45</span>
                      </div>
                      <div className="flex justify-end">
                        <div className="inline-flex max-w-[80%] flex-col rounded-2xl bg-[#DCFCE7] px-3 py-1.5 text-[#065F46]">
                          <span>Obrigada por me lembrar! ✅</span>
                          <span className="mt-0.5 self-end text-[9px] text-[#16A34A]">17:46</span>
                        </div>
                      </div>
                      <p className="pt-1 text-[10px] text-[#94A3B8]">
                        Mensagem enviada automaticamente pelo {BRAND_NAME}.
                      </p>
                    </div>
                  </div>
                </div>
                <div className="flex flex-1 flex-col p-6">
                  <h3 className="text-lg font-bold text-[#1E293B]">{title}</h3>
                  <p className="mt-3 text-sm leading-relaxed text-[#64748B]">{desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Parceiros / Destaque - card só com texto, logos na faixa cinza, finco na cor do hero */}
      <section className="relative border-t-4 border-t-[#1E293B] bg-[#F8FAFC] py-16">
        <div className="mx-auto w-[92%] max-w-4xl space-y-10">
          <div className="overflow-hidden rounded-2xl border border-[#E2E8F0] bg-white p-8 shadow-lg">
            <h3 className="text-xl font-bold text-[#1E293B] md:text-2xl">
              Inteligência Artificial para potencializar seus resultados
            </h3>
            <p className="mt-4 text-[#64748B] leading-relaxed">
              Tecnologia de ponta das principais plataformas de IA integrada para automatizar atendimentos, 
              gerar respostas inteligentes e aumentar a eficiência da sua equipe.
            </p>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-12">
            <img
              src={LOGO_MISTRAL}
              alt="Mistral AI"
              width={112}
              height={112}
              loading="lazy"
              className="h-20 w-auto object-contain rounded-lg md:h-28"
            />
            <img
              src={LOGO_GOOGLE}
              alt="Google AI"
              width={112}
              height={112}
              loading="lazy"
              className="h-20 w-auto object-contain rounded-lg md:h-28"
            />
          </div>
        </div>
      </section>

      {/* Newsletter */}
      <section className="border-t border-[#E2E8F0] bg-white py-20 pb-24">
        <div className="mx-auto w-[92%] max-w-xl text-center">
          <h2 className="text-2xl font-bold text-[#1E293B]">Assine nossa newsletter</h2>
          <p className="mt-2 text-[#64748B]">Receba novidades e dicas para melhorar seu atendimento</p>
          <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-center">
            <input
              type="email"
              placeholder="Seu email aqui..."
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              aria-label="Email para newsletter"
              className="rounded-xl border border-[#E2E8F0] bg-white px-5 py-3.5 text-[#1E293B] placeholder-[#94A3B8] focus:border-[#34B097] focus:outline-none focus:ring-2 focus:ring-[#34B097]/20 sm:min-w-[280px]"
            />
            <button
              type="button"
              aria-label="Assinar newsletter"
              className="rounded-xl bg-gradient-to-r from-[#34B097] to-[#2D9B85] px-8 py-3.5 font-semibold text-white shadow-md transition-all hover:shadow-lg"
            >
              Assinar
            </button>
          </div>
        </div>
      </section>

      <LandingFooter onTermos={() => setModal("termos")} onPrivacidade={() => setModal("privacidade")} />

      {/* Modal Termos */}
      <AnimatePresence>
        {modal === "termos" && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
            onClick={() => setModal(null)}
          >
            <div className="absolute inset-0 bg-[#0F172A]/60 backdrop-blur-sm" />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative max-h-[85vh] w-full max-w-2xl overflow-hidden rounded-2xl border border-[#E2E8F0] bg-white shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between border-b border-[#E2E8F0] px-6 py-4">
                <h2 className="text-lg font-bold text-[#0F172A]">Termos de uso</h2>
                <button type="button" onClick={() => setModal(null)} className="rounded-lg p-2 text-[#64748B] hover:bg-[#F1F5F9]">
                  <X className="h-5 w-5" />
                </button>
              </div>
              <div className="overflow-y-auto p-6 text-sm leading-relaxed text-[#0a0a0a]">
                <p className="mb-4">
                  Ao utilizar o {BRAND_NAME}, você concorda com estes Termos de Uso. O serviço destina-se a empresas e profissionais que desejam centralizar o atendimento via WhatsApp.
                </p>
                <h3 className="mb-2 font-semibold text-[#0F172A]">1. Uso do serviço</h3>
                <p className="mb-4">
                  Você é responsável por manter a confidencialidade de sua conta e por todas as atividades realizadas sob seu login. O uso deve estar em conformidade com as políticas do WhatsApp e da legislação aplicável.
                </p>
                <h3 className="mb-2 font-semibold text-[#0F172A]">2. Dados e privacidade</h3>
                <p className="mb-4">
                  O tratamento de dados pessoais é regido pela nossa Política de Privacidade. Ao cadastrar sua empresa e conectar canais, você garante que possui base legal para o processamento dos dados dos seus clientes.
                </p>
                <h3 className="mb-2 font-semibold text-[#0F172A]">3. Alterações</h3>
                <p>
                  Podemos atualizar estes termos periodicamente. O uso continuado do serviço após alterações constitui aceite das novas condições. Em caso de dúvidas, entre em contato conosco.
                </p>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Modal Meu acesso */}
      <AnimatePresence>
        {modal === "pedir-acesso" && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
            onClick={closePedirModal}
          >
            <div className="absolute inset-0 bg-[#0F172A]/60 backdrop-blur-sm" />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-md overflow-hidden rounded-2xl border border-[#E2E8F0] bg-white p-6 shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-lg font-bold text-[#0F172A]">Meu acesso</h2>
                <button type="button" onClick={closePedirModal} className="rounded-lg p-2 text-[#64748B] hover:bg-[#F1F5F9]">
                  <X className="h-5 w-5" />
                </button>
              </div>
              <p className="mb-4 text-sm text-[#64748B]">
                Informe o CNPJ da empresa cadastrada para acessar o link do seu painel.
              </p>
              {!pedirResult ? (
                <>
                  <input
                    type="text"
                    placeholder="00.000.000/0001-00"
                    value={pedirCnpj.length >= 14 ? pedirCnpj.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, "$1.$2.$3/$4-$5") : pedirCnpj}
                    onChange={(e) => {
                      const digits = e.target.value.replace(/\D/g, "").slice(0, 14);
                      setPedirCnpj(digits);
                      setPedirError(null);
                    }}
                    onKeyDown={(e) => e.key === "Enter" && handlePedirAcesso()}
                    className="mb-3 w-full rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] px-4 py-3 text-[#0a0a0a] placeholder-[#94A3B8] focus:border-[#34B097] focus:outline-none focus:ring-2 focus:ring-[#34B097]/20"
                  />
                  {pedirError && <p className="mb-3 text-sm text-[#DC2626]">{pedirError}</p>}
                  <button
                    type="button"
                    onClick={handlePedirAcesso}
                    disabled={pedirLoading || pedirCnpj.replace(/\D/g, "").length !== 14}
                    className="w-full rounded-xl bg-[#34B097] px-4 py-3 font-semibold text-white transition-colors hover:bg-[#2D9B85] disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {pedirLoading ? (
                      <span className="inline-flex items-center gap-2">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Buscando…
                      </span>
                    ) : (
                      "Verificar CNPJ"
                    )}
                  </button>
                </>
              ) : (
                <div className="space-y-4">
                  {pedirResult.name && <p className="text-sm font-medium text-[#0F172A]">{pedirResult.name}</p>}
                  <div className="rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] p-3">
                    <p className="mb-1 text-xs text-[#64748B]">Link do seu painel</p>
                    <p className="break-all font-mono text-sm font-medium text-[#34B097]">
                      {typeof window !== "undefined" ? `${window.location.origin}/${pedirResult.slug}` : `/${pedirResult.slug}`}
                    </p>
                  </div>
                  <a
                    href={typeof window !== "undefined" ? `${window.location.origin}/${pedirResult.slug}` : `/${pedirResult.slug}`}
                    className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#1E293B] px-4 py-3 font-semibold text-white transition-colors hover:bg-[#0F172A]"
                  >
                    <ExternalLink className="h-4 w-4" />
                    Acessar meu painel
                  </a>
                  <button
                    type="button"
                    onClick={() => {
                      setPedirResult(null);
                      setPedirCnpj("");
                    }}
                    className="w-full text-sm text-[#64748B] hover:text-[#34B097]"
                  >
                    Consultar outro CNPJ
                  </button>
                </div>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Modal Privacidade */}
      <AnimatePresence>
        {modal === "privacidade" && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
            onClick={() => setModal(null)}
          >
            <div className="absolute inset-0 bg-[#0F172A]/60 backdrop-blur-sm" />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative max-h-[85vh] w-full max-w-2xl overflow-hidden rounded-2xl border border-[#E2E8F0] bg-white shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between border-b border-[#E2E8F0] px-6 py-4">
                <h2 className="text-lg font-bold text-[#0F172A]">Política de Privacidade</h2>
                <button type="button" onClick={() => setModal(null)} className="rounded-lg p-2 text-[#64748B] hover:bg-[#F1F5F9]">
                  <X className="h-5 w-5" />
                </button>
              </div>
              <div className="overflow-y-auto p-6 text-sm leading-relaxed text-[#0a0a0a]">
                <p className="mb-4">
                  O {BRAND_NAME} respeita sua privacidade e está em conformidade com a Lei Geral de Proteção de Dados (LGPD). Esta política descreve como coletamos, usamos e protegemos suas informações.
                </p>
                <h3 className="mb-2 font-semibold text-[#0F172A]">Dados que coletamos</h3>
                <p className="mb-4">
                  Coletamos dados de cadastro (e-mail, dados da empresa, endereço), dados de uso do painel e dados de conversas gerenciadas pela plataforma, conforme necessário para a prestação do serviço.
                </p>
                <h3 className="mb-2 font-semibold text-[#0F172A]">Finalidade</h3>
                <p className="mb-4">
                  Os dados são utilizados para operar o serviço, melhorar a experiência, cumprir obrigações legais e comunicar atualizações. Não vendemos seus dados a terceiros.
                </p>
                <h3 className="mb-2 font-semibold text-[#0F172A]">Segurança e seus direitos</h3>
                <p>
                  Adotamos medidas técnicas e organizacionais para proteger seus dados. Você pode acessar, corrigir ou solicitar a exclusão dos seus dados entrando em contato conosco.
                </p>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </main>
  );
}
