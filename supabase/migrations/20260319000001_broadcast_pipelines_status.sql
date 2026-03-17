-- Adiciona status e queue_item_ids para execução agendada
ALTER TABLE public.broadcast_pipelines
  ADD COLUMN IF NOT EXISTS status text DEFAULT 'draft' CHECK (status IN ('draft', 'scheduled', 'running', 'completed', 'failed')),
  ADD COLUMN IF NOT EXISTS queue_item_ids jsonb DEFAULT '[]'::jsonb;

CREATE INDEX IF NOT EXISTS idx_broadcast_pipelines_status ON public.broadcast_pipelines(status);
