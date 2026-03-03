"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  MessageSquare,
  Plug,
  Users,
  Settings,
  Zap,
  Tag,
  Inbox,
} from "lucide-react";

const tabs = [
  { href: "/conversas", label: "Conversas", icon: MessageSquare },
  { href: "/conexoes", label: "Conexões", icon: Plug },
  { href: "/filas", label: "Filas", icon: Inbox },
  { href: "/contatos", label: "Contatos", icon: Users },
  { href: "/respostas-rapidas", label: "Respostas Rápidas", icon: Zap },
  { href: "/tags", label: "Tags", icon: Tag },
  { href: "/perfil", label: "Perfil", icon: Settings },
];

export function AppNavTabs() {
  const pathname = usePathname();
  const segments = pathname?.split("/").filter(Boolean) ?? [];
  const slug = segments[0];
  const base = slug ? `/${slug}` : "";

  if (!base) return null;

  return (
    <div className="flex shrink-0 gap-1 overflow-x-auto border-b border-[#E2E8F0] bg-white px-4 scrollbar-thin">
      {tabs.map(({ href, label, icon: Icon }) => {
        const fullHref = `${base}${href}`;
        const isActive = pathname === fullHref || (href !== "/" && pathname?.startsWith(fullHref));
        return (
          <Link
            key={href}
            href={fullHref}
            className={`flex shrink-0 items-center gap-2 border-b-2 px-4 py-3.5 text-sm font-medium transition-colors ${
              isActive
                ? "border-clicvend-green text-clicvend-green"
                : "border-transparent text-[#64748B] hover:border-[#E2E8F0] hover:text-[#0a0a0a]"
            }`}
          >
            <Icon className="h-4 w-4 shrink-0" />
            {label}
          </Link>
        );
      })}
    </div>
  );
}
