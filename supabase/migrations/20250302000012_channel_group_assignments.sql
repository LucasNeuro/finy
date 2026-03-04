-- Atribuição de atendentes a grupos/comunidades (quem é responsável por cada grupo e pode ver/responder no chat).
CREATE TABLE IF NOT EXISTS public.channel_group_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id uuid NOT NULL REFERENCES public.channels(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  group_jid text NOT NULL,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now() NOT NULL,
  UNIQUE(channel_id, group_jid, user_id)
);

CREATE INDEX IF NOT EXISTS idx_channel_group_assignments_channel ON public.channel_group_assignments(channel_id);
CREATE INDEX IF NOT EXISTS idx_channel_group_assignments_company ON public.channel_group_assignments(company_id);
CREATE INDEX IF NOT EXISTS idx_channel_group_assignments_user ON public.channel_group_assignments(user_id);
CREATE INDEX IF NOT EXISTS idx_channel_group_assignments_group ON public.channel_group_assignments(channel_id, group_jid);

COMMENT ON TABLE public.channel_group_assignments IS 'Atendentes responsáveis por grupos/comunidades; usados para filtrar conversas e permitir interação no chat.';

ALTER TABLE public.channel_group_assignments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "channel_group_assignments_company"
  ON public.channel_group_assignments FOR ALL
  USING (
    company_id IN (SELECT company_id FROM public.profiles WHERE user_id = auth.uid())
  )
  WITH CHECK (
    company_id IN (SELECT company_id FROM public.profiles WHERE user_id = auth.uid())
  );
