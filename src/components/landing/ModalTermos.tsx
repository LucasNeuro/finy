"use client";

import { BRAND_NAME } from "@/lib/brand";
import { motion } from "framer-motion";
import { X } from "lucide-react";

export function ModalTermos({ onClose }: { onClose: () => void }) {
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
          <h2 className="text-lg font-bold text-[#0F172A]">Termos de uso</h2>
          <button type="button" onClick={onClose} className="rounded-lg p-2 text-[#64748B] hover:bg-[#F1F5F9]">
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
  );
}
