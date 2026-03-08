"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useEffect, useRef } from "react";
import { Settings, ChevronDown, Bell } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { ClicVendLogo } from "@/components/ClicVendLogo";

export function AppHeader() {
  const pathname = usePathname();
  const [user, setUser] = useState<{ email?: string } | null>(null);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const segments = pathname?.split("/").filter(Boolean) ?? [];
  const slug = segments[0];
  const base = slug ? `/${slug}` : "";
  const [canViewProfile, setCanViewProfile] = useState(false);
  const [canShowNewNotifications, setCanShowNewNotifications] = useState(false);
  const [unassignedCount, setUnassignedCount] = useState<number>(0);

  useEffect(() => {
    createClient()
      .auth.getUser()
      .then(({ data: { user: u } }) => setUser(u ?? null));
  }, []);

  useEffect(() => {
    if (!slug) {
      setCanViewProfile(false);
      setCanShowNewNotifications(false);
      return;
    }
    const apiHeaders = { "X-Company-Slug": slug };
    fetch("/api/auth/permissions", { credentials: "include", headers: apiHeaders })
      .then((r) => r.json())
      .then((data) => {
        const perms = Array.isArray(data?.permissions) ? data.permissions : [];
        setCanViewProfile(perms.includes("profile.view"));
        setCanShowNewNotifications(perms.includes("inbox.show_new_notifications"));
      })
      .catch(() => {
        setCanViewProfile(false);
        setCanShowNewNotifications(false);
      });
  }, [slug]);

  useEffect(() => {
    if (!slug || !canShowNewNotifications) {
      setUnassignedCount(0);
      return;
    }
    const apiHeaders = { "X-Company-Slug": slug };
    const fetchCounts = () =>
      fetch("/api/conversations/counts", { credentials: "include", headers: apiHeaders, cache: "no-store" })
        .then((r) => r.json())
        .then((data) => {
          const n = typeof data?.unassigned === "number" ? data.unassigned : 0;
          setUnassignedCount(n);
        })
        .catch(() => {});
    fetchCounts();
    const interval = setInterval(fetchCounts, 60_000);
    return () => clearInterval(interval);
  }, [slug, canShowNewNotifications]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    }
    document.addEventListener("click", handleClickOutside);
    return () => document.removeEventListener("click", handleClickOutside);
  }, []);

  const initial = user?.email?.[0]?.toUpperCase() ?? "U";

  if (!base) return null;

  return (
    <header className="fixed left-0 right-0 top-0 z-50 flex h-14 shrink-0 items-center justify-between gap-4 border-b border-[#E2E8F0] bg-white px-6 shadow-sm">
      <Link href={base} className="flex shrink-0 items-center gap-2 transition-opacity hover:opacity-90">
        <ClicVendLogo size="sm" className="h-7 w-auto" />
      </Link>
      <div className="relative flex items-center gap-2" ref={dropdownRef}>
        {canShowNewNotifications && (
          <Link
            href={`${base}/conversas`}
            className="relative flex items-center justify-center rounded-lg p-2 text-[#64748B] hover:bg-[#F8FAFC] hover:text-[#1E293B] transition-colors focus:outline-none focus:ring-2 focus:ring-clicvend-green/30"
            aria-label={unassignedCount > 0 ? `${unassignedCount} novos chamados` : "Notificações"}
          >
            <Bell className="h-5 w-5" />
            {unassignedCount > 0 && (
              <span className="absolute -top-0.5 -right-0.5 flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-amber-500 px-1 text-[10px] font-bold text-white">
                {unassignedCount > 99 ? "99+" : unassignedCount}
              </span>
            )}
          </Link>
        )}
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
            {canViewProfile && (
              <Link
                href={`${base}/perfil`}
                onClick={() => setDropdownOpen(false)}
                className="flex items-center gap-2.5 px-4 py-2.5 text-sm text-[#64748B] hover:bg-[#F8FAFC] hover:text-[#1E293B] transition-colors"
              >
                <Settings className="h-4 w-4 shrink-0" />
                Configurações
              </Link>
            )}
          </div>
        )}
      </div>
    </header>
  );
}
