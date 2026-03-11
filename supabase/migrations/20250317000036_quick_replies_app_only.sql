-- Respostas rápidas apenas na aplicação: uazapi_id opcional (null = criado no app, não na UAZAPI).
-- Cada fila pode ter até 40 respostas rápidas para os agentes usarem no chat (a UAZAPI/WhatsApp permite só 1 por instância).
-- Rode este SQL no Supabase (SQL Editor) se der erro "null value in column uazapi_id violates not-null constraint".
ALTER TABLE public.quick_replies
  ALTER COLUMN uazapi_id DROP NOT NULL;

COMMENT ON COLUMN public.quick_replies.uazapi_id IS 'ID na UAZAPI quando veio de lá; null quando criado só na aplicação (até 40 por fila no chat).';
