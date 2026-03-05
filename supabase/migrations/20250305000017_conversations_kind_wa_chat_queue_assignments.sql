-- Suporte a tickets vs grupos e round-robin.
-- conversations: wa_chat_jid (JID do chat), kind (ticket|group), is_group.
-- queue_assignments: last_assigned_at para round-robin.

-- 1) Colunas em conversations
ALTER TABLE public.conversations
  ADD COLUMN IF NOT EXISTS wa_chat_jid text,
  ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'ticket' CHECK (kind IN ('ticket', 'group')),
  ADD COLUMN IF NOT EXISTS is_group boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.conversations.wa_chat_jid IS 'JID do chat (ex: 5511...@s.whatsapp.net ou xxx@g.us). Usado para buscar conversa aberta.';
COMMENT ON COLUMN public.conversations.kind IS 'ticket = atendimento normal (entra em filas/round-robin); group = inbox de grupos (sem ticket).';
COMMENT ON COLUMN public.conversations.is_group IS 'True se for conversa de grupo.';

-- Backfill: wa_chat_jid = external_id onde ainda não preenchido
UPDATE public.conversations
SET wa_chat_jid = external_id
WHERE wa_chat_jid IS NULL AND external_id IS NOT NULL;

-- Índice para buscar conversa aberta por canal + JID + kind
CREATE INDEX IF NOT EXISTS idx_conversations_channel_wa_chat_kind_status
  ON public.conversations(channel_id, wa_chat_jid, kind)
  WHERE status IN ('open', 'pending');

-- 2) Round-robin: last_assigned_at em queue_assignments
ALTER TABLE public.queue_assignments
  ADD COLUMN IF NOT EXISTS last_assigned_at timestamptz;

COMMENT ON COLUMN public.queue_assignments.last_assigned_at IS 'Última vez que este agente recebeu um ticket (round-robin).';
