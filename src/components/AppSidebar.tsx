"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState, useEffect } from "react";
import { Settings, LogOut } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

export function AppSidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const segments = pathname?.split("/").filter(Boolean) ?? [];
  const slug = segments[0];
  const base = slug ? `/${slug}` : "";

  const [canViewProfile, setCanViewProfile] = useState(false);
  useEffect(() => {
    if (!slug) {
      setCanViewProfile(false);
      return;
    }
    fetch("/api/auth/permissions", {
      credentials: "include",
      headers: { "X-Company-Slug": slug },
    })
      .then((r) => r.json())
      .then((data) => setCanViewProfile(Array.isArray(data?.permissions) && data.permissions.includes("profile.view")))
      .catch(() => setCanViewProfile(false));
  }, [slug]);

  async function handleLogout() {
    await createClient().auth.signOut();
    router.push("/login");
    router.refresh();
  }

  if (!base) return null;

  const perfilHref = `${base}/perfil`;
  const isPerfilActive = pathname === perfilHref;

  return (
    <aside className="fixed left-0 top-14 z-40 flex h-[calc(100vh-3.5rem)] w-16 shrink-0 flex-col items-center border-r border-black/20 bg-[#0a0a0a] py-3">
      <div className="mt-auto flex flex-col gap-1">
        {canViewProfile && (
          <Link
            href={perfilHref}
            title="Configurações"
            className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl transition-all duration-200 ${
              isPerfilActive
                ? "bg-clicvend-green text-white shadow-sm"
                : "text-white/60 hover:bg-white/10 hover:text-clicvend-green"
            }`}
          >
            <Settings className="h-5 w-5 shrink-0" />
          </Link>
        )}
        <button
          type="button"
          onClick={handleLogout}
          title="Sair"
          className="flex h-10 w-10 items-center justify-center rounded-xl text-white/60 transition-colors hover:bg-white/10 hover:text-[#EF4444]"
        >
          <LogOut className="h-5 w-5" />
        </button>
      </div>
    </aside>
  );
}
