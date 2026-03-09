-- Tabela auxiliar de notificações por usuário/empresa.
-- Usada para a barra de notificações no header (sino).

CREATE TABLE IF NOT EXISTS public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  kind text NOT NULL DEFAULT 'system', -- ex: system, inbox, ticket
  title text NOT NULL,
  body text,
  link text, -- rota relativa opcional (ex.: /tickets/123)
  data jsonb NOT NULL DEFAULT '{}'::jsonb, -- metadados extras (IDs, etc.)
  is_read boolean NOT NULL DEFAULT false,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_notifications_company_user_created
  ON public.notifications(company_id, user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_notifications_company_user_unread
  ON public.notifications(company_id, user_id)
  WHERE is_read = false;

COMMENT ON TABLE public.notifications IS 'Notificações por usuário/empresa (barra de notificações da aplicação).';
COMMENT ON COLUMN public.notifications.kind IS 'Tipo da notificação (system, inbox, ticket, etc).';
COMMENT ON COLUMN public.notifications.link IS 'Rota relativa opcional para abrir ao clicar na notificação.';

-- RLS: cada usuário só vê/atualiza notificações da(s) empresa(s) em que tem perfil
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "notifications_select_by_company_user" ON public.notifications
  FOR SELECT
  USING (
    user_id = auth.uid()
    AND company_id IN (SELECT company_id FROM public.profiles WHERE user_id = auth.uid())
  );

CREATE POLICY "notifications_insert_self" ON public.notifications
  FOR INSERT
  WITH CHECK (
    user_id = auth.uid()
    AND company_id IN (SELECT company_id FROM public.profiles WHERE user_id = auth.uid())
  );

CREATE POLICY "notifications_update_self" ON public.notifications
  FOR UPDATE
  USING (
    user_id = auth.uid()
    AND company_id IN (SELECT company_id FROM public.profiles WHERE user_id = auth.uid())
  )
  WITH CHECK (
    user_id = auth.uid()
    AND company_id IN (SELECT company_id FROM public.profiles WHERE user_id = auth.uid())
  );

