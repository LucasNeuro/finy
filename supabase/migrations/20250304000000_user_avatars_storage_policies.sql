-- Políticas de storage para o bucket user-avatars (permite upload por usuários autenticados e leitura pública).

-- Permite usuários autenticados fazer upload no bucket user-avatars.
CREATE POLICY "user_avatars_authenticated_upload"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'user-avatars');

-- Permite atualizar (sobrescrever) arquivo no bucket (ex.: upsert no perfil).
CREATE POLICY "user_avatars_authenticated_update"
ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = 'user-avatars');

-- Leitura pública para URLs de avatar (bucket é público).
CREATE POLICY "user_avatars_public_read"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'user-avatars');
