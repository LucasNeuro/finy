-- Ativar/desativar usuário na empresa (admin pode desativar para bloquear acesso).
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN public.profiles.is_active IS 'Se false, usuário não pode acessar a empresa. Proprietário (is_owner) não deve ser desativado.';
