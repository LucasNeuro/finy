-- CRM Comercial reconcile migration (idempotente)
-- Objetivo: garantir estrutura mínima para carteira individual + round-robin
-- sem impactar filas padrão.

BEGIN;

-- 1) Garantir queue_type em queues (caso ambiente esteja defasado)
ALTER TABLE public.queues
  ADD COLUMN IF NOT EXISTS queue_type text NOT NULL DEFAULT 'standard';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'queues_queue_type_check'
      AND conrelid = 'public.queues'::regclass
  ) THEN
    ALTER TABLE public.queues
      ADD CONSTRAINT queues_queue_type_check
      CHECK (queue_type IN ('standard', 'commercial'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_queues_company_queue_type
  ON public.queues(company_id, queue_type);

-- 2) Tabela principal de carteira comercial
CREATE TABLE IF NOT EXISTS public.commercial_contact_owners (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  channel_id uuid NOT NULL REFERENCES public.channels(id) ON DELETE CASCADE,
  queue_id uuid NOT NULL REFERENCES public.queues(id) ON DELETE CASCADE,
  phone_canonical text NOT NULL,
  owner_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  source text NOT NULL DEFAULT 'manual'
    CHECK (source IN ('manual', 'import', 'campaign', 'webhook', 'round_robin')),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.commercial_contact_owners IS
'Carteira individual por consultor para filas comerciais.';

CREATE UNIQUE INDEX IF NOT EXISTS uq_commercial_contact_owner
  ON public.commercial_contact_owners (company_id, channel_id, phone_canonical);

CREATE INDEX IF NOT EXISTS idx_commercial_contact_owner_user
  ON public.commercial_contact_owners (company_id, owner_user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_commercial_contact_owner_queue
  ON public.commercial_contact_owners (company_id, queue_id, created_at DESC);

-- 3) Auditoria de transferências
CREATE TABLE IF NOT EXISTS public.commercial_contact_transfers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  commercial_contact_owner_id uuid NOT NULL
    REFERENCES public.commercial_contact_owners(id) ON DELETE CASCADE,
  from_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  to_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  transferred_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_commercial_contact_transfers_owner
  ON public.commercial_contact_transfers (commercial_contact_owner_id);

CREATE INDEX IF NOT EXISTS idx_commercial_contact_transfers_company
  ON public.commercial_contact_transfers (company_id, created_at DESC);

-- 4) Trigger updated_at
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_commercial_contact_owners_updated_at
  ON public.commercial_contact_owners;

CREATE TRIGGER trg_commercial_contact_owners_updated_at
BEFORE UPDATE ON public.commercial_contact_owners
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 5) Índices de apoio ao CRM
CREATE INDEX IF NOT EXISTS idx_conversations_crm_main
  ON public.conversations (company_id, queue_id, assigned_to, status, last_message_at DESC);

CREATE INDEX IF NOT EXISTS idx_conversations_crm_queue_status
  ON public.conversations (company_id, queue_id, status);

CREATE INDEX IF NOT EXISTS idx_queue_assignments_company_queue
  ON public.queue_assignments (company_id, queue_id);

CREATE UNIQUE INDEX IF NOT EXISTS uq_queue_assignments_company_queue_user
  ON public.queue_assignments (company_id, queue_id, user_id);

CREATE INDEX IF NOT EXISTS idx_messages_conversation_sent_at
  ON public.messages (conversation_id, sent_at);

-- 6) Backfill inicial (somente se houver filas comerciais e conversas atribuídas)
-- Cria carteira base para não começar "zerado" após ativar o CRM comercial.
INSERT INTO public.commercial_contact_owners (
  company_id,
  channel_id,
  queue_id,
  phone_canonical,
  owner_user_id,
  source,
  notes
)
SELECT
  c.company_id,
  c.channel_id,
  c.queue_id,
  regexp_replace(coalesce(c.customer_phone, ''), '\D', '', 'g') AS phone_canonical,
  c.assigned_to AS owner_user_id,
  'import'::text AS source,
  'Backfill inicial a partir de conversas já atribuídas em fila comercial.'::text AS notes
FROM public.conversations c
JOIN public.queues q
  ON q.id = c.queue_id
 AND q.company_id = c.company_id
WHERE q.queue_type = 'commercial'
  AND c.assigned_to IS NOT NULL
  AND coalesce(regexp_replace(coalesce(c.customer_phone, ''), '\D', '', 'g'), '') <> ''
ON CONFLICT (company_id, channel_id, phone_canonical) DO NOTHING;

COMMIT;

