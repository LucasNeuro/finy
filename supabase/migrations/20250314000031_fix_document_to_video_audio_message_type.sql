-- Corrigir message_type de mensagens já salvas como 'document' que são vídeo ou áudio
-- (por file_name, media_url ou content), para exibir miniplayers no chat.

-- Vídeo: por extensão do arquivo
UPDATE public.messages
SET message_type = 'video'
WHERE message_type = 'document'
  AND file_name IS NOT NULL
  AND file_name ~* '\.(mp4|webm|mov|avi|mkv|m4v|3gp)(\?|$)';

-- Vídeo: por data URL no media_url
UPDATE public.messages
SET message_type = 'video'
WHERE message_type = 'document'
  AND media_url IS NOT NULL
  AND media_url LIKE 'data:video/%';

-- Vídeo: por conteúdo placeholder
UPDATE public.messages
SET message_type = 'video'
WHERE message_type = 'document'
  AND TRIM(COALESCE(content, '')) ~* '^\[?(vídeo|video)\]?$';

-- Áudio: por extensão do arquivo
UPDATE public.messages
SET message_type = 'audio'
WHERE message_type = 'document'
  AND file_name IS NOT NULL
  AND file_name ~* '\.(mp3|ogg|m4a|wav|opus|aac|oga|weba)(\?|$)';

-- Áudio: por data URL no media_url
UPDATE public.messages
SET message_type = 'audio'
WHERE message_type = 'document'
  AND media_url IS NOT NULL
  AND media_url LIKE 'data:audio/%';

-- Áudio: por conteúdo placeholder
UPDATE public.messages
SET message_type = 'audio'
WHERE message_type = 'document'
  AND TRIM(COALESCE(content, '')) ~* '^\[?(áudio|audio|ptt)\]?$';
