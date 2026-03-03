-- Campos adicionais no perfil para gestão de usuários (ADM/Owner).
-- Telefone WhatsApp: para enviar credenciais de acesso; CPF e nome para cadastro completo.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS full_name text,
  ADD COLUMN IF NOT EXISTS phone text,
  ADD COLUMN IF NOT EXISTS cpf text;

COMMENT ON COLUMN public.profiles.full_name IS 'Nome completo do usuário (exibição e listagens).';
COMMENT ON COLUMN public.profiles.phone IS 'Telefone WhatsApp (apenas dígitos) para envio de credenciais e contato.';
COMMENT ON COLUMN public.profiles.cpf IS 'CPF do usuário (apenas dígitos), para cadastro completo pela gestão.';
