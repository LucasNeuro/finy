-- Bucket de storage para mídias de WhatsApp (imagens, áudios, vídeos, documentos).
-- Mantém arquivos privados; o backend gera signed URLs quando necessário.

INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES (
  'whatsapp-media',
  'whatsapp-media',
  false,
  52428800 -- 50 MB
)
ON CONFLICT (id) DO NOTHING;

