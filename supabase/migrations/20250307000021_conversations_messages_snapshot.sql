-- Snapshot JSONB das últimas mensagens por conversa para leitura rápida (1 row, 1 coluna).
-- A tabela messages continua sendo a fonte de verdade; o webhook faz INSERT normalmente.
-- Trigger mantém o snapshot atualizado a cada nova mensagem (últimas 1000 por conversa).

ALTER TABLE public.conversations
ADD COLUMN IF NOT EXISTS messages_snapshot jsonb NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN public.conversations.messages_snapshot IS 'Últimas mensagens (até 1000) em JSONB para leitura rápida; mantido por trigger a partir de messages.';

CREATE OR REPLACE FUNCTION public.sync_messages_snapshot()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_msg jsonb;
BEGIN
  new_msg := jsonb_build_object(
    'id', NEW.id,
    'direction', NEW.direction,
    'content', NEW.content,
    'external_id', NEW.external_id,
    'sent_at', NEW.sent_at,
    'created_at', NEW.created_at,
    'message_type', COALESCE(NEW.message_type, 'text'),
    'media_url', NEW.media_url,
    'caption', NEW.caption,
    'file_name', NEW.file_name
  );
  UPDATE public.conversations
  SET messages_snapshot = (
    SELECT COALESCE(jsonb_agg(e ORDER BY (e->>'sent_at')::timestamptz), '[]'::jsonb)
    FROM (
      SELECT e
      FROM jsonb_array_elements(COALESCE(messages_snapshot, '[]'::jsonb) || jsonb_build_array(new_msg)) AS t(e)
      ORDER BY (e->>'sent_at')::timestamptz DESC
      LIMIT 1000
    ) sub(e)
  )
  WHERE id = NEW.conversation_id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_messages_snapshot ON public.messages;
CREATE TRIGGER trg_sync_messages_snapshot
  AFTER INSERT ON public.messages
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_messages_snapshot();

-- Backfill: preencher snapshot das conversas existentes com as últimas 1000 mensagens
UPDATE public.conversations c
SET messages_snapshot = COALESCE(
  (
    SELECT jsonb_agg(to_jsonb(m) ORDER BY m.sent_at)
    FROM (
      SELECT id, direction, content, external_id, sent_at, created_at,
             COALESCE(message_type, 'text') AS message_type,
             media_url, caption, file_name
      FROM public.messages
      WHERE conversation_id = c.id
      ORDER BY sent_at
      LIMIT 1000
    ) m
  ),
  '[]'::jsonb
)
WHERE EXISTS (SELECT 1 FROM public.messages WHERE conversation_id = c.id);
