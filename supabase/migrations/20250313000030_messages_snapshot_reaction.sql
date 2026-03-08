-- Incluir reaction no snapshot. Trigger de UPDATE para refletir reações no snapshot.
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
    'file_name', NEW.file_name,
    'reaction', NEW.reaction
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

CREATE OR REPLACE FUNCTION public.sync_messages_snapshot_update()
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
    'file_name', NEW.file_name,
    'reaction', NEW.reaction
  );
  UPDATE public.conversations
  SET messages_snapshot = (
    SELECT COALESCE(jsonb_agg(
      CASE WHEN (elem->>'id') = (NEW.id::text) THEN new_msg ELSE elem END
      ORDER BY (elem->>'sent_at')::timestamptz
    ), '[]'::jsonb)
    FROM jsonb_array_elements(COALESCE(messages_snapshot, '[]'::jsonb)) AS t(elem)
  )
  WHERE id = NEW.conversation_id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_messages_snapshot_update ON public.messages;
CREATE TRIGGER trg_sync_messages_snapshot_update
  AFTER UPDATE ON public.messages
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_messages_snapshot_update();
