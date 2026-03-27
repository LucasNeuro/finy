-- ClicVend – Empresa dona da plataforma
-- Apenas uma empresa (configurada direto no banco) é a dona.
-- Somente o owner (primeiro usuário) dessa empresa acessa o painel Super Admin.

ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS is_platform_owner boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.companies.is_platform_owner IS
  'True apenas para a empresa dona da plataforma. Configurar direto no banco: UPDATE companies SET is_platform_owner = true WHERE slug = ''sua-empresa'';';

-- Garante que só uma empresa seja dona da plataforma
CREATE UNIQUE INDEX IF NOT EXISTS idx_companies_one_platform_owner
  ON public.companies ((1))
  WHERE is_platform_owner = true;
