-- Cache de contagens da sidebar (Filas, Meus, Novos, Contatos, Grupos) no próprio Supabase.
-- Se a tabela não existir (migration 26 não rodou), cria tudo. Se existir, só adiciona a coluna unassigned.

CREATE TABLE IF NOT EXISTS public.inbox_counts_cache (
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  mine int NOT NULL DEFAULT 0,
  queues int NOT NULL DEFAULT 0,
  individual int NOT NULL DEFAULT 0,
  groups int NOT NULL DEFAULT 0,
  unassigned int NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (company_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_inbox_counts_cache_updated_at
  ON public.inbox_counts_cache (company_id, updated_at);

COMMENT ON TABLE public.inbox_counts_cache IS 'Cache de contagens da inbox por (company, user). Invalidado quando conversas mudam.';

ALTER TABLE public.inbox_counts_cache ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  CREATE POLICY "Users can read own inbox counts cache"
    ON public.inbox_counts_cache FOR SELECT
    USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$
BEGIN
  CREATE POLICY "Users can insert own inbox counts cache"
    ON public.inbox_counts_cache FOR INSERT
    WITH CHECK (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$
BEGIN
  CREATE POLICY "Users can update own inbox counts cache"
    ON public.inbox_counts_cache FOR UPDATE
    USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$
BEGIN
  CREATE POLICY "No user deletes cache"
    ON public.inbox_counts_cache FOR DELETE
    USING (false);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Para quem já tem a tabela (rodou a 26) mas sem a coluna unassigned:
ALTER TABLE public.inbox_counts_cache
  ADD COLUMN IF NOT EXISTS unassigned int NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.inbox_counts_cache.unassigned IS 'Chamados na fila ainda não atribuídos (status open/in_queue, assigned_to null).';
