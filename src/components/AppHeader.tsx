"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  MessageSquare,
  Plug,
  Users,
  HelpCircle,
  Bell,
  Menu,
  Globe,
} from "lucide-react";

export function AppHeader() {
  const pathname = usePathname();
  const segments = pathname?.split("/").filter(Boolean) ?? [];
  const slug = segments[0];
  const base = slug ? `/${slug}` : "";

  if (!base) return null;

  return (
    <header className="flex h-14 shrink-0 items-center justify-between bg-[#1E293B] px-4 text-white">
      <Link href={base} className="font-semibold">
        ClicVend
      </Link>
      <nav className="flex items-center gap-4">
        <Link href={`${base}/conversas`} className="flex items-center gap-1.5 opacity-90 hover:opacity-100 transition-opacity" aria-label="Conversas">
          <MessageSquare className="h-4 w-4" />
          <span className="text-sm">Conversas</span>
        </Link>
        <Link href={`${base}/conexoes`} className="flex items-center gap-1.5 opacity-90 hover:opacity-100 transition-opacity" aria-label="Conexões">
          <Plug className="h-4 w-4" />
          <span className="text-sm">Conexões</span>
        </Link>
        <Link href={`${base}/contatos`} className="flex items-center gap-1.5 opacity-90 hover:opacity-100 transition-opacity" aria-label="Contatos">
          <Users className="h-4 w-4" />
          <span className="text-sm">Contatos</span>
        </Link>
        <button type="button" className="opacity-70 hover:opacity-100 transition-opacity" aria-label="Ajuda">
          <HelpCircle className="h-5 w-5" />
        </button>
        <button type="button" className="relative opacity-90 hover:opacity-100 transition-opacity" aria-label="Notificações">
          <Bell className="h-5 w-5" />
          <span className="absolute -right-1.5 -top-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-[#EF4444] text-[10px] font-medium">
            15
          </span>
        </button>
        <button type="button" className="opacity-70 hover:opacity-100 transition-opacity" aria-label="Menu">
          <Menu className="h-5 w-5" />
        </button>
        <button type="button" className="opacity-70 hover:opacity-100 transition-opacity" aria-label="Idioma">
          <Globe className="h-5 w-5" />
        </button>
        <div className="relative">
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[#312E81] text-sm font-medium">
            U
          </span>
          <span className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-[#1E293B] bg-[#22C55E]" />
        </div>
      </nav>
    </header>
  );
}
