-- Tags e formulários de tabulação
-- Módulo: Tags & Formulários (contatos + atendimentos)

-----------------------------
-- 1. Categorias e Tags
-----------------------------

CREATE TABLE public.tag_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name text NOT NULL,
  kind text NOT NULL CHECK (kind = ANY (ARRAY['contact','conversation'])),
  description text,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS tag_categories_company_kind_idx
  ON public.tag_categories (company_id, kind, sort_order);


CREATE TABLE public.tags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  category_id uuid NOT NULL REFERENCES public.tag_categories(id) ON DELETE CASCADE,
  name text NOT NULL,
  color_hex text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS tags_company_category_idx
  ON public.tags (company_id, category_id, is_active);


CREATE TABLE public.tag_queues (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  tag_id uuid NOT NULL REFERENCES public.tags(id) ON DELETE CASCADE,
  queue_id uuid NOT NULL REFERENCES public.queues(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT tag_queues_unique UNIQUE (tag_id, queue_id)
);

CREATE INDEX IF NOT EXISTS tag_queues_company_idx
  ON public.tag_queues (company_id, queue_id);


-----------------------------
-- 2. Uso das Tags
-----------------------------

-- Tags aplicadas em contatos (channel_contacts)
CREATE TABLE public.contact_tags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  channel_contact_id uuid NOT NULL REFERENCES public.channel_contacts(id) ON DELETE CASCADE,
  tag_id uuid NOT NULL REFERENCES public.tags(id) ON DELETE CASCADE,
  applied_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT contact_tags_unique UNIQUE (channel_contact_id, tag_id)
);

CREATE INDEX IF NOT EXISTS contact_tags_company_idx
  ON public.contact_tags (company_id, channel_contact_id);


-- Tags aplicadas em conversas/atendimentos
CREATE TABLE public.conversation_tags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  conversation_id uuid NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  tag_id uuid NOT NULL REFERENCES public.tags(id) ON DELETE CASCADE,
  applied_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT conversation_tags_unique UNIQUE (conversation_id, tag_id)
);

CREATE INDEX IF NOT EXISTS conversation_tags_company_idx
  ON public.conversation_tags (company_id, conversation_id);


-----------------------------
-- 3. Formulários de Tabulação
-----------------------------

CREATE TABLE public.tag_forms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS tag_forms_company_active_idx
  ON public.tag_forms (company_id, is_active);


CREATE TABLE public.tag_form_queues (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  tag_form_id uuid NOT NULL REFERENCES public.tag_forms(id) ON DELETE CASCADE,
  queue_id uuid NOT NULL REFERENCES public.queues(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT tag_form_queues_unique UNIQUE (tag_form_id, queue_id)
);

CREATE INDEX IF NOT EXISTS tag_form_queues_company_idx
  ON public.tag_form_queues (company_id, queue_id);


CREATE TABLE public.tag_form_fields (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tag_form_id uuid NOT NULL REFERENCES public.tag_forms(id) ON DELETE CASCADE,
  label text NOT NULL,
  field_type text NOT NULL CHECK (field_type = ANY (ARRAY['select','multiselect','text','number'])),
  required boolean NOT NULL DEFAULT false,
  sort_order integer NOT NULL DEFAULT 0,
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS tag_form_fields_form_idx
  ON public.tag_form_fields (tag_form_id, sort_order);


-----------------------------
-- 4. Respostas dos Formulários
-----------------------------

CREATE TABLE public.conversation_form_answers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  conversation_id uuid NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  tag_form_id uuid NOT NULL REFERENCES public.tag_forms(id) ON DELETE CASCADE,
  answered_by uuid REFERENCES auth.users(id),
  answers jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS conversation_form_answers_conv_idx
  ON public.conversation_form_answers (company_id, conversation_id, tag_form_id);

