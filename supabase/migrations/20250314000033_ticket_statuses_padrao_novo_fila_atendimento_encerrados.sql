-- Statuses padrão do Kanban para TODAS as empresas e TODAS as filas:
-- Novo, Fila, Em atendimento, Encerrados (em todas as instâncias e todas as caixas)

-- 1) Garantir que toda empresa tenha os 4 statuses (slug = valor de conversations.status)
--    Nomes: Novo (open), Fila (in_queue), Em atendimento (in_progress), Encerrados (closed)
INSERT INTO public.company_ticket_statuses (company_id, name, slug, color_hex, sort_order, is_closed)
SELECT c.id, 'Novo', 'open', '#22C55E', 0, false
FROM public.companies c
ON CONFLICT (company_id, slug) WHERE (queue_id IS NULL)
DO UPDATE SET name = EXCLUDED.name, color_hex = EXCLUDED.color_hex, sort_order = EXCLUDED.sort_order, is_closed = EXCLUDED.is_closed, updated_at = now();

INSERT INTO public.company_ticket_statuses (company_id, name, slug, color_hex, sort_order, is_closed)
SELECT c.id, 'Fila', 'in_queue', '#3B82F6', 1, false
FROM public.companies c
ON CONFLICT (company_id, slug) WHERE (queue_id IS NULL)
DO UPDATE SET name = EXCLUDED.name, color_hex = EXCLUDED.color_hex, sort_order = EXCLUDED.sort_order, is_closed = EXCLUDED.is_closed, updated_at = now();

INSERT INTO public.company_ticket_statuses (company_id, name, slug, color_hex, sort_order, is_closed)
SELECT c.id, 'Em atendimento', 'in_progress', '#8B5CF6', 2, false
FROM public.companies c
ON CONFLICT (company_id, slug) WHERE (queue_id IS NULL)
DO UPDATE SET name = EXCLUDED.name, color_hex = EXCLUDED.color_hex, sort_order = EXCLUDED.sort_order, is_closed = EXCLUDED.is_closed, updated_at = now();

INSERT INTO public.company_ticket_statuses (company_id, name, slug, color_hex, sort_order, is_closed)
SELECT c.id, 'Encerrados', 'closed', '#64748B', 3, true
FROM public.companies c
ON CONFLICT (company_id, slug) WHERE (queue_id IS NULL)
DO UPDATE SET name = EXCLUDED.name, color_hex = EXCLUDED.color_hex, sort_order = EXCLUDED.sort_order, is_closed = EXCLUDED.is_closed, updated_at = now();

-- 2) Para cada fila, vincular exatamente esses 4 statuses na ordem (Novo, Fila, Em atendimento, Encerrados)
--    Remove vínculos atuais da fila e insere os 4 statuses padrão da empresa.
DELETE FROM public.queue_ticket_statuses;

INSERT INTO public.queue_ticket_statuses (queue_id, ticket_status_id, sort_order)
SELECT q.id AS queue_id,
       s.id AS ticket_status_id,
       (row_number() OVER (PARTITION BY q.id ORDER BY s.sort_order)) - 1 AS sort_order
FROM public.queues q
JOIN public.company_ticket_statuses s ON s.company_id = q.company_id AND s.queue_id IS NULL
WHERE s.slug IN ('open', 'in_queue', 'in_progress', 'closed');

COMMENT ON TABLE public.queue_ticket_statuses IS 'Statuses habilitados por caixa (fila). Ordem das colunas no Kanban. Padrão: Novo, Fila, Em atendimento, Encerrados.';
