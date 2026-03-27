-- Catálogo de bancos e seguradoras (Multicálculo) + perfis de simulação mock + bucket de logos
--
-- Logos: bucket público `insurance-partner-logos`. Atualize `insurance_partner_catalog.logo_storage_path`
-- com o caminho relativo (ex.: porto-seguro/logo.png). Upload via Supabase Dashboard > Storage ou API.

-- Bucket público
INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('insurance-partner-logos', 'insurance-partner-logos', true, 2097152)
ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.insurance_partner_catalog (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL CHECK (kind IN ('bank', 'insurer')),
  name text NOT NULL,
  segment text NOT NULL DEFAULT '',
  slug text NOT NULL UNIQUE,
  logo_storage_path text,
  sort_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.insurance_partner_mock_simulation (
  partner_id uuid PRIMARY KEY REFERENCES public.insurance_partner_catalog(id) ON DELETE CASCADE,
  price_factor numeric NOT NULL DEFAULT 1,
  coverages_text text NOT NULL,
  discount_label text NOT NULL DEFAULT '8%'
);

CREATE INDEX IF NOT EXISTS insurance_partner_catalog_kind_idx
  ON public.insurance_partner_catalog (kind) WHERE is_active = true;

ALTER TABLE public.insurance_partner_catalog ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.insurance_partner_mock_simulation ENABLE ROW LEVEL SECURITY;

-- Leitura para usuários autenticados (telas do app)
-- DROP antes do CREATE: permite reexecutar o script no SQL Editor sem erro 42710
DROP POLICY IF EXISTS "insurance_partner_catalog_select_auth" ON public.insurance_partner_catalog;
CREATE POLICY "insurance_partner_catalog_select_auth"
  ON public.insurance_partner_catalog FOR SELECT TO authenticated
  USING (is_active = true);

DROP POLICY IF EXISTS "insurance_partner_mock_select_auth" ON public.insurance_partner_mock_simulation;
CREATE POLICY "insurance_partner_mock_select_auth"
  ON public.insurance_partner_mock_simulation FOR SELECT TO authenticated
  USING (true);

-- Storage: leitura pública (bucket public); upload pode ser feito pelo dashboard Supabase ou policy futura para admin
DROP POLICY IF EXISTS "insurance_partner_logos_public_read" ON storage.objects;
CREATE POLICY "insurance_partner_logos_public_read"
  ON storage.objects FOR SELECT TO public
  USING (bucket_id = 'insurance-partner-logos');

-- Seed bancos (sem linha em mock_simulation — uso futuro em formulários)
INSERT INTO public.insurance_partner_catalog (kind, name, segment, slug, sort_order) VALUES
  ('bank', 'Banco do Brasil', 'Público', 'banco-do-brasil', 10),
  ('bank', 'Caixa Econômica Federal', 'Público', 'caixa-economica-federal', 20),
  ('bank', 'Itaú Unibanco', 'Privado', 'itau-unibanco', 30),
  ('bank', 'Bradesco', 'Privado', 'bradesco', 40),
  ('bank', 'Santander Brasil', 'Privado', 'santander-brasil', 50),
  ('bank', 'Banco Safra', 'Privado', 'banco-safra', 60),
  ('bank', 'BTG Pactual', 'Privado', 'btg-pactual', 70),
  ('bank', 'Banco Original', 'Privado', 'banco-original', 80),
  ('bank', 'Banco Inter', 'Digital', 'banco-inter', 90),
  ('bank', 'Nubank', 'Digital', 'nubank', 100),
  ('bank', 'C6 Bank', 'Digital', 'c6-bank', 110),
  ('bank', 'Banco Pan', 'Privado', 'banco-pan', 120),
  ('bank', 'Banco Votorantim', 'Privado', 'banco-votorantim', 130),
  ('bank', 'Banco Pine', 'Privado', 'banco-pine', 140),
  ('bank', 'Banco Mercantil do Brasil', 'Privado', 'banco-mercantil-do-brasil', 150)
ON CONFLICT (slug) DO NOTHING;

-- Seed seguradoras + perfil de simulação (carrossel usa estas)
INSERT INTO public.insurance_partner_catalog (kind, name, segment, slug, sort_order) VALUES
  ('insurer', 'Porto Seguro', 'Privada', 'porto-seguro', 200),
  ('insurer', 'Bradesco Seguros', 'Privada', 'bradesco-seguros', 210),
  ('insurer', 'Itaú Seguros', 'Privada', 'itau-seguros', 220),
  ('insurer', 'SulAmérica', 'Privada', 'sulamerica', 230),
  ('insurer', 'Allianz Seguros', 'Privada', 'allianz-seguros', 240),
  ('insurer', 'Tokio Marine', 'Privada', 'tokio-marine', 250),
  ('insurer', 'Mapfre', 'Privada', 'mapfre', 260),
  ('insurer', 'Liberty Seguros', 'Privada', 'liberty-seguros', 270),
  ('insurer', 'HDI Seguros', 'Privada', 'hdi-seguros', 280),
  ('insurer', 'Zurich Brasil', 'Privada', 'zurich-brasil', 290),
  ('insurer', 'Sompo Seguros', 'Privada', 'sompo-seguros', 300),
  ('insurer', 'Chubb Seguros', 'Privada', 'chubb-seguros', 310),
  ('insurer', 'Marítima Seguros', 'Privada', 'maritima-seguros', 320)
ON CONFLICT (slug) DO NOTHING;

INSERT INTO public.insurance_partner_mock_simulation (partner_id, price_factor, coverages_text, discount_label)
SELECT c.id, v.price_factor, v.coverages_text, v.discount_label
FROM public.insurance_partner_catalog c
JOIN (VALUES
  ('porto-seguro', 1.04::numeric, 'Compreensiva, APP, Vidros, Assistência 24h', '10%'),
  ('bradesco-seguros', 0.98::numeric, 'Compreensiva, RCF, Carro reserva', '7%'),
  ('itau-seguros', 1.01::numeric, 'Compreensiva, APP, Danos morais', '9%'),
  ('sulamerica', 1.06::numeric, 'Compreensiva, Vidros, Despesas extras', '12%'),
  ('allianz-seguros', 1.02::numeric, 'Compreensiva, APP, Assistência premium', '8%'),
  ('tokio-marine', 0.96::numeric, 'Compreensiva, Terceiros ampliado', '5%'),
  ('mapfre', 1.00::numeric, 'Compreensiva, APP, Franquia reduzida', '8%'),
  ('liberty-seguros', 0.99::numeric, 'Compreensiva, RCF elevada', '6%'),
  ('hdi-seguros', 1.03::numeric, 'Compreensiva, APP, Carro reserva', '9%'),
  ('zurich-brasil', 1.05::numeric, 'Compreensiva, Vidros, APP', '11%'),
  ('sompo-seguros', 0.97::numeric, 'Compreensiva, Assistência, Vidros', '6%'),
  ('chubb-seguros', 1.08::numeric, 'Compreensiva premium, APP, RCF', '13%'),
  ('maritima-seguros', 1.00::numeric, 'Compreensiva, APP, Cobertura nacional', '7%')
) AS v(slug, price_factor, coverages_text, discount_label) ON c.slug = v.slug
ON CONFLICT (partner_id) DO NOTHING;
