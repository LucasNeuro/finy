-- Fila de envio em massa: contatos adicionados para envio com delay.
-- Cada linha = um contato aguardando envio (status pending) ou já processado.

CREATE TABLE IF NOT EXISTS public.broadcast_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  channel_id uuid NOT NULL REFERENCES public.channels(id) ON DELETE CASCADE,
  queue_id uuid REFERENCES public.queues(id) ON DELETE SET NULL,
  channel_contact_id uuid NOT NULL REFERENCES public.channel_contacts(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'failed')),
  created_at timestamptz DEFAULT now() NOT NULL,
  sent_at timestamptz,
  error_message text
);

CREATE INDEX IF NOT EXISTS idx_broadcast_queue_company ON public.broadcast_queue(company_id);
CREATE INDEX IF NOT EXISTS idx_broadcast_queue_channel ON public.broadcast_queue(channel_id);
CREATE INDEX IF NOT EXISTS idx_broadcast_queue_status ON public.broadcast_queue(status);
CREATE INDEX IF NOT EXISTS idx_broadcast_queue_created ON public.broadcast_queue(created_at);

-- RLS
ALTER TABLE public.broadcast_queue ENABLE ROW LEVEL SECURITY;

CREATE POLICY "broadcast_queue_company"
  ON public.broadcast_queue FOR ALL
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
