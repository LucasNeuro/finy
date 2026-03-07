-- Kanban customizável: 3 tabelas auxiliares
-- 1) Statuses criados por empresa (colunas do quadro)
-- 2) Quais statuses cada caixa (fila) usa e ordem
-- 3) Histórico de mudança de status para auditoria

-- 1) Statuses de ticket por empresa (customizáveis)
CREATE TABLE IF NOT EXISTS public.company_ticket_statuses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name text NOT NULL,
  slug text NOT NULL,
  color_hex text NOT NULL DEFAULT '#64748B',
  sort_order integer NOT NULL DEFAULT 0,
  is_closed boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(company_id, slug)
);

CREATE INDEX IF NOT EXISTS idx_company_ticket_statuses_company ON public.company_ticket_statuses(company_id);
COMMENT ON TABLE public.company_ticket_statuses IS 'Statuses customizados do Kanban por empresa. Refletem nas caixas (filas) selecionadas.';

-- 2) Quais statuses cada caixa usa e em que ordem (se vazio, usa todos da empresa)
CREATE TABLE IF NOT EXISTS public.queue_ticket_statuses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  queue_id uuid NOT NULL REFERENCES public.queues(id) ON DELETE CASCADE,
  ticket_status_id uuid NOT NULL REFERENCES public.company_ticket_statuses(id) ON DELETE CASCADE,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(queue_id, ticket_status_id)
);

CREATE INDEX IF NOT EXISTS idx_queue_ticket_statuses_queue ON public.queue_ticket_statuses(queue_id);
COMMENT ON TABLE public.queue_ticket_statuses IS 'Statuses habilitados por caixa (fila). Ordem das colunas no Kanban.';

-- 3) Histórico de mudança de status (auditoria)
CREATE TABLE IF NOT EXISTS public.conversation_status_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  from_status text NOT NULL,
  to_status text NOT NULL,
  changed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_conversation_status_history_conversation ON public.conversation_status_history(conversation_id);
CREATE INDEX IF NOT EXISTS idx_conversation_status_history_created ON public.conversation_status_history(created_at);
COMMENT ON TABLE public.conversation_status_history IS 'Auditoria: quem mudou o status de qual para qual e quando.';

-- RLS
ALTER TABLE public.company_ticket_statuses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.queue_ticket_statuses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversation_status_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "company_ticket_statuses_select" ON public.company_ticket_statuses FOR SELECT
  USING (company_id IN (SELECT company_id FROM public.profiles WHERE user_id = auth.uid()));
CREATE POLICY "company_ticket_statuses_insert" ON public.company_ticket_statuses FOR INSERT
  WITH CHECK (company_id IN (SELECT company_id FROM public.profiles WHERE user_id = auth.uid()));
CREATE POLICY "company_ticket_statuses_update" ON public.company_ticket_statuses FOR UPDATE
  USING (company_id IN (SELECT company_id FROM public.profiles WHERE user_id = auth.uid()));
CREATE POLICY "company_ticket_statuses_delete" ON public.company_ticket_statuses FOR DELETE
  USING (company_id IN (SELECT company_id FROM public.profiles WHERE user_id = auth.uid()));

CREATE POLICY "queue_ticket_statuses_select" ON public.queue_ticket_statuses FOR SELECT
  USING (queue_id IN (SELECT id FROM public.queues WHERE company_id IN (SELECT company_id FROM public.profiles WHERE user_id = auth.uid())));
CREATE POLICY "queue_ticket_statuses_insert" ON public.queue_ticket_statuses FOR INSERT
  WITH CHECK (queue_id IN (SELECT id FROM public.queues WHERE company_id IN (SELECT company_id FROM public.profiles WHERE user_id = auth.uid())));
CREATE POLICY "queue_ticket_statuses_update" ON public.queue_ticket_statuses FOR UPDATE
  USING (queue_id IN (SELECT id FROM public.queues WHERE company_id IN (SELECT company_id FROM public.profiles WHERE user_id = auth.uid())));
CREATE POLICY "queue_ticket_statuses_delete" ON public.queue_ticket_statuses FOR DELETE
  USING (queue_id IN (SELECT id FROM public.queues WHERE company_id IN (SELECT company_id FROM public.profiles WHERE user_id = auth.uid())));

CREATE POLICY "conversation_status_history_select" ON public.conversation_status_history FOR SELECT
  USING (conversation_id IN (SELECT id FROM public.conversations WHERE company_id IN (SELECT company_id FROM public.profiles WHERE user_id = auth.uid())));
CREATE POLICY "conversation_status_history_insert" ON public.conversation_status_history FOR INSERT
  WITH CHECK (conversation_id IN (SELECT id FROM public.conversations WHERE company_id IN (SELECT company_id FROM public.profiles WHERE user_id = auth.uid())));

-- Seed statuses padrão para empresas existentes (slug compatível com conversations.status)
INSERT INTO public.company_ticket_statuses (company_id, name, slug, color_hex, sort_order, is_closed)
SELECT c.id, 'Abertos', 'open', '#22C55E', 1, false
FROM public.companies c
ON CONFLICT (company_id, slug) DO NOTHING;

INSERT INTO public.company_ticket_statuses (company_id, name, slug, color_hex, sort_order, is_closed)
SELECT c.id, 'Em atendimento', 'in_progress', '#3B82F6', 2, false
FROM public.companies c
ON CONFLICT (company_id, slug) DO NOTHING;

INSERT INTO public.company_ticket_statuses (company_id, name, slug, color_hex, sort_order, is_closed)
SELECT c.id, 'Aguardando', 'waiting', '#F59E0B', 3, false
FROM public.companies c
ON CONFLICT (company_id, slug) DO NOTHING;

INSERT INTO public.company_ticket_statuses (company_id, name, slug, color_hex, sort_order, is_closed)
SELECT c.id, 'Fechados', 'closed', '#64748B', 4, true
FROM public.companies c
ON CONFLICT (company_id, slug) DO NOTHING;
