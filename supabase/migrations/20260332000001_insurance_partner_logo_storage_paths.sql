-- Caminhos relativos ao bucket insurance-partner-logos (ficheiros na raiz, nomes reais do upload).
-- O app também usa INSURANCE_LOGO_FILE_BY_SLUG em código; isto alinha a tabela para consultas/admin.

UPDATE public.insurance_partner_catalog SET logo_storage_path = 'porto.png' WHERE slug = 'porto-seguro';
UPDATE public.insurance_partner_catalog SET logo_storage_path = 'Bradesco Seguros.png' WHERE slug = 'bradesco-seguros';
UPDATE public.insurance_partner_catalog SET logo_storage_path = 'itau.png' WHERE slug = 'itau-seguros';
UPDATE public.insurance_partner_catalog SET logo_storage_path = 'Allianz Seguros.png' WHERE slug = 'allianz-seguros';
UPDATE public.insurance_partner_catalog SET logo_storage_path = 'tokio.jpg' WHERE slug = 'tokio-marine';
UPDATE public.insurance_partner_catalog SET logo_storage_path = 'mapfre.png' WHERE slug = 'mapfre';
UPDATE public.insurance_partner_catalog SET logo_storage_path = 'Liberty Seguros.jpg' WHERE slug = 'liberty-seguros';
UPDATE public.insurance_partner_catalog SET logo_storage_path = 'hdiseguros.png' WHERE slug = 'hdi-seguros';
UPDATE public.insurance_partner_catalog SET logo_storage_path = 'zurich.jpg' WHERE slug = 'zurich-brasil';
UPDATE public.insurance_partner_catalog SET logo_storage_path = 'sonpo.png' WHERE slug = 'sompo-seguros';
UPDATE public.insurance_partner_catalog SET logo_storage_path = 'chubblogo.png' WHERE slug = 'chubb-seguros';
