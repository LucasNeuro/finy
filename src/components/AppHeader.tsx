"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState, useEffect, useRef } from "react";
import { Settings, ChevronDown, Bell, Loader2, Check, LogOut } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { ClicVendLogo } from "@/components/ClicVendLogo";

type NotificationItem = {
  id: string;
  kind: string;
  title: string;
  body: string | null;
  link: string | null;
  is_read: boolean;
  created_at: string;
};

export function AppHeader() {
  const pathname = usePathname();
  const router = useRouter();
  const [user, setUser] = useState<{ email?: string } | null>(null);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const segments = pathname?.split("/").filter(Boolean) ?? [];
  const slug = segments[0];
  const base = slug ? `/${slug}` : "";
  const [canViewProfile, setCanViewProfile] = useState(false);
  const [canShowNewNotifications, setCanShowNewNotifications] = useState(false);
  const [unassignedCount, setUnassignedCount] = useState<number>(0);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [notificationsUnread, setNotificationsUnread] = useState(0);
  const [notificationsLoading, setNotificationsLoading] = useState(false);

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
        const hasRead = perms.includes("inbox.read");
        const hideBell = perms.includes("inbox.hide_new_notifications");
        const showBell = perms.includes("inbox.show_new_notifications");
        setCanShowNewNotifications(hasRead && (showBell || !hideBell));
      })
      .catch(() => {
        setCanViewProfile(false);
        setCanShowNewNotifications(false);
      });
  }, [slug]);

  useEffect(() => {
    if (!slug || !canShowNewNotifications) {
      setUnassignedCount(0);
      setNotifications([]);
      setNotificationsUnread(0);
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
    const fetchNotifications = () =>
      fetch("/api/notifications?limit=20", { credentials: "include", headers: apiHeaders, cache: "no-store" })
        .then((r) => r.json())
        .then((data) => {
          if (Array.isArray(data?.items)) {
            const items = data.items as NotificationItem[];
            setNotifications(items);
            setNotificationsUnread(typeof data?.unread === "number" ? data.unread : items.filter((n) => !n.is_read).length);
          }
        })
        .catch(() => {});

    fetchCounts();
    fetchNotifications();
    const interval = setInterval(() => {
      fetchCounts();
      fetchNotifications();
    }, 60_000);
    return () => clearInterval(interval);
  }, [slug, canShowNewNotifications]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
        setNotificationsOpen(false);
      }
    }
    document.addEventListener("click", handleClickOutside);
    return () => document.removeEventListener("click", handleClickOutside);
  }, []);

  const initial = user?.email?.[0]?.toUpperCase() ?? "U";

  async function handleLogout() {
    await createClient().auth.signOut();
    router.push("/login");
    router.refresh();
  }

  function formatRelativeTime(iso: string): string {
    const d = new Date(iso);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffMin = Math.floor(diffMs / 60000);
    if (diffMin < 1) return "agora";
    if (diffMin < 60) return `${diffMin} min`;
    const diffH = Math.floor(diffMin / 60);
    if (diffH < 24) return `${diffH} h`;
    const diffD = Math.floor(diffH / 24);
    return `${diffD} d`;
  }

  async function handleMarkAllNotificationsRead() {
    if (!slug || notificationsUnread === 0) return;
    const apiHeaders = { "X-Company-Slug": slug };
    try {
      setNotificationsLoading(true);
      await fetch("/api/notifications/mark-all-read", {
        method: "POST",
        credentials: "include",
        headers: apiHeaders,
      });
      setNotifications((items) => items.map((n) => ({ ...n, is_read: true })));
      setNotificationsUnread(0);
    } catch {
      // silencioso
    } finally {
      setNotificationsLoading(false);
    }
  }

  if (!base) return null;

  return (
    <header className="fixed left-0 right-0 top-0 z-50 flex h-14 shrink-0 items-center justify-between gap-4 border-b border-[#E2E8F0] bg-white px-6 shadow-sm">
      <Link href={base} className="flex shrink-0 items-center gap-2 transition-opacity hover:opacity-90">
        <ClicVendLogo size="sm" className="h-7 w-auto" />
      </Link>
      <div className="relative flex items-center gap-2" ref={dropdownRef}>
        {canShowNewNotifications && (
          <div className="relative">
            <button
              type="button"
              onClick={() => setNotificationsOpen((o) => !o)}
              className="flex items-center justify-center rounded-md p-2.5 text-[#64748B] hover:bg-amber-50 hover:text-amber-700 transition-colors focus:outline-none focus:ring-2 focus:ring-amber-200"
              aria-label="Notificações"
              title="Notificações"
            >
              <Bell className="h-5 w-5 shrink-0" />
            </button>
            {notificationsOpen && (
              <div className="absolute right-[2.75rem] top-[120%] z-50 w-[360px] max-w-[92vw] rounded-lg border border-[#E2E8F0] bg-white shadow-xl">
                <div className="flex items-center justify-between px-4 py-3 border-b border-[#E2E8F0]">
                  <div className="text-sm font-semibold text-[#0F172A]">Notificações</div>
                  <button
                    type="button"
                    onClick={handleMarkAllNotificationsRead}
                    disabled={notificationsUnread === 0 || notificationsLoading}
                    className="inline-flex items-center gap-1 text-xs font-medium text-clicvend-green hover:text-clicvend-green-dark disabled:opacity-40"
                  >
                    {notificationsLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                    Marcar todas como lidas
                  </button>
                </div>
                <div className="max-h-[360px] overflow-y-auto">
                  {notifications.length === 0 ? (
                    <div className="px-4 py-6 text-sm text-[#64748B]">
                      Nenhuma notificação por enquanto.
                    </div>
                  ) : (
                    <ul className="divide-y divide-[#E2E8F0]/70">
                      {notifications.map((n) => (
                        <li
                          key={n.id}
                          className={`px-4 py-3 text-sm ${n.is_read ? "bg-white" : "bg-[#F8FAFC]"}`}
                        >
                          <div className="flex items-start gap-3">
                            <span
                              className={`mt-1 h-2.5 w-2.5 rounded-full ${
                                n.is_read ? "bg-[#E2E8F0]" : "bg-clicvend-green"
                              }`}
                              aria-hidden
                            />
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center justify-between gap-2">
                                <p className="truncate text-[13px] font-semibold text-[#0F172A]">
                                  {n.title}
                                </p>
                                <span className="shrink-0 text-[11px] text-[#94A3B8]">
                                  {formatRelativeTime(n.created_at)}
                                </span>
                              </div>
                              {n.body && (
                                <p className="mt-0.5 text-[12px] leading-snug text-[#64748B] line-clamp-3">
                                  {n.body}
                                </p>
                              )}
                            </div>
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            )}
          </div>
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
            <button
              type="button"
              onClick={() => { setDropdownOpen(false); handleLogout(); }}
              className="flex w-full items-center gap-2.5 px-4 py-2.5 text-sm text-[#64748B] hover:bg-red-50 hover:text-red-600 transition-colors text-left"
            >
              <LogOut className="h-4 w-4 shrink-0" />
              Sair
            </button>
          </div>
        )}
      </div>
    </header>
  );
}
