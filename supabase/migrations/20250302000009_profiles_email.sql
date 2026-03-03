-- Email do usuário no perfil para exibição em listagens (Cargos e usuários).
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS email text;

COMMENT ON COLUMN public.profiles.email IS 'Cópia do e-mail do usuário (auth.users) para exibição em listagens.';
