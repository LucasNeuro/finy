-- Migration: carteira individual do consultor comercial
-- Aditiva: não altera nenhuma tabela existente
-- Segura: todas as regras novas são isoladas por queue_type = 'commercial'

-- ============================================================
-- 1. Tabela de dono de contato comercial
-- ============================================================
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
'Dono de contato em fila comercial. Um contato (phone_canonical) por canal/empresa
pertence a um único consultor. Fonte única de roteamento para carteira individual.';

-- ============================================================
-- 2. Índices de performance
-- ============================================================

-- Lookup principal: roteamento no webhook (hot path)
CREATE UNIQUE INDEX IF NOT EXISTS uq_commercial_contact_owner
  ON public.commercial_contact_owners (company_id, channel_id, phone_canonical);

-- Listagem da carteira de um consultor
CREATE INDEX IF NOT EXISTS idx_commercial_contact_owner_user
  ON public.commercial_contact_owners (company_id, owner_user_id);

-- Listagem por fila (gestor)
CREATE INDEX IF NOT EXISTS idx_commercial_contact_owner_queue
  ON public.commercial_contact_owners (company_id, queue_id);

-- ============================================================
-- 3. Tabela de histórico de transferência de carteira
-- ============================================================
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

COMMENT ON TABLE public.commercial_contact_transfers IS
'Auditoria de transferências de carteira entre consultores.';

CREATE INDEX IF NOT EXISTS idx_commercial_contact_transfers_owner
  ON public.commercial_contact_transfers (commercial_contact_owner_id);

CREATE INDEX IF NOT EXISTS idx_commercial_contact_transfers_company
  ON public.commercial_contact_transfers (company_id, created_at DESC);

-- ============================================================
-- 4. Índices de performance nas tabelas existentes
--    (aditivos, sem alterar estrutura)
-- ============================================================

-- Leitura principal do CRM (carteiras/distribuição)
CREATE INDEX IF NOT EXISTS idx_conversations_crm_main
  ON public.conversations (company_id, queue_id, assigned_to, status, last_message_at DESC);

-- Filtro por status em fila comercial
CREATE INDEX IF NOT EXISTS idx_conversations_crm_queue_status
  ON public.conversations (company_id, queue_id, status);

-- Round-robin e permissões por fila
CREATE INDEX IF NOT EXISTS idx_queue_assignments_company_queue
  ON public.queue_assignments (company_id, queue_id);

-- Evitar consultor duplicado na mesma fila
CREATE UNIQUE INDEX IF NOT EXISTS uq_queue_assignments_company_queue_user
  ON public.queue_assignments (company_id, queue_id, user_id);

-- Cálculo de métricas de primeira resposta
CREATE INDEX IF NOT EXISTS idx_messages_conversation_sent_at
  ON public.messages (conversation_id, sent_at);

-- ============================================================
-- 5. Trigger: atualiza updated_at em commercial_contact_owners
-- ============================================================
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
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
