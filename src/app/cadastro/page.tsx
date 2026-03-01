"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function CadastroPage() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/onboarding");
  }, [router]);
  return (
    <main className="flex min-h-screen items-center justify-center bg-[#F8FAFC]">
      <p className="text-[#64748B]">Redirecionando…</p>
    </main>
  );
}
