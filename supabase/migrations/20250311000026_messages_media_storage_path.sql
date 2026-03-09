-- Campo para guardar o path interno do arquivo no bucket whatsapp-media.
-- Formato sugerido: companyId/conversationId/messageId

ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS media_storage_path text;

COMMENT ON COLUMN public.messages.media_storage_path IS 'Path inside whatsapp-media bucket (companyId/conversationId/messageId).';

