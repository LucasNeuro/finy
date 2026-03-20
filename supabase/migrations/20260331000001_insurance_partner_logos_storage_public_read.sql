-- Corrige leitura pública dos logos no Storage: <img src=".../object/public/..."> não envia JWT;
-- política só com TO public às vezes não cobre anon. Política com USING (sem TO) aplica a todos os roles.

DROP POLICY IF EXISTS "insurance_partner_logos_public_read" ON storage.objects;

CREATE POLICY "insurance_partner_logos_public_read"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'insurance-partner-logos');

UPDATE storage.buckets SET public = true WHERE id = 'insurance-partner-logos';
