-- Liga notificações de inbox à conversa (dedupe por usuário + conversa).
-- kind = 'inbox_new_message' é preenchido pelo webhook ao receber mensagem de cliente.

ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS conversation_id uuid REFERENCES public.conversations(id) ON DELETE CASCADE;

COMMENT ON COLUMN public.notifications.conversation_id IS 'Conversa associada (ex.: kind inbox_new_message). ON DELETE CASCADE remove o aviso se o chat for apagado.';

CREATE INDEX IF NOT EXISTS idx_notifications_conversation_id
  ON public.notifications (conversation_id)
  WHERE conversation_id IS NOT NULL;

-- Uma linha por (empresa, usuário, conversa) para novas mensagens — evita spam no sino.
CREATE UNIQUE INDEX IF NOT EXISTS idx_notifications_inbox_dedupe
  ON public.notifications (company_id, user_id, conversation_id)
  WHERE kind = 'inbox_new_message' AND conversation_id IS NOT NULL;
