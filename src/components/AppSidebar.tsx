"use client";

import { usePathname } from "next/navigation";

export function AppSidebar() {
  const pathname = usePathname();
  const segments = pathname?.split("/").filter(Boolean) ?? [];
  const slug = segments[0];
  const base = slug ? `/${slug}` : "";

  if (!base) return null;

  return (
    <aside
      className="fixed left-0 top-14 z-40 flex h-[calc(100vh-3.5rem)] w-[8px] shrink-0 flex-col items-center bg-gradient-to-b from-black via-emerald-950 to-emerald-900 py-3"
    />
  );
}
