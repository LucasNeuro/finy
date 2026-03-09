"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { LandingHeader } from "@/components/landing/LandingHeader";
import { LandingFooter } from "@/components/landing/LandingFooter";
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
    title: "Conversas centralizadas",
    desc: "Veja todas as conversas por fila, atribua atendentes e acompanhe o histórico em um só lugar.",
    icon: MessageSquare,
  },
  {
    title: "Filas e equipes",
    desc: "Organize por Vendas, Suporte ou setor. Defina filas e distribua as conversas entre a equipe.",
    icon: Inbox,
  },
  {
    title: "Respostas rápidas",
    desc: "Crie modelos de mensagem e responda em um clique para agilizar o atendimento.",
    icon: Zap,
  },
  {
    title: "Multi-canais",
    desc: "Conecte mais de um número WhatsApp por empresa e gerencie tudo no mesmo painel.",
    icon: Plug,
  },
  {
    title: "Contatos e grupos",
    desc: "Sincronize contatos do WhatsApp, gerencie grupos e comunidades. Exporte em CSV.",
    icon: Users,
  },
  {
    title: "Tickets",
    desc: "Quadro Kanban por status. Atribua, reatribua e acompanhe o andamento dos atendimentos.",
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
    <main className="min-h-screen bg-white">
      <LandingHeader onPedirAcesso={() => setModal("pedir-acesso")} />

      {/* Hero - Menos verde, fundo neutro */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-[#1E293B] via-[#0F172A] to-[#020617]" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_50%_at_50%_-20%,rgba(52,176,151,0.08),transparent)]" />
        <div className="relative mx-auto w-[92%] max-w-6xl px-4 py-20 md:py-28">
          <div className="mx-auto max-w-2xl text-center">
            <motion.h1
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6 }}
              className="font-display text-4xl font-bold tracking-tight text-white md:text-5xl lg:text-6xl"
            >
              Todos os seus números de WhatsApp em um único lugar
            </motion.h1>
            <motion.p
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.1 }}
              className="mt-6 font-display text-lg leading-relaxed text-white/90 md:text-xl"
            >
              Gerenciamento total. Centralize conversas, filas e equipes em um só painel. Atendimento profissional pelo canal que seu cliente já usa.
            </motion.p>
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.2 }}
              className="mt-10"
            >
              <Link
                href="/onboarding"
                className="inline-flex items-center gap-2 rounded-full bg-white px-8 py-4 text-base font-semibold text-[#1E293B] shadow-lg transition-all hover:bg-white/95 hover:shadow-xl"
              >
                <span className="font-display">Gerenciamento total</span>
                <ChevronRight className="h-5 w-5 shrink-0" />
              </Link>
            </motion.div>
          </div>
        </div>
      </section>

      {/* Action Chips */}
      <section className="border-b border-[#E2E8F0] bg-white py-12">
        <div className="mx-auto w-[92%] max-w-6xl">
          <div className="flex flex-wrap justify-center gap-3">
            {ACTION_CHIPS.map((chip) => (
              <button
                key={chip.label}
                type="button"
                className="inline-flex items-center gap-2 rounded-full border border-[#C8E6C9] bg-[#E8F5E9] px-4 py-2.5 text-sm font-medium text-[#1E293B] transition-colors hover:border-[#A5D6A7] hover:bg-[#C8E6C9]"
              >
                <span>{chip.icon}</span>
                <span>{chip.label}</span>
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* O que você pode fazer */}
      <section className="bg-white py-20">
        <div className="mx-auto w-[92%] max-w-6xl">
          <h2 className="mb-12 text-center text-3xl font-bold text-[#1E293B] md:text-4xl">
            O que você pode fazer com ClicVend hoje
          </h2>
          <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURE_CARDS.map(({ title, desc, icon: Icon }) => (
              <div
                key={title}
                className="overflow-hidden rounded-2xl border border-[#E2E8F0] bg-white shadow-lg shadow-[#E2E8F0]/30 transition-shadow hover:shadow-xl"
              >
                <div className="border-b border-[#E2E8F0] bg-[#F8FAFC] p-6">
                  <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-[#E8F5E9]">
                    <Icon className="h-7 w-7 text-[#34B097]" />
                  </div>
                </div>
                <div className="p-6">
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
              IA para expandir seus atendimentos e vendas. Desafogue suas equipes com líderes de mercado embarcados na nossa solução AI.
            </h3>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-12">
            <img
              src={LOGO_MISTRAL}
              alt="Mistral AI"
              className="h-24 w-auto object-contain rounded-[20%] md:h-28"
            />
            <img
              src={LOGO_GOOGLE}
              alt="Google AI"
              className="h-24 w-auto object-contain rounded-[20%] md:h-28"
            />
          </div>
        </div>
      </section>

      {/* Newsletter */}
      <section className="border-t border-[#E2E8F0] bg-white py-20">
        <div className="mx-auto w-[92%] max-w-xl text-center">
          <h2 className="text-2xl font-bold text-[#1E293B]">Assine nossa newsletter</h2>
          <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-center">
            <input
              type="email"
              placeholder="Seu email aqui..."
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="rounded-xl border border-[#E2E8F0] bg-white px-5 py-3.5 text-[#1E293B] placeholder-[#94A3B8] focus:border-[#34B097] focus:outline-none focus:ring-2 focus:ring-[#34B097]/20 sm:min-w-[280px]"
            />
            <button
              type="button"
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
                  Ao utilizar o ClicVend, você concorda com estes Termos de Uso. O serviço destina-se a empresas e profissionais que desejam centralizar o atendimento via WhatsApp.
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
                  O ClicVend respeita sua privacidade e está em conformidade com a Lei Geral de Proteção de Dados (LGPD). Esta política descreve como coletamos, usamos e protegemos suas informações.
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
