-- ClicVend – Controle de ativação/desativação de empresas
-- Permite que admins ativem e desativem empresas no futuro.
-- Empresas desativadas não podem ser acessadas via URL.

-- ========== CAMPOS DE STATUS EM companies ==========

ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;

ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS deactivated_at timestamptz;

ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS deactivated_by uuid REFERENCES auth.users(id);

COMMENT ON COLUMN public.companies.is_active IS 'Empresa ativa pode ser acessada. Desativada pelo admin bloqueia acesso.';
COMMENT ON COLUMN public.companies.deactivated_at IS 'Data/hora em que a empresa foi desativada.';
COMMENT ON COLUMN public.companies.deactivated_by IS 'Usuário admin que desativou a empresa.';

-- Índice para filtrar empresas ativas por slug (usado no middleware)
CREATE INDEX IF NOT EXISTS idx_companies_slug_active
  ON public.companies(slug) WHERE is_active = true;
