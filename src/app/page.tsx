"use client";

import { useState } from "react";
import Link from "next/link";
import { ClicVendLogo } from "@/components/ClicVendLogo";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowRight,
  MessageSquare,
  Users,
  Zap,
  Smartphone,
  Link2,
  ShieldCheck,
  UserPlus,
  Wifi,
  Headphones,
  Building2,
  Clock,
  X,
  KeyRound,
  Loader2,
  ExternalLink,
} from "lucide-react";

const fadeUp = {
  hidden: { opacity: 0, y: 32 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { duration: 0.5, delay: i * 0.1, ease: [0.25, 0.46, 0.45, 0.94] as const },
  }),
};

const stagger = {
  visible: { transition: { staggerChildren: 0.08 } },
};

const FEATURES = [
  {
    icon: MessageSquare,
    title: "Conversas centralizadas",
    desc: "Veja todas as conversas por fila, atribua atendentes e acompanhe o histórico em um só lugar.",
    gradient: "from-clicvend-green/20 to-clicvend-green/5",
    iconColor: "text-clicvend-green",
  },
  {
    icon: Users,
    title: "Filas e equipes",
    desc: "Organize por Vendas, Suporte ou setor. Defina filas e distribua as conversas entre a equipe.",
    gradient: "from-clicvend-green-dark/20 to-clicvend-green-dark/5",
    iconColor: "text-clicvend-green-dark",
  },
  {
    icon: Zap,
    title: "Respostas rápidas",
    desc: "Crie modelos de mensagem e responda em um clique para agilizar o atendimento.",
    gradient: "from-clicvend-green/20 to-clicvend-green-dark/5",
    iconColor: "text-clicvend-green",
  },
  {
    icon: Smartphone,
    title: "Multi-canais",
    desc: "Conecte mais de um número WhatsApp por empresa e gerencie tudo no mesmo painel.",
    gradient: "from-clicvend-green-dark/20 to-clicvend-green/5",
    iconColor: "text-clicvend-green-dark",
  },
  {
    icon: Link2,
    title: "Link por empresa",
    desc: "Cada empresa acessa apenas seu painel pelo próprio link. Dados isolados e seguros.",
    gradient: "from-clicvend-green/20 to-clicvend-green-dark/5",
    iconColor: "text-clicvend-green",
  },
  {
    icon: ShieldCheck,
    title: "Sem complicação",
    desc: "Cadastro com CNPJ, onboarding em etapas e painel pronto para conectar seu número.",
    gradient: "from-clicvend-green-dark/20 to-clicvend-green/5",
    iconColor: "text-clicvend-green-dark",
  },
];

const STEPS = [
  {
    icon: UserPlus,
    title: "Cadastre-se grátis",
    desc: "Informe o CNPJ da empresa, dados de acesso e endereço. Crie sua conta em minutos, sem cartão.",
  },
  {
    icon: Wifi,
    title: "Conecte seu WhatsApp",
    desc: "No painel, vá em Conexões e vincule seu número usando a API. Configure o webhook e pronto.",
  },
  {
    icon: Headphones,
    title: "Comece a atender",
    desc: "As conversas aparecem na fila. Atribua à equipe, responda e gerencie tudo em um só lugar.",
  },
];

const METRICS = [
  { icon: Building2, value: "Multi-empresa", label: "Cada negócio com seu link e dados isolados" },
  { icon: MessageSquare, value: "WhatsApp", label: "Canal que seu cliente já usa" },
  { icon: Users, value: "Filas", label: "Organize por setor ou equipe" },
  { icon: Clock, value: "24/7", label: "Painel disponível quando precisar" },
];

function FloatingMockup() {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9, y: 20 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      transition={{ duration: 0.8, delay: 0.3, ease: [0.25, 0.46, 0.45, 0.94] }}
      className="relative hidden md:block"
    >
      <div className="absolute -inset-4 rounded-3xl bg-gradient-to-br from-clicvend-green/10 via-transparent to-clicvend-green-dark/10 blur-2xl" />
      <div className="relative rounded-2xl border border-[#E2E8F0] bg-white p-5 shadow-2xl shadow-clicvend-green/10">
        <div className="mb-3 flex items-center gap-2 border-b border-[#F1F5F9] pb-3">
          <div className="h-3 w-3 rounded-full bg-[#EF4444]" />
          <div className="h-3 w-3 rounded-full bg-[#F59E0B]" />
          <div className="h-3 w-3 rounded-full bg-clicvend-green" />
          <span className="ml-2 text-xs font-medium text-[#94A3B8]">ClicVend - Conversas</span>
        </div>
        <div className="flex gap-3">
          <div className="w-32 space-y-2">
            {[
              { name: "João Silva", active: true },
              { name: "Maria Santos", active: false },
              { name: "Pedro Lima", active: false },
            ].map((c, i) => (
              <motion.div
                key={c.name}
                initial={{ opacity: 0, x: -12 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.6 + i * 0.15 }}
                className={`flex items-center gap-2 rounded-lg p-2 ${c.active ? "bg-clicvend-green/5" : "hover:bg-slate-50"}`}
              >
                <div className={`h-7 w-7 shrink-0 rounded-full ${c.active ? "bg-gradient-to-br from-clicvend-green to-clicvend-green-dark" : "bg-slate-200"}`} />
                <div className="min-w-0 flex-1">
                  <div className={`h-1.5 w-full rounded ${c.active ? "bg-clicvend-green/40" : "bg-slate-200"}`} />
                  <div className={`mt-1 h-1 w-2/3 rounded ${c.active ? "bg-clicvend-green/20" : "bg-slate-100"}`} />
                </div>
              </motion.div>
            ))}
          </div>
          <div className="flex-1 space-y-2">
            {[
              { dir: "in", w: "w-3/4", delay: 0.8 },
              { dir: "out", w: "w-2/3", delay: 1.0 },
              { dir: "in", w: "w-1/2", delay: 1.2 },
            ].map((m, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: m.delay }}
                className={`flex ${m.dir === "out" ? "justify-end" : "justify-start"}`}
              >
                <div
                  className={`${m.w} rounded-lg px-3 py-2 ${
                    m.dir === "out"
                      ? "bg-gradient-to-r from-emerald-100 to-emerald-50"
                      : "border border-slate-100 bg-white"
                  }`}
                >
                  <div className="h-1.5 w-full rounded bg-slate-200" />
                  <div className="mt-1 h-1 w-1/2 rounded bg-slate-100" />
                </div>
              </motion.div>
            ))}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 1.5 }}
              className="flex items-center gap-2 rounded-lg border border-slate-100 bg-slate-50 p-2"
            >
              <div className="h-1.5 flex-1 rounded bg-slate-200" />
              <div className="h-6 w-6 rounded-md bg-clicvend-green" />
            </motion.div>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

export default function HomePage() {
  const [modal, setModal] = useState<"termos" | "privacidade" | "pedir-acesso" | null>(null);
  const [pedirCnpj, setPedirCnpj] = useState("");
  const [pedirLoading, setPedirLoading] = useState(false);
  const [pedirResult, setPedirResult] = useState<{ slug: string; name?: string } | null>(null);
  const [pedirError, setPedirError] = useState<string | null>(null);

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
    <main className="min-h-screen bg-[#F8FAFC]">
      {/* Header */}
      <motion.header
        initial={{ opacity: 0, y: -16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="sticky top-0 z-50 border-b border-[#E2E8F0]/60 bg-white/80 backdrop-blur-xl"
      >
        <div className="mx-auto flex w-[90%] max-w-6xl items-center justify-between py-3.5">
          <Link href="/" className="rounded focus:outline-none focus:ring-2 focus:ring-clicvend-green focus:ring-offset-2">
            <ClicVendLogo size="lg" />
          </Link>
          <nav className="flex items-center gap-2 sm:gap-3">
            <button
              type="button"
              onClick={() => setModal("pedir-acesso")}
              className="group inline-flex items-center gap-1.5 rounded-lg border border-[#E2E8F0] bg-white px-4 py-2 text-sm font-medium text-clicvend-green transition-all hover:border-clicvend-green/40 hover:bg-clicvend-green/5"
            >
              <KeyRound className="h-4 w-4" />
              <span>Meu acesso</span>
            </button>
            <Link
              href="/onboarding"
              className="group inline-flex items-center gap-1.5 rounded-lg bg-clicvend-green px-4 py-2 text-sm font-semibold text-white shadow-md shadow-clicvend-green/25 transition-all hover:bg-clicvend-green-dark hover:shadow-lg hover:shadow-clicvend-green-dark/30 active:scale-[0.98]"
            >
              <span>Cadastre-se</span>
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
            </Link>
          </nav>
        </div>
      </motion.header>

      {/* Hero */}
      <section className="relative overflow-hidden py-20 md:py-28">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_50%_at_50%_-20%,rgba(0,167,143,0.08),transparent)]" />
        <div className="relative mx-auto w-[90%] max-w-6xl">
          <div className="grid items-center gap-12 md:grid-cols-2 md:gap-16">
            <div>
              <motion.div
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5 }}
                className="inline-flex items-center gap-2 rounded-full border border-clicvend-green/30 bg-clicvend-green/5 px-3.5 py-1.5 text-xs font-semibold text-clicvend-green-dark shadow-sm"
              >
                <span className="relative flex h-2 w-2">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-clicvend-orange opacity-75" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-clicvend-green" />
                </span>
                Atendimento WhatsApp integrado
              </motion.div>

              <motion.h1
                initial={{ opacity: 0, y: 24 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, delay: 0.1 }}
                className="mt-6 text-4xl font-extrabold tracking-tight text-[#0F172A] md:text-5xl lg:text-[3.5rem] lg:leading-[1.1]"
              >
                Atendimento WhatsApp{" "}
                <span className="bg-gradient-to-r from-clicvend-orange to-clicvend-orange-dark bg-clip-text text-transparent">
                  em um só lugar
                </span>
              </motion.h1>

              <motion.p
                initial={{ opacity: 0, y: 24 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, delay: 0.2 }}
                className="mt-5 text-lg leading-relaxed text-[#64748B] md:text-xl"
              >
                Conecte seu negócio, gerencie conversas e filas com eficiência.
                Multi-empresas, canais e respostas rápidas.
              </motion.p>

              <motion.div
                initial={{ opacity: 0, y: 24 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, delay: 0.3 }}
                className="mt-8 flex flex-wrap items-center gap-3"
              >
                <div className="flex flex-wrap items-center gap-3">
                  <button
                    type="button"
                    onClick={() => setModal("pedir-acesso")}
                    className="group inline-flex items-center gap-2 rounded-xl border-2 border-clicvend-green px-6 py-3.5 text-base font-semibold text-clicvend-green transition-all hover:bg-clicvend-green/5"
                  >
                    <KeyRound className="h-5 w-5" />
                    <span>Meu acesso</span>
                  </button>
                  <Link
                    href="/onboarding"
                    className="group inline-flex items-center gap-2 rounded-xl bg-[#0a0a0a] px-6 py-3.5 text-base font-semibold text-white shadow-lg shadow-black/25 transition-all hover:bg-[#1a1a1a] hover:shadow-xl active:scale-[0.98]"
                  >
                    <span>Cadastre-se grátis</span>
                    <ArrowRight className="h-5 w-5 transition-transform group-hover:translate-x-1" />
                  </Link>
                </div>
              </motion.div>

              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.6, delay: 0.5 }}
                className="mt-10 flex flex-wrap gap-5"
              >
                {[
                  { icon: MessageSquare, label: "Multi-canais" },
                  { icon: Users, label: "Filas e equipes" },
                  { icon: Zap, label: "Respostas rápidas" },
                ].map(({ icon: Icon, label }) => (
                  <div key={label} className="flex items-center gap-2.5 text-[#64748B]">
                    <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-slate-100 to-slate-50 shadow-sm">
                      <Icon className="h-4 w-4 text-clicvend-green" />
                    </span>
                    <span className="text-sm font-medium">{label}</span>
                  </div>
                ))}
              </motion.div>
            </div>

            <FloatingMockup />
          </div>
        </div>
      </section>

      {/* Funcionalidades */}
      <section className="border-t border-[#E2E8F0]/60 bg-white py-20 md:py-24">
        <div className="mx-auto w-[90%] max-w-6xl">
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: "-80px" }}
            variants={fadeUp}
            custom={0}
            className="text-center"
          >
            <h2 className="text-3xl font-extrabold text-[#0F172A] md:text-4xl">
              Funcionalidades para o seu atendimento
            </h2>
            <p className="mt-3 text-lg text-[#64748B]">
              Tudo que você precisa para centralizar e escalar o atendimento pelo WhatsApp.
            </p>
          </motion.div>

          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: "-60px" }}
            variants={stagger}
            className="mt-14 grid gap-5 sm:grid-cols-2 lg:grid-cols-3"
          >
            {FEATURES.map(({ icon: Icon, title, desc, gradient, iconColor }, i) => (
              <motion.div
                key={title}
                variants={fadeUp}
                custom={i}
                className="group relative overflow-hidden rounded-2xl border border-[#E2E8F0] bg-white p-6 transition-all hover:border-clicvend-green/30 hover:shadow-lg hover:shadow-clicvend-green/5"
              >
                <div className={`absolute inset-0 bg-gradient-to-br ${gradient} opacity-0 transition-opacity group-hover:opacity-100`} />
                <div className="relative">
                  <span className={`inline-flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br ${gradient} ${iconColor}`}>
                    <Icon className="h-6 w-6" />
                  </span>
                  <h3 className="mt-4 text-lg font-bold text-[#0F172A]">{title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-[#64748B]">{desc}</p>
                </div>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* Como funciona */}
      <section className="border-t border-[#E2E8F0]/60 bg-gradient-to-b from-[#F8FAFC] to-white py-20 md:py-24">
        <div className="mx-auto w-[90%] max-w-6xl">
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: "-80px" }}
            variants={fadeUp}
            custom={0}
            className="text-center"
          >
            <h2 className="text-3xl font-extrabold text-[#0F172A] md:text-4xl">
              Como funciona
            </h2>
            <p className="mt-3 text-lg text-[#64748B]">
              Em poucos passos você começa a atender pelo WhatsApp.
            </p>
          </motion.div>

          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: "-60px" }}
            variants={stagger}
            className="mt-14 grid gap-8 md:grid-cols-3"
          >
            {STEPS.map(({ icon: Icon, title, desc }, i) => (
              <motion.div key={title} variants={fadeUp} custom={i} className="relative text-center">
                {i < STEPS.length - 1 && (
                  <div className="absolute left-1/2 top-8 hidden h-px w-full bg-gradient-to-r from-clicvend-green/20 to-transparent md:block" />
                )}
                <div className="relative mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-clicvend-green to-clicvend-green-dark text-white shadow-lg shadow-clicvend-green/30">
                  <Icon className="h-7 w-7" />
                  <span className="absolute -right-1 -top-1 flex h-6 w-6 items-center justify-center rounded-full bg-white text-xs font-bold text-clicvend-green-dark shadow">
                    {i + 1}
                  </span>
                </div>
                <h3 className="mt-5 text-lg font-bold text-[#0F172A]">{title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-[#64748B]">{desc}</p>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* Métricas */}
      <motion.section
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true, margin: "-60px" }}
        variants={stagger}
        className="bg-[#0a0a0a] py-14 md:py-20"
      >
        <div className="mx-auto w-[90%] max-w-6xl">
          <div className="grid grid-cols-2 gap-8 md:grid-cols-4 md:gap-12">
            {METRICS.map(({ icon: Icon, value, label }, i) => (
              <motion.div key={value} variants={fadeUp} custom={i} className="text-center">
                <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-clicvend-green">
                  <Icon className="h-6 w-6 text-white" />
                </div>
                <p className="text-2xl font-extrabold text-white md:text-3xl">{value}</p>
                <p className="mt-1 text-sm text-[#94A3B8]">{label}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </motion.section>

      {/* Footer fixo */}
      <footer className="fixed bottom-0 left-0 right-0 z-40 border-t border-[#E2E8F0]/60 bg-white/90 backdrop-blur-xl">
        <div className="mx-auto flex w-[90%] max-w-6xl flex-wrap items-center justify-center gap-2 py-3.5 text-center text-sm text-[#64748B]">
          <span>ClicVend &copy; 2026</span>
          <span className="text-[#CBD5E1]">|</span>
          <button type="button" onClick={() => setModal("termos")} className="transition-colors hover:text-clicvend-green">
            Termos de uso
          </button>
          <span className="text-[#CBD5E1]">|</span>
          <button type="button" onClick={() => setModal("privacidade")} className="transition-colors hover:text-clicvend-green">
            Política de Privacidade
          </button>
        </div>
      </footer>

      {/* Espaço para o footer fixo */}
      <div className="h-14 flex-shrink-0" />

      {/* Modal Termos de uso */}
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
              transition={{ duration: 0.2 }}
              className="relative max-h-[85vh] w-full max-w-2xl overflow-hidden rounded-2xl border border-[#E2E8F0] bg-white shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="sticky top-0 flex items-center justify-between border-b border-[#E2E8F0] bg-white px-6 py-4">
                <h2 className="text-lg font-bold text-[#0F172A]">Termos de uso</h2>
                <button
                  type="button"
                  onClick={() => setModal(null)}
                  className="rounded-lg p-2 text-[#64748B] transition-colors hover:bg-[#F1F5F9] hover:text-[#0F172A]"
                  aria-label="Fechar"
                >
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
              transition={{ duration: 0.2 }}
              className="relative w-full max-w-md overflow-hidden rounded-2xl border border-[#E2E8F0] bg-white p-6 shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-lg font-bold text-[#0F172A]">Meu acesso</h2>
                <button
                  type="button"
                  onClick={closePedirModal}
                  className="rounded-lg p-2 text-[#64748B] transition-colors hover:bg-[#F1F5F9] hover:text-[#0F172A]"
                  aria-label="Fechar"
                >
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
                    className="mb-3 w-full rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] px-4 py-3 text-[#0a0a0a] placeholder-[#94A3B8] focus:border-clicvend-green focus:outline-none focus:ring-2 focus:ring-clicvend-green/20"
                  />
                  {pedirError && (
                    <p className="mb-3 text-sm text-[#DC2626]">{pedirError}</p>
                  )}
                  <button
                    type="button"
                    onClick={handlePedirAcesso}
                    disabled={pedirLoading || pedirCnpj.replace(/\D/g, "").length !== 14}
                    className="w-full rounded-xl bg-clicvend-green px-4 py-3 font-semibold text-white transition-colors hover:bg-clicvend-green-dark disabled:cursor-not-allowed disabled:opacity-50"
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
                  {pedirResult.name && (
                    <p className="text-sm font-medium text-[#0F172A]">{pedirResult.name}</p>
                  )}
                  <div className="rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] p-3">
                    <p className="mb-1 text-xs text-[#64748B]">Link do seu painel</p>
                    <p className="break-all font-mono text-sm font-medium text-clicvend-green">
                      {typeof window !== "undefined" ? `${window.location.origin}/${pedirResult.slug}` : `/${pedirResult.slug}`}
                    </p>
                  </div>
                  <a
                    href={typeof window !== "undefined" ? `${window.location.origin}/${pedirResult.slug}` : `/${pedirResult.slug}`}
                    className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#0a0a0a] px-4 py-3 font-semibold text-white transition-colors hover:bg-[#1a1a1a]"
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
                    className="w-full text-sm text-[#64748B] hover:text-clicvend-green"
                  >
                    Consultar outro CNPJ
                  </button>
                </div>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Modal Política de Privacidade */}
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
              transition={{ duration: 0.2 }}
              className="relative max-h-[85vh] w-full max-w-2xl overflow-hidden rounded-2xl border border-[#E2E8F0] bg-white shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="sticky top-0 flex items-center justify-between border-b border-[#E2E8F0] bg-white px-6 py-4">
                <h2 className="text-lg font-bold text-[#0F172A]">Política de Privacidade</h2>
                <button
                  type="button"
                  onClick={() => setModal(null)}
                  className="rounded-lg p-2 text-[#64748B] transition-colors hover:bg-[#F1F5F9] hover:text-[#0F172A]"
                  aria-label="Fechar"
                >
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
