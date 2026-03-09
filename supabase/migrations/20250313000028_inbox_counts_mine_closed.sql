-- Adiciona coluna mine_closed ao cache de contagens (conversas encerradas pelo agente).
ALTER TABLE public.inbox_counts_cache
  ADD COLUMN IF NOT EXISTS mine_closed int NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.inbox_counts_cache.mine_closed IS 'Chamados encerrados atribuídos ao usuário (status closed, assigned_to = user).';
