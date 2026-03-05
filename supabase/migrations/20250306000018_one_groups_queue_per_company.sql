-- Uma fila "Grupos" por empresa (slug 'groups'), em vez de uma por canal.
-- Todos os canais da empresa apontam para essa fila para conversas de grupo.
-- A UI pode usar essa fila como padrão no módulo Conversas.

-- 1) Criar uma fila "Grupos" por empresa (slug 'groups', kind 'group')
INSERT INTO public.queues (company_id, name, slug, kind)
SELECT c.id, 'Grupos', 'groups', 'group'
FROM public.companies c
ON CONFLICT (company_id, slug) DO UPDATE SET
  name = EXCLUDED.name,
  kind = EXCLUDED.kind;

-- 2) Remover vínculos das antigas filas "Grupos - Canal" (slug groups_xxxxxxxx)
DELETE FROM public.channel_queues
WHERE queue_id IN (
  SELECT id FROM public.queues
  WHERE kind = 'group' AND slug <> 'groups'
);

-- 3) Atualizar conversas que estavam na fila antiga para a nova fila Grupos da empresa
UPDATE public.conversations c
SET queue_id = (
  SELECT q.id FROM public.queues q
  WHERE q.company_id = c.company_id AND q.slug = 'groups' AND q.kind = 'group'
  LIMIT 1
)
WHERE c.queue_id IN (
  SELECT id FROM public.queues
  WHERE kind = 'group' AND slug <> 'groups'
);

-- 4) Vincular cada canal à fila "Grupos" da sua empresa
INSERT INTO public.channel_queues (channel_id, queue_id, is_default)
SELECT ch.id, q.id, false
FROM public.channels ch
JOIN public.queues q ON q.company_id = ch.company_id AND q.slug = 'groups' AND q.kind = 'group'
WHERE NOT EXISTS (
  SELECT 1 FROM public.channel_queues cq
  WHERE cq.channel_id = ch.id AND cq.queue_id = q.id
);
