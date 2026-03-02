-- ClicVend – Tabela de links por empresa com controle ativo/inativo
-- A aplicação só funciona para empresas com link ativo.
-- O slug (link) de cada empresa fica aqui com controle independente.

CREATE TABLE IF NOT EXISTS public.company_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  slug text NOT NULL UNIQUE,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL,
  UNIQUE(company_id)
);

COMMENT ON TABLE public.company_links IS 'Links de acesso por empresa. is_active=false bloqueia acesso à aplicação.';
COMMENT ON COLUMN public.company_links.slug IS 'URL path da empresa (ex: onnze-tecnologia). Usado em /{slug}';
COMMENT ON COLUMN public.company_links.is_active IS 'Link ativo = empresa pode acessar a aplicação. Inativo = bloqueado.';

CREATE INDEX IF NOT EXISTS idx_company_links_slug_active
  ON public.company_links(slug) WHERE is_active = true;

-- Migrar dados existentes de companies para company_links
INSERT INTO public.company_links (company_id, slug, is_active, created_at, updated_at)
SELECT c.id, c.slug, COALESCE(c.is_active, true), c.created_at, c.updated_at
FROM public.companies c
ON CONFLICT (company_id) DO UPDATE SET
  slug = EXCLUDED.slug,
  is_active = EXCLUDED.is_active,
  updated_at = now();

-- Trigger: ao inserir/atualizar company, manter company_links em sync
CREATE OR REPLACE FUNCTION sync_company_links()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.company_links (company_id, slug, is_active, updated_at)
  VALUES (NEW.id, NEW.slug, COALESCE(NEW.is_active, true), now())
  ON CONFLICT (company_id) DO UPDATE SET
    slug = NEW.slug,
    is_active = COALESCE(NEW.is_active, true),
    updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_sync_company_links ON public.companies;
CREATE TRIGGER trg_sync_company_links
  AFTER INSERT OR UPDATE OF slug, is_active ON public.companies
  FOR EACH ROW EXECUTE PROCEDURE sync_company_links();

-- Sincronizar is_active de volta para companies quando company_links for atualizado
CREATE OR REPLACE FUNCTION sync_company_is_active()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE public.companies SET is_active = NEW.is_active, updated_at = now() WHERE id = NEW.company_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_sync_company_is_active ON public.company_links;
CREATE TRIGGER trg_sync_company_is_active
  AFTER UPDATE OF is_active ON public.company_links
  FOR EACH ROW
  WHEN (OLD.is_active IS DISTINCT FROM NEW.is_active)
  EXECUTE PROCEDURE sync_company_is_active();

-- RLS
ALTER TABLE public.company_links ENABLE ROW LEVEL SECURITY;

-- company_links: usuário vê apenas links de empresas em que tem perfil
CREATE POLICY "company_links_select_by_profile" ON public.company_links FOR SELECT
  USING (company_id IN (SELECT company_id FROM public.profiles WHERE user_id = auth.uid()));

-- Apenas admin da empresa pode atualizar (toggle is_active)
CREATE POLICY "company_links_update_by_admin" ON public.company_links FOR UPDATE
  USING (
    company_id IN (
      SELECT company_id FROM public.profiles
      WHERE user_id = auth.uid() AND role = 'admin'
    )
  );
