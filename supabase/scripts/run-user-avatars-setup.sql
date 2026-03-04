-- =============================================================================
-- Script único: coluna avatar_url + bucket user-avatars + políticas de storage
-- Execute no Supabase Dashboard → SQL Editor para criar tudo de uma vez.
-- =============================================================================

-- 1) Coluna no perfil
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS avatar_url text;

COMMENT ON COLUMN public.profiles.avatar_url IS 'URL ou path da foto de perfil do usuário (avatar).';

-- 2) Bucket de storage (5 MB por arquivo, público para leitura)
-- Se der erro de coluna, crie o bucket no Dashboard: Storage → New bucket → id/name: user-avatars, Public: on, Size limit: 5 MB
INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES (
  'user-avatars',
  'user-avatars',
  true,
  5242880
)
ON CONFLICT (id) DO NOTHING;

-- 3) Políticas de storage (remover se já existirem e recriar)
DROP POLICY IF EXISTS "user_avatars_authenticated_upload" ON storage.objects;
DROP POLICY IF EXISTS "user_avatars_authenticated_update" ON storage.objects;
DROP POLICY IF EXISTS "user_avatars_public_read" ON storage.objects;

CREATE POLICY "user_avatars_authenticated_upload"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'user-avatars');

CREATE POLICY "user_avatars_authenticated_update"
ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = 'user-avatars');

CREATE POLICY "user_avatars_public_read"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'user-avatars');
