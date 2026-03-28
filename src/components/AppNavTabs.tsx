"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useMemo } from "react";
import useSWR from "swr";
import {
  MessageSquare,
  Plug,
  Users,
  Settings,
  Zap,
  Tag,
  Inbox,
  UserCog,
  Ticket,
  Megaphone,
  ChartLine,
  Shield,
  ShieldCheck,
} from "lucide-react";

const fetcher = (url: string, slug: string) =>
  fetch(url, { credentials: "include", headers: { "X-Company-Slug": slug } }).then((r) => r.json());

const PERMISSIONS_KEY = "/api/auth/permissions";
const PLATFORM_OWNER_KEY = "/api/auth/platform-owner";
const platformOwnerFetcher = (url: string) =>
  fetch(url, { credentials: "include" })
    .then((r) => r.json())
    .catch(() => ({ isPlatformOwner: false }));
/** Cache de permissões para a barra de abas carregar rápido (evita “demora”) */
const swrOpts = { revalidateOnFocus: false, dedupingInterval: 60_000 };

const ALL_TABS = [
  // Atendimento / Conversas
  { href: "/conversas", label: "Conversas", icon: MessageSquare, requires: "inbox.read" as const },
  { href: "/tickets", label: "Tickets", icon: Ticket, requires: "tickets.view" as const },
  // Conexões
  { href: "/conexoes", label: "Conexões", icon: Plug, requires: "channels.view" as const },
  // Filas
  { href: "/filas", label: "Filas", icon: Inbox, requires: "queues.view" as const },
  // CRM Comercial
  { href: "/crm", label: "CRM", icon: ChartLine, requires: "crm.view" as const },
  // Contatos
  { href: "/contatos", label: "Contatos", icon: Users, requires: "contacts.view" as const },
  // Respostas rápidas
  { href: "/respostas-rapidas", label: "Respostas Rápidas", icon: Zap, requires: "quickreplies.view" as const },
  // Tags
  { href: "/tags", label: "Tags", icon: Tag, requires: "tags.view" as const },
  // Campanhas
  { href: "/campanhas", label: "Campanhas", icon: Megaphone, requires: "campaigns.view" as const },
  { href: "/cargos-usuarios", label: "Cargos e usuários", icon: UserCog, requires: "users.view" as const },
  {
    href: "/multicalculo",
    label: "Multicálculo",
    icon: ShieldCheck,
    requires: "insurance_multicalculo.view" as const,
    featureFlag: "multicalculo_seguros_enabled" as const,
  },
  { href: "/perfil", label: "Perfil", icon: Settings, requires: "profile.view" as const },
  { href: "/super-admin", label: "Super Admin", icon: Shield, requires: "platformOwner" as const },
];

export function AppNavTabs() {
  const pathname = usePathname();
  const segments = pathname?.split("/").filter(Boolean) ?? [];
  const slug = segments[0];
  const base = slug ? `/${slug}` : "";

  const { data } = useSWR<{ permissions?: string[]; multicalculo_seguros_enabled?: boolean }>(
    base ? [PERMISSIONS_KEY, slug] : null,
    ([url]) => fetcher(url, slug),
    swrOpts
  );
  const { data: platformOwnerData } = useSWR<{ isPlatformOwner?: boolean }>(
    base ? PLATFORM_OWNER_KEY : null,
    platformOwnerFetcher,
    swrOpts
  );
  const permissions = Array.isArray(data?.permissions) ? data.permissions : [];
  const multicalculoEnabled = data?.multicalculo_seguros_enabled === true;
  const isPlatformOwner = platformOwnerData?.isPlatformOwner === true;

  const tabs = useMemo(() => {
    return ALL_TABS.filter((t) => {
      if (!("requires" in t) || !t.requires) return true;
      if (t.requires === "platformOwner") return isPlatformOwner;
      if ("featureFlag" in t && t.featureFlag === "multicalculo_seguros_enabled" && !multicalculoEnabled) {
        return false;
      }
      if (t.href === "/cargos-usuarios") {
        return permissions.includes("users.view") || permissions.includes("users.manage");
      }
      if (t.href === "/multicalculo") {
        return (
          permissions.includes("insurance_multicalculo.view") ||
          permissions.includes("insurance_multicalculo.manage")
        );
      }
      return permissions.includes(t.requires);
    });
  }, [permissions, isPlatformOwner, multicalculoEnabled]);

  if (!base) return null;

  return (
    <div className="flex shrink-0 gap-0.5 overflow-x-auto px-4 py-2.5 scrollbar-thin scrollbar-track-emerald-950/50 scrollbar-thumb-emerald-600/50">
      {tabs.map(({ href, label, icon: Icon }) => {
        const fullHref = `${base}${href}`;
        const isActive = pathname === fullHref || (href !== "/" && pathname?.startsWith(fullHref));
        const isMulticalculo = href === "/multicalculo";
        const activeClass = isMulticalculo
          ? "bg-violet-400/35 text-violet-100 ring-1 ring-violet-300/60 shadow-sm shadow-violet-900/20"
          : "bg-emerald-600/30 text-emerald-300 ring-1 ring-emerald-500/50";
        const inactiveHover = isMulticalculo
          ? "hover:bg-violet-500/15 hover:text-violet-100/95"
          : "hover:bg-white/5 hover:text-white";
        return (
          <Link
            key={href}
            href={fullHref}
            className={`flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-all duration-200 ${
              isActive ? activeClass : `text-white/70 ${inactiveHover}`
            }`}
          >
            <Icon className="h-4 w-4 shrink-0" />
            <span className="whitespace-nowrap">{label}</span>
          </Link>
        );
      })}
    </div>
  );
}
