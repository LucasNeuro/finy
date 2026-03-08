-- Reações emoji nas mensagens (estilo WhatsApp Web). Uma reação por mensagem (emoji ou null = sem reação).
ALTER TABLE public.messages
ADD COLUMN IF NOT EXISTS reaction text;

COMMENT ON COLUMN public.messages.reaction IS 'Emoji de reação (ex: 👍). Null = sem reação. UAZAPI: um por mensagem.';
