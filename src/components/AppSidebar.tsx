"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  MessageSquare,
  Plug,
  Users,
  Settings,
  Zap,
  Tag,
  LogOut,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";

const navItems = [
  { href: "/conversas", label: "Conversas", icon: MessageSquare },
  { href: "/conexoes", label: "Conexões", icon: Plug },
  { href: "/contatos", label: "Contatos", icon: Users },
  { href: "/respostas-rapidas", label: "Respostas Rápidas", icon: Zap },
  { href: "/tags", label: "Tags", icon: Tag },
  { href: "/perfil", label: "Perfil", icon: Settings },
];

export function AppSidebar() {
  const pathname = usePathname();
  const router = useRouter();

  const segments = pathname?.split("/").filter(Boolean) ?? [];
  const slug = segments[0];
  const base = slug ? `/${slug}` : "";

  async function handleLogout() {
    await createClient().auth.signOut();
    router.push("/login");
    router.refresh();
  }

  if (!base) return null;

  return (
    <aside className="fixed left-0 top-14 z-40 flex h-[calc(100vh-3.5rem)] w-16 shrink-0 flex-col items-center border-r border-black/20 bg-[#0a0a0a] py-3">
      {navItems.map(({ href, label, icon: Icon }) => {
        const fullHref = `${base}${href}`;
        const isActive = pathname === fullHref || (href !== "/" && pathname?.startsWith(fullHref));
        return (
          <Link
            key={href}
            href={fullHref}
            title={label}
            className={`mb-1 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl transition-all duration-200 ${
              isActive
                ? "bg-clicvend-green text-white shadow-sm"
                : "text-white/60 hover:bg-white/10 hover:text-clicvend-green"
            }`}
          >
            <Icon className="h-5 w-5 shrink-0" />
          </Link>
        );
      })}
      <div className="mt-auto pt-2">
        <button
          type="button"
          onClick={handleLogout}
          title="Deslogar"
          className="flex h-10 w-10 items-center justify-center rounded-xl text-white/60 transition-colors hover:bg-white/10 hover:text-[#EF4444]"
        >
          <LogOut className="h-5 w-5" />
        </button>
      </div>
    </aside>
  );
}
