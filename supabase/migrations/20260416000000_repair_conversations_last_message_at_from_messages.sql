-- Reparo: alinha last_message_at com a última mensagem real no banco (corrige cards que ficaram
-- com data do sync/import em vez da última atividade do WhatsApp).
-- Seguro de rodar várias vezes: idempotente para o estado atual das mensagens.
--
-- Opcional: executar no SQL Editor do Supabase se precisar aplicar só em produção sem deploy.

UPDATE public.conversations AS c
SET
  last_message_at = agg.max_sent_at,
  updated_at = now()
FROM (
  SELECT conversation_id, max(sent_at) AS max_sent_at
  FROM public.messages
  GROUP BY conversation_id
) AS agg
WHERE c.id = agg.conversation_id
  AND c.last_message_at IS DISTINCT FROM agg.max_sent_at;
