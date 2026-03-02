-- ClicVend – Expansão do schema para sistema estilo Zendesk
-- Prioridades, tipos, tags, respostas rápidas, satisfação.

-- ========== CONVERSATIONS: prioridade e tipo ==========
ALTER TABLE public.conversations
  ADD COLUMN IF NOT EXISTS priority text DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high', 'urgent'));

ALTER TABLE public.conversations
  ADD COLUMN IF NOT EXISTS type text DEFAULT 'question' CHECK (type IN ('question', 'problem', 'task', 'incident'));

COMMENT ON COLUMN public.conversations.priority IS 'Prioridade: low, normal, high, urgent';
COMMENT ON COLUMN public.conversations.type IS 'Tipo: question, problem, task, incident';

-- ========== TAGS ==========
CREATE TABLE IF NOT EXISTS public.tags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name text NOT NULL,
  color text,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL,
  UNIQUE(company_id, name)
);

CREATE TABLE IF NOT EXISTS public.conversation_tags (
  conversation_id uuid NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  tag_id uuid NOT NULL REFERENCES public.tags(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now() NOT NULL,
  PRIMARY KEY (conversation_id, tag_id)
);

CREATE INDEX IF NOT EXISTS idx_conversation_tags_conversation ON public.conversation_tags(conversation_id);
CREATE INDEX IF NOT EXISTS idx_tags_company ON public.tags(company_id);

-- ========== RESPOSTAS RÁPIDAS (canned responses) ==========
CREATE TABLE IF NOT EXISTS public.canned_responses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name text NOT NULL,
  content text NOT NULL,
  shortcut text,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_canned_responses_company ON public.canned_responses(company_id);

-- ========== SATISFAÇÃO (rating) ==========
CREATE TABLE IF NOT EXISTS public.conversation_ratings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  rating integer NOT NULL CHECK (rating >= 1 AND rating <= 5),
  comment text,
  created_at timestamptz DEFAULT now() NOT NULL,
  UNIQUE(conversation_id)
);

CREATE INDEX IF NOT EXISTS idx_conversation_ratings_conversation ON public.conversation_ratings(conversation_id);

-- ========== CAMPOS PERSONALIZADOS (custom fields) ==========
CREATE TABLE IF NOT EXISTS public.custom_field_definitions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name text NOT NULL,
  slug text NOT NULL,
  field_type text NOT NULL CHECK (field_type IN ('text', 'number', 'select', 'multiselect', 'date', 'checkbox')),
  options jsonb,
  required boolean DEFAULT false,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL,
  UNIQUE(company_id, slug)
);

CREATE TABLE IF NOT EXISTS public.conversation_custom_fields (
  conversation_id uuid NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  field_id uuid NOT NULL REFERENCES public.custom_field_definitions(id) ON DELETE CASCADE,
  value jsonb NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL,
  PRIMARY KEY (conversation_id, field_id)
);

-- ========== RLS ==========
ALTER TABLE public.tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversation_tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.canned_responses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversation_ratings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.custom_field_definitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversation_custom_fields ENABLE ROW LEVEL SECURITY;

-- tags: por company do perfil
CREATE POLICY "tags_select_by_company" ON public.tags FOR SELECT
  USING (company_id IN (SELECT company_id FROM public.profiles WHERE user_id = auth.uid()));
CREATE POLICY "tags_insert_by_company" ON public.tags FOR INSERT
  WITH CHECK (company_id IN (SELECT company_id FROM public.profiles WHERE user_id = auth.uid()));
CREATE POLICY "tags_update_by_company" ON public.tags FOR UPDATE
  USING (company_id IN (SELECT company_id FROM public.profiles WHERE user_id = auth.uid()));
CREATE POLICY "tags_delete_by_company" ON public.tags FOR DELETE
  USING (company_id IN (SELECT company_id FROM public.profiles WHERE user_id = auth.uid()));

-- conversation_tags: por company via conversation
CREATE POLICY "conversation_tags_all" ON public.conversation_tags FOR ALL
  USING (
    conversation_id IN (
      SELECT id FROM public.conversations
      WHERE company_id IN (SELECT company_id FROM public.profiles WHERE user_id = auth.uid())
    )
  )
  WITH CHECK (
    conversation_id IN (
      SELECT id FROM public.conversations
      WHERE company_id IN (SELECT company_id FROM public.profiles WHERE user_id = auth.uid())
    )
  );

-- canned_responses: por company
CREATE POLICY "canned_responses_select_by_company" ON public.canned_responses FOR SELECT
  USING (company_id IN (SELECT company_id FROM public.profiles WHERE user_id = auth.uid()));
CREATE POLICY "canned_responses_insert_by_company" ON public.canned_responses FOR INSERT
  WITH CHECK (company_id IN (SELECT company_id FROM public.profiles WHERE user_id = auth.uid()));
CREATE POLICY "canned_responses_update_by_company" ON public.canned_responses FOR UPDATE
  USING (company_id IN (SELECT company_id FROM public.profiles WHERE user_id = auth.uid()));
CREATE POLICY "canned_responses_delete_by_company" ON public.canned_responses FOR DELETE
  USING (company_id IN (SELECT company_id FROM public.profiles WHERE user_id = auth.uid()));

-- conversation_ratings: por company via conversation
CREATE POLICY "conversation_ratings_all" ON public.conversation_ratings FOR ALL
  USING (
    conversation_id IN (
      SELECT id FROM public.conversations
      WHERE company_id IN (SELECT company_id FROM public.profiles WHERE user_id = auth.uid())
    )
  );

-- custom_field_definitions: por company
CREATE POLICY "custom_field_definitions_all" ON public.custom_field_definitions FOR ALL
  USING (company_id IN (SELECT company_id FROM public.profiles WHERE user_id = auth.uid()));
CREATE POLICY "custom_field_definitions_insert" ON public.custom_field_definitions FOR INSERT
  WITH CHECK (company_id IN (SELECT company_id FROM public.profiles WHERE user_id = auth.uid()));

-- conversation_custom_fields: por company via conversation
CREATE POLICY "conversation_custom_fields_all" ON public.conversation_custom_fields FOR ALL
  USING (
    conversation_id IN (
      SELECT id FROM public.conversations
      WHERE company_id IN (SELECT company_id FROM public.profiles WHERE user_id = auth.uid())
    )
  );
