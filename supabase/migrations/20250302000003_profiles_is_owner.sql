-- ClicVend – Primeiro usuário da empresa = proprietário (sempre ADM)
-- Distingue na tabela profiles o primeiro usuário por empresa como is_owner.
-- Esse perfil não deve ter role alterado (sempre admin); útil para UI e auditoria.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS is_owner boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.profiles.is_owner IS
  'True apenas para o primeiro perfil criado na empresa (onboarding). Esse usuário é sempre admin e não deve ser rebaixado.';

-- Backfill: marcar como owner o perfil mais antigo (min created_at) por company_id
UPDATE public.profiles p
SET is_owner = true
FROM (
  SELECT DISTINCT ON (company_id) id
  FROM public.profiles
  ORDER BY company_id, created_at ASC
) first_per_company
WHERE p.id = first_per_company.id;

-- Garantir que só existe um owner por empresa
CREATE UNIQUE INDEX IF NOT EXISTS idx_profiles_one_owner_per_company
  ON public.profiles (company_id)
  WHERE is_owner = true;
