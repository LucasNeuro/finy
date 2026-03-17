-- Pipelines de envio em massa: configuração do fluxo (lista, horário, cadência, mensagem, modo).
-- Permite salvar e reutilizar fluxos configurados.

CREATE TABLE IF NOT EXISTS public.broadcast_pipelines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name text NOT NULL,
  config jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_broadcast_pipelines_company ON public.broadcast_pipelines(company_id);
CREATE INDEX IF NOT EXISTS idx_broadcast_pipelines_updated ON public.broadcast_pipelines(updated_at);

-- RLS
ALTER TABLE public.broadcast_pipelines ENABLE ROW LEVEL SECURITY;

CREATE POLICY "broadcast_pipelines_company"
  ON public.broadcast_pipelines FOR ALL
  USING (
    company_id IN (
      SELECT company_id FROM public.profiles WHERE user_id = auth.uid()
    )
  )
  WITH CHECK (
    company_id IN (
      SELECT company_id FROM public.profiles WHERE user_id = auth.uid()
    )
  );
