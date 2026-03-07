-- Status padrão simplificado: Abertos (novas mensagens), Em fila (na fila), Fechados
-- Adiciona "Em fila" (in_queue) para mapear in_progress + waiting
INSERT INTO public.company_ticket_statuses (company_id, name, slug, color_hex, sort_order, is_closed)
SELECT c.id, 'Em fila', 'in_queue', '#3B82F6', 2, false
FROM public.companies c
ON CONFLICT (company_id, slug) DO NOTHING;
