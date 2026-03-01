"use client";

import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import { useState } from "react";

export function useLogin() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function login(email: string, password: string) {
    setError(null);
    setLoading(true);
    const supabase = createClient();
    const { data, error: signError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    if (signError) {
      setError(signError.message);
      setLoading(false);
      return;
    }
    if (!data.user) {
      setError("Erro ao obter usuário.");
      setLoading(false);
      return;
    }
    // Buscar primeiro company slug do usuário (perfis)
    const { data: profiles } = await supabase
      .from("profiles")
      .select("company_id, companies(slug)")
      .eq("user_id", data.user.id)
      .limit(1);
    const slug =
      profiles?.[0] && profiles[0].companies && typeof (profiles[0].companies as { slug?: string }).slug === "string"
        ? (profiles[0].companies as unknown as { slug: string }).slug
        : null;
    setLoading(false);
    if (slug) {
      router.push(`/${slug}`);
      router.refresh();
    } else {
      router.push("/sem-empresa");
      router.refresh();
    }
  }

  return { login, error, loading };
}
