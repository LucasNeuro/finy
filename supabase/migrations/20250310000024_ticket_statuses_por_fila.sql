-- Permite criar status exclusivos por fila (queue_id)
-- Status com queue_id preenchido existem apenas naquela fila

ALTER TABLE public.company_ticket_statuses
  ADD COLUMN IF NOT EXISTS queue_id uuid REFERENCES public.queues(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_company_ticket_statuses_queue
  ON public.company_ticket_statuses(queue_id) WHERE queue_id IS NOT NULL;

-- Remove constraint antiga e adiciona constraints parciais para permitir slug duplicado em contextos diferentes
ALTER TABLE public.company_ticket_statuses
  DROP CONSTRAINT IF EXISTS company_ticket_statuses_company_id_slug_key;

CREATE UNIQUE INDEX IF NOT EXISTS idx_company_ticket_statuses_company_slug
  ON public.company_ticket_statuses(company_id, slug)
  WHERE queue_id IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_company_ticket_statuses_queue_slug
  ON public.company_ticket_statuses(company_id, queue_id, slug)
  WHERE queue_id IS NOT NULL;

COMMENT ON COLUMN public.company_ticket_statuses.queue_id IS 'Se preenchido, o status é exclusivo desta fila. Se null, é status da empresa.';
