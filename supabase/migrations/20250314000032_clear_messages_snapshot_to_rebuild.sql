-- Limpar messages_snapshot para que a API leia da tabela messages na próxima abertura do chat.
-- Assim as correções de message_type (vídeo/áudio) da migração anterior passam a valer.
-- Você já rodou a migração que corrige message_type na tabela messages; esta só limpa o snapshot.
UPDATE public.conversations
SET messages_snapshot = '[]'::jsonb,
    updated_at = now();
