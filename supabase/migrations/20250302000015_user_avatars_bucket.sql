-- Bucket para fotos de usuários e coluna avatar_url no perfil.

-- Coluna no perfil para armazenar URL ou path da foto do usuário.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS avatar_url text;

COMMENT ON COLUMN public.profiles.avatar_url IS 'URL ou path da foto de perfil do usuário (avatar).';

-- Cria bucket de storage para avatares de usuários, se ainda não existir.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM storage.buckets WHERE name = 'user-avatars'
  ) THEN
    PERFORM storage.create_bucket(
      bucket_id := 'user-avatars',
      public := true,
      file_size_limit := 5242880 -- 5 MB
    );
  END IF;
END
$$;

