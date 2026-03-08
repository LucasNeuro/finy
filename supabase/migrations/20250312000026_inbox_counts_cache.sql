-- Cache de contagens da sidebar (Filas, Meus, Contatos, Grupos) no próprio Supabase.
-- Permite resposta rápida em GET /api/conversations/counts sem depender de Redis.
-- TTL lógico em app: 45s (consideramos válido se updated_at > now() - interval '45 seconds').

CREATE TABLE IF NOT EXISTS public.inbox_counts_cache (
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  mine int NOT NULL DEFAULT 0,
  queues int NOT NULL DEFAULT 0,
  individual int NOT NULL DEFAULT 0,
  groups int NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (company_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_inbox_counts_cache_updated_at
  ON public.inbox_counts_cache (company_id, updated_at);

COMMENT ON TABLE public.inbox_counts_cache IS 'Cache de contagens da inbox por (company, user). Invalidado quando conversas mudam.';

-- RLS: apenas o próprio usuário pode ler/gravar sua linha (service role ignora RLS).
ALTER TABLE public.inbox_counts_cache ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own inbox counts cache"
  ON public.inbox_counts_cache FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own inbox counts cache"
  ON public.inbox_counts_cache FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own inbox counts cache"
  ON public.inbox_counts_cache FOR UPDATE
  USING (auth.uid() = user_id);

-- Invalidação (delete por company_id) é feita apenas via service role no backend.
CREATE POLICY "No user deletes cache"
  ON public.inbox_counts_cache FOR DELETE
  USING (false);
