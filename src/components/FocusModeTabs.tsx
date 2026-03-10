"use client";

import { usePathname } from "next/navigation";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { Users } from "lucide-react";

type Conversation = {
  id: string;
  channel_name?: string | null;
  customer_phone: string;
  customer_name: string | null;
  status: string;
  avatar_url?: string | null;
  is_group?: boolean;
  queue_name?: string | null;
  assigned_to?: string | null;
};

function formatPhoneShort(raw: string | null | undefined): string {
  const s = (raw ?? "").trim().replace(/\D/g, "");
  if (!s || s.length < 10) return "—";
  const with55 = s.startsWith("55") ? s.slice(2) : s;
  if (with55.length >= 10) return `(${with55.slice(0, 2)}) ${with55.slice(2, 3)} ${with55.slice(3, 8)}-${with55.slice(8, 12)}`;
  return with55;
}

export function FocusModeTabs() {
  const pathname = usePathname();
  const segments = pathname?.split("/").filter(Boolean) ?? [];
  const slug = segments[0];
  const currentId = pathname?.includes("/conversas/") ? pathname.split("/conversas/")[1]?.split("/")[0] ?? null : null;
  const base = slug ? `/${slug}` : "";
  const apiHeaders = slug ? { "X-Company-Slug": slug } : undefined;

  const { data, isLoading } = useQuery({
    queryKey: ["inbox", "focus", "mine", slug] as const,
    queryFn: async () => {
      const params = new URLSearchParams({ limit: "12", only_assigned_to_me: "1" });
      const res = await fetch(`/api/conversations?${params}`, {
        credentials: "include",
        headers: apiHeaders,
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error ?? "Falha ao carregar");
      return json as { data: Conversation[]; total: number };
    },
    enabled: !!slug,
    staleTime: 30 * 1000,
  });

  const list = data?.data ?? [];
  if (list.length === 0 && !isLoading) return null;

  return (
    <div className="flex shrink-0 items-center gap-1 border-b border-[#E2E8F0] bg-white px-2 py-1.5 overflow-x-auto">
      {list.map((c) => {
        const href = `${base}/conversas/${c.id}`;
        const isActive = currentId === c.id;
        const displayName = (c.customer_name ?? formatPhoneShort(c.customer_phone)) ?? "?";
        const initial = displayName.slice(0, 1).toUpperCase();
        const avatarSrc =
          c.avatar_url && c.avatar_url.trim()
            ? c.avatar_url.startsWith("http")
              ? `/api/contacts/avatar?url=${encodeURIComponent(c.avatar_url)}`
              : c.avatar_url
            : null;

        return (
          <Link
            key={c.id}
            href={href}
            className={`flex shrink-0 items-center gap-2 rounded-lg border px-2 py-1.5 transition-all min-w-0 max-w-[135px] ${
              isActive
                ? "border-clicvend-orange/50 bg-clicvend-orange/10 ring-1 ring-clicvend-orange/30"
                : "border-[#E2E8F0] bg-[#F8FAFC] hover:border-green-300 hover:bg-green-50/80"
            }`}
          >
            <span className="flex h-7 w-7 shrink-0 items-center justify-center overflow-hidden rounded-full bg-[#E2E8F0] text-xs font-medium text-[#64748B]">
              {avatarSrc ? (
                <img src={avatarSrc} alt="" className="h-full w-full object-cover" referrerPolicy="no-referrer" />
              ) : c.is_group ? (
                <Users className="h-3.5 w-3.5" />
              ) : (
                initial
              )}
            </span>
            <p className="truncate text-xs font-medium text-[#1E293B] min-w-0 flex-1">{displayName}</p>
          </Link>
        );
      })}
    </div>
  );
}
