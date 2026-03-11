-- Add 'internal_note' to message_type check constraint
ALTER TABLE public.messages DROP CONSTRAINT IF EXISTS messages_message_type_check;

ALTER TABLE public.messages
  ADD CONSTRAINT messages_message_type_check
  CHECK (message_type IN ('text', 'image', 'video', 'audio', 'ptt', 'document', 'sticker', 'reaction', 'internal_note'));
