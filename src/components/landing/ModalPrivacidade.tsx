"use client";

import { BRAND_NAME } from "@/lib/brand";
import { motion } from "framer-motion";
import { X } from "lucide-react";

export function ModalPrivacidade({ onClose }: { onClose: () => void }) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      onClick={onClose}
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
        <div className="flex items-center justify-between border-b border-[#E2E8F0] px-6 py-4">
          <h2 className="text-lg font-bold text-[#0F172A]">Política de Privacidade</h2>
          <button type="button" onClick={onClose} className="rounded-lg p-2 text-[#64748B] hover:bg-[#F1F5F9]">
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
  );
}
