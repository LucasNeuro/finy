-- Filas/caixas de entrada específicas para grupos por canal (instância UAZAPI).
-- Ideia:
-- - queues.kind = 'ticket' (padrão) ou 'group' (inbox de grupos).
-- - Para cada canal existente, criamos uma fila "Grupos - <nome do canal>" do tipo 'group'.
-- - Essas filas serão usadas apenas para conversas de grupos (não geram tickets/conversations).
-- - A UI poderá listar essas filas/caixas em uma aba separada de "Grupos".

-- 1) Coluna kind em queues
ALTER TABLE public.queues
  ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'ticket'
  CHECK (kind IN ('ticket', 'group'));

COMMENT ON COLUMN public.queues.kind IS
  'Tipo de fila/caixa: ticket (atendimentos normais) ou group (inbox de grupos – não gera tickets).';

-- 2) Backfill: garantir que filas existentes continuam como "ticket"
UPDATE public.queues
SET kind = 'ticket'
WHERE kind IS NULL;

-- 3) Criar uma fila "Grupos - <canal>" por canal, se ainda não existir nenhuma fila kind=group para aquele canal
--    (na prática, a fila é por empresa+canal, mas queues já tem company_id).
INSERT INTO public.queues (company_id, name, slug, kind)
SELECT
  ch.company_id,
  'Grupos - ' || ch.name AS name,
  -- slug único por empresa/canal
  'groups_' || substr(ch.id::text, 1, 8) AS slug,
  'group'::text AS kind
FROM public.channels ch
WHERE NOT EXISTS (
  SELECT 1
  FROM public.queues q
  JOIN public.channel_queues cq ON cq.queue_id = q.id
  WHERE q.company_id = ch.company_id
    AND q.kind = 'group'
    AND cq.channel_id = ch.id
)
ON CONFLICT (company_id, slug) DO NOTHING;

-- 4) Vincular cada canal à sua fila de grupos recém-criada (ou já existente), via channel_queues.
--    Não marcamos is_default, pois a fila padrão do canal continua sendo a de tickets.
INSERT INTO public.channel_queues (channel_id, queue_id, is_default)
SELECT
  ch.id AS channel_id,
  q.id AS queue_id,
  false AS is_default
FROM public.channels ch
JOIN public.queues q
  ON q.company_id = ch.company_id
  AND q.kind = 'group'
  AND q.slug = 'groups_' || substr(ch.id::text, 1, 8)
WHERE NOT EXISTS (
  SELECT 1
  FROM public.channel_queues cq
  WHERE cq.channel_id = ch.id
    AND cq.queue_id = q.id
);

