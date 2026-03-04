-- Marca grupos dos quais o usuário saiu (em vez de remover da lista)
ALTER TABLE public.channel_groups
  ADD COLUMN IF NOT EXISTS left_at timestamptz;

COMMENT ON COLUMN public.channel_groups.left_at IS 'Quando o número saiu do grupo; NULL = ainda no grupo';
