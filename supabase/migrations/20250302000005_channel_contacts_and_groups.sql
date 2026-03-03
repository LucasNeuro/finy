-- Contatos e grupos sincronizados da UAZAPI por canal (para tela Contatos).
-- Contatos: agenda do WhatsApp do número.
-- Grupos: grupos que o número participa.

-- channel_contacts: um registro por (channel_id, jid)
CREATE TABLE IF NOT EXISTS public.channel_contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id uuid NOT NULL REFERENCES public.channels(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  jid text NOT NULL,
  phone text,
  contact_name text,
  first_name text,
  synced_at timestamptz DEFAULT now() NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL,
  UNIQUE(channel_id, jid)
);

CREATE INDEX IF NOT EXISTS idx_channel_contacts_company ON public.channel_contacts(company_id);
CREATE INDEX IF NOT EXISTS idx_channel_contacts_channel ON public.channel_contacts(channel_id);
CREATE INDEX IF NOT EXISTS idx_channel_contacts_phone ON public.channel_contacts(company_id, phone);

-- channel_groups: um registro por (channel_id, jid do grupo)
CREATE TABLE IF NOT EXISTS public.channel_groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id uuid NOT NULL REFERENCES public.channels(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  jid text NOT NULL,
  name text,
  topic text,
  invite_link text,
  synced_at timestamptz DEFAULT now() NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL,
  UNIQUE(channel_id, jid)
);

CREATE INDEX IF NOT EXISTS idx_channel_groups_company ON public.channel_groups(company_id);
CREATE INDEX IF NOT EXISTS idx_channel_groups_channel ON public.channel_groups(channel_id);

-- RLS
ALTER TABLE public.channel_contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.channel_groups ENABLE ROW LEVEL SECURITY;

CREATE POLICY "channel_contacts_company"
  ON public.channel_contacts FOR ALL
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

CREATE POLICY "channel_groups_company"
  ON public.channel_groups FOR ALL
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
