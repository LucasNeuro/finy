-- Quick replies por empresa e por fila

CREATE TABLE IF NOT EXISTS public.quick_replies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  uazapi_id text NOT NULL,
  short_cut text NOT NULL,
  type text NOT NULL,
  text text,
  file text,
  doc_name text,
  on_whatsapp boolean NOT NULL DEFAULT false,
  enabled boolean NOT NULL DEFAULT true,
  owner_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(company_id, uazapi_id)
);

CREATE INDEX IF NOT EXISTS idx_quick_replies_company ON public.quick_replies(company_id);
COMMENT ON TABLE public.quick_replies IS 'Respostas rápidas (QuickReply) espelhadas da UAZAPI, com metadados locais.';
COMMENT ON COLUMN public.quick_replies.enabled IS 'Se true, a resposta rápida fica disponível para os agentes no chat.';

CREATE TABLE IF NOT EXISTS public.quick_reply_queues (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  quick_reply_id uuid NOT NULL REFERENCES public.quick_replies(id) ON DELETE CASCADE,
  queue_id uuid NOT NULL REFERENCES public.queues(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(quick_reply_id, queue_id)
);

CREATE INDEX IF NOT EXISTS idx_quick_reply_queues_company ON public.quick_reply_queues(company_id);
CREATE INDEX IF NOT EXISTS idx_quick_reply_queues_queue ON public.quick_reply_queues(queue_id);
COMMENT ON TABLE public.quick_reply_queues IS 'Vínculo de respostas rápidas às filas (queues) da empresa.';

-- RLS
ALTER TABLE public.quick_replies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quick_reply_queues ENABLE ROW LEVEL SECURITY;

CREATE POLICY quick_replies_select ON public.quick_replies FOR SELECT
  USING (company_id IN (SELECT company_id FROM public.profiles WHERE user_id = auth.uid()));
CREATE POLICY quick_replies_insert ON public.quick_replies FOR INSERT
  WITH CHECK (company_id IN (SELECT company_id FROM public.profiles WHERE user_id = auth.uid()));
CREATE POLICY quick_replies_update ON public.quick_replies FOR UPDATE
  USING (company_id IN (SELECT company_id FROM public.profiles WHERE user_id = auth.uid()));
CREATE POLICY quick_replies_delete ON public.quick_replies FOR DELETE
  USING (company_id IN (SELECT company_id FROM public.profiles WHERE user_id = auth.uid()));

CREATE POLICY quick_reply_queues_select ON public.quick_reply_queues FOR SELECT
  USING (company_id IN (SELECT company_id FROM public.profiles WHERE user_id = auth.uid()));
CREATE POLICY quick_reply_queues_insert ON public.quick_reply_queues FOR INSERT
  WITH CHECK (company_id IN (SELECT company_id FROM public.profiles WHERE user_id = auth.uid()));
CREATE POLICY quick_reply_queues_update ON public.quick_reply_queues FOR UPDATE
  USING (company_id IN (SELECT company_id FROM public.profiles WHERE user_id = auth.uid()));
CREATE POLICY quick_reply_queues_delete ON public.quick_reply_queues FOR DELETE
  USING (company_id IN (SELECT company_id FROM public.profiles WHERE user_id = auth.uid()));

