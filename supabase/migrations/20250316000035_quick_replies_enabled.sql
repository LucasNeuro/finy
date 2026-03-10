-- Coluna enabled em quick_replies para ativar/desativar resposta no chat (controle local).

ALTER TABLE public.quick_replies
  ADD COLUMN IF NOT EXISTS enabled boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN public.quick_replies.enabled IS 'Se true, a resposta rápida fica disponível para os agentes no chat.';
