"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState, useEffect, useRef } from "react";
import { Settings, LogOut, ChevronDown, Search } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { ClicVendLogo } from "@/components/ClicVendLogo";

export function AppHeader() {
  const pathname = usePathname();
  const router = useRouter();
  const [user, setUser] = useState<{ email?: string } | null>(null);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const segments = pathname?.split("/").filter(Boolean) ?? [];
  const slug = segments[0];
  const base = slug ? `/${slug}` : "";

  useEffect(() => {
    createClient()
      .auth.getUser()
      .then(({ data: { user: u } }) => setUser(u ?? null));
  }, []);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    }
    document.addEventListener("click", handleClickOutside);
    return () => document.removeEventListener("click", handleClickOutside);
  }, []);

  async function handleLogout() {
    await createClient().auth.signOut();
    router.push("/login");
    router.refresh();
  }

  const initial = user?.email?.[0]?.toUpperCase() ?? "U";

  if (!base) return null;

  return (
    <header className="fixed left-0 right-0 top-0 z-50 flex h-14 shrink-0 items-center justify-between gap-4 border-b border-[#E2E8F0] bg-white px-6 shadow-sm">
      <Link href={base} className="flex shrink-0 items-center gap-2 transition-opacity hover:opacity-90">
        <ClicVendLogo size="sm" className="h-7 w-auto" />
      </Link>
      <div className="hidden flex-1 max-w-sm sm:flex sm:justify-center">
        <div className="flex w-full max-w-xs items-center gap-2 rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] px-4 py-2.5 text-sm text-[#64748B] transition-colors hover:border-[#CBD5E1] focus-within:border-clicvend-green/50 focus-within:ring-2 focus-within:ring-clicvend-green/10">
          <Search className="h-4 w-4 shrink-0" />
          <span>Buscar</span>
        </div>
      </div>
      <div className="relative flex items-center" ref={dropdownRef}>
          <button
            type="button"
            onClick={() => setDropdownOpen((o) => !o)}
            className={`flex items-center gap-2 rounded-lg px-2 py-1.5 transition-colors focus:outline-none focus:ring-2 focus:ring-clicvend-green/30 ${
              dropdownOpen ? "bg-[#F1F5F9]" : "hover:bg-[#F8FAFC]"
            }`}
            aria-expanded={dropdownOpen}
            aria-haspopup="true"
            aria-label="Menu do usuário"
          >
            <span className="relative flex h-8 w-8 items-center justify-center rounded-full bg-clicvend-green text-sm font-medium text-white">
              {initial}
              <span className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-white bg-clicvend-green-dark" />
            </span>
            <ChevronDown className={`h-4 w-4 shrink-0 text-[#64748B] transition-transform ${dropdownOpen ? "rotate-180" : ""}`} />
          </button>

          {dropdownOpen && (
            <div className="absolute right-0 top-full z-50 mt-2 w-52 rounded-xl border border-[#E2E8F0] bg-white py-1.5 shadow-lg ring-1 ring-black/5">
              <Link
                href={`${base}/perfil`}
                onClick={() => setDropdownOpen(false)}
                className="flex items-center gap-2.5 px-4 py-2.5 text-sm text-[#64748B] hover:bg-[#F8FAFC] hover:text-[#1E293B] transition-colors"
              >
                <Settings className="h-4 w-4 shrink-0" />
                Configurações
              </Link>
              <div className="my-1 h-px bg-[#E2E8F0]" />
              <button
                type="button"
                onClick={() => {
                  setDropdownOpen(false);
                  handleLogout();
                }}
                className="flex w-full items-center gap-2.5 px-4 py-2.5 text-left text-sm text-[#EF4444] hover:bg-[#FEF2F2] transition-colors"
              >
                <LogOut className="h-4 w-4" />
                Deslogar
              </button>
            </div>
          )}
        </div>
    </header>
  );
}
