"use client";

import Link from "next/link";
import { Facebook, Instagram, Twitter, Linkedin, Mail, Youtube } from "lucide-react";

const FOOTER_COLUMNS = [
  {
    title: "Empresa",
    links: [
      { label: "Sobre", href: "#" },
      { label: "Equipe", href: "#" },
      { label: "Junte-se à Equipe", href: "#" },
      { label: "Blog", href: "#" },
    ],
  },
  {
    title: "Usar ClicVend",
    links: [
      { label: "Baixar o app", href: "#" },
      { label: "Usar na Web", href: "/login" },
      { label: "Usar no WhatsApp", href: "#" },
    ],
  },
  {
    title: "Funcionalidades",
    links: [
      { label: "Atendimento WhatsApp", href: "#" },
      { label: "Filas e equipes", href: "#" },
      { label: "Respostas rápidas", href: "#" },
    ],
  },
  {
    title: "Outros",
    links: [
      { label: "Termos e Condições", href: "#" },
      { label: "Política de Privacidade", href: "#" },
      { label: "Programa de Indicações", href: "#" },
    ],
  },
];

const SOCIAL_ICONS = [
  { Icon: Facebook, href: "#", label: "Facebook" },
  { Icon: Instagram, href: "#", label: "Instagram" },
  { Icon: Twitter, href: "#", label: "Twitter" },
  { Icon: Linkedin, href: "#", label: "LinkedIn" },
  { Icon: Mail, href: "#", label: "Email" },
  { Icon: Youtube, href: "#", label: "YouTube" },
];

type LandingFooterProps = {
  onTermos?: () => void;
  onPrivacidade?: () => void;
};

export function LandingFooter({ onTermos, onPrivacidade }: LandingFooterProps) {
  return (
    <footer className="bg-[#34B097] text-white">
      <div className="mx-auto w-[92%] max-w-6xl">
        <div className="flex flex-col items-center justify-center gap-4 border-b border-white/20 py-10">
          <p className="text-lg font-semibold">Teste o ClicVend</p>
          <div className="flex items-center gap-4">
            {SOCIAL_ICONS.map(({ Icon, href, label }) => (
              <a
                key={label}
                href={href}
                aria-label={label}
                className="rounded-full p-2 transition-colors hover:bg-white/20"
              >
                <Icon className="h-5 w-5" />
              </a>
            ))}
          </div>
          <p className="text-sm">
            Criado com ❤️ por{" "}
            <a href="#" className="underline hover:no-underline">
              ClicVend
            </a>
          </p>
        </div>
        <div className="grid grid-cols-2 gap-8 py-12 md:grid-cols-4">
          {FOOTER_COLUMNS.map((col) => (
            <div key={col.title}>
              <h3 className="mb-4 font-semibold">{col.title}</h3>
              <ul className="space-y-2">
                {col.links.map((link) => (
                  <li key={link.label}>
                    {link.label === "Termos e Condições" ? (
                      onTermos ? (
                        <button
                          type="button"
                          onClick={onTermos}
                          className="text-left text-sm text-white/90 transition-colors hover:text-white"
                        >
                          {link.label}
                        </button>
                      ) : (
                        <Link href="/#termos" className="text-sm text-white/90 transition-colors hover:text-white">
                          {link.label}
                        </Link>
                      )
                    ) : link.label === "Política de Privacidade" ? (
                      onPrivacidade ? (
                        <button
                          type="button"
                          onClick={onPrivacidade}
                          className="text-left text-sm text-white/90 transition-colors hover:text-white"
                        >
                          {link.label}
                        </button>
                      ) : (
                        <Link href="/#privacidade" className="text-sm text-white/90 transition-colors hover:text-white">
                          {link.label}
                        </Link>
                      )
                    ) : (
                      <Link
                        href={link.href}
                        className="text-sm text-white/90 transition-colors hover:text-white"
                      >
                        {link.label}
                      </Link>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>
    </footer>
  );
}
