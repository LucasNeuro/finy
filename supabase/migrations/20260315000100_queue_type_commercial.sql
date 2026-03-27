-- Tipo de fila para suportar comportamento comercial isolado.
-- standard: comportamento atual
-- commercial: carteira privada + distribuição round-robin

ALTER TABLE public.queues
  ADD COLUMN IF NOT EXISTS queue_type text NOT NULL DEFAULT 'standard'
  CHECK (queue_type IN ('standard', 'commercial'));

CREATE INDEX IF NOT EXISTS idx_queues_company_queue_type
  ON public.queues(company_id, queue_type);

COMMENT ON COLUMN public.queues.queue_type IS
'Tipo da fila: standard (padrao) ou commercial (carteira privada + round-robin).';
