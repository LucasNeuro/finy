"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useEffect, useMemo } from "react";
import {
  MessageSquare,
  Plug,
  Users,
  Settings,
  Zap,
  Tag,
  Inbox,
  UserCog,
} from "lucide-react";

const ALL_TABS = [
  { href: "/conversas", label: "Conversas", icon: MessageSquare },
  { href: "/conexoes", label: "Conexões", icon: Plug },
  { href: "/filas", label: "Filas", icon: Inbox },
  { href: "/contatos", label: "Contatos", icon: Users },
  { href: "/respostas-rapidas", label: "Respostas Rápidas", icon: Zap },
  { href: "/tags", label: "Tags", icon: Tag },
  { href: "/cargos-usuarios", label: "Cargos e usuários", icon: UserCog, requires: "users.manage" as const },
  { href: "/perfil", label: "Perfil", icon: Settings },
];

export function AppNavTabs() {
  const pathname = usePathname();
  const segments = pathname?.split("/").filter(Boolean) ?? [];
  const slug = segments[0];
  const base = slug ? `/${slug}` : "";

  const [permissions, setPermissions] = useState<string[]>([]);

  useEffect(() => {
    if (!slug) {
      setPermissions([]);
      return;
    }
    fetch("/api/auth/permissions", {
      credentials: "include",
      headers: { "X-Company-Slug": slug },
    })
      .then((r) => r.json())
      .then((data) => setPermissions(Array.isArray(data?.permissions) ? data.permissions : []))
      .catch(() => setPermissions([]));
  }, [slug]);

  const tabs = useMemo(() => {
    return ALL_TABS.filter((t) => {
      if (!("requires" in t) || !t.requires) return true;
      return permissions.includes(t.requires);
    });
  }, [permissions]);

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
