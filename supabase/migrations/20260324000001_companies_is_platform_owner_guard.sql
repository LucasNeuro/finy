-- Garante que is_platform_owner NUNCA seja setado no cadastro.
-- Só pode ser alterado manualmente no Supabase (Table Editor ou SQL).
-- No INSERT, sempre força false. No UPDATE via API, a aplicação não envia esse campo.

-- Garante que a coluna existe (caso a migration 20260323000001 não tenha rodado)
ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS is_platform_owner boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.companies.is_platform_owner IS
  'True apenas para a empresa dona da plataforma. Configurar direto no banco: UPDATE companies SET is_platform_owner = true WHERE slug = ''sua-empresa'';';

CREATE UNIQUE INDEX IF NOT EXISTS idx_companies_one_platform_owner
  ON public.companies ((1))
  WHERE is_platform_owner = true;

CREATE OR REPLACE FUNCTION public.fn_companies_guard_is_platform_owner()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- No cadastro (INSERT): sempre false. Ninguém pode criar empresa já como dona.
  IF TG_OP = 'INSERT' THEN
    NEW.is_platform_owner := false;
  END IF;
  -- No UPDATE: a aplicação não envia is_platform_owner. Alteração só via Supabase Dashboard ou SQL direto.
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_companies_guard_is_platform_owner ON public.companies;
CREATE TRIGGER trg_companies_guard_is_platform_owner
  BEFORE INSERT OR UPDATE OF is_platform_owner
  ON public.companies
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_companies_guard_is_platform_owner();

COMMENT ON FUNCTION public.fn_companies_guard_is_platform_owner() IS
  'No INSERT: força is_platform_owner = false. Só pode ser true se setado manualmente no banco.';
