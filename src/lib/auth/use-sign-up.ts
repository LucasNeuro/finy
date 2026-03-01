"use client";

import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import { useState } from "react";

export function useSignUp() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function signUp(email: string, password: string) {
    setError(null);
    setLoading(true);
    const supabase = createClient();
    const { data, error: signError } = await supabase.auth.signUp({
      email,
      password,
      options: { emailRedirectTo: `${typeof window !== "undefined" ? window.location.origin : ""}/auth/callback` },
    });
    if (signError) {
      setError(signError.message);
      setLoading(false);
      return;
    }
    if (!data.user) {
      setError("Erro ao criar conta.");
      setLoading(false);
      return;
    }
    setLoading(false);
    router.push("/onboarding");
    router.refresh();
  }

  return { signUp, error, loading };
}
