-- CRM comercial: score, valor estimado na carteira; origem contact_sync (pós-sync de contatos)

ALTER TABLE public.commercial_contact_owners
  ADD COLUMN IF NOT EXISTS lead_score smallint,
  ADD COLUMN IF NOT EXISTS estimated_value_cents bigint;

DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT c.conname
    FROM pg_constraint c
    JOIN pg_class t ON c.conrelid = t.oid
    WHERE t.relname = 'commercial_contact_owners'
      AND c.contype = 'c'
      AND pg_get_constraintdef(c.oid) LIKE '%source%'
  LOOP
    EXECUTE format('ALTER TABLE public.commercial_contact_owners DROP CONSTRAINT %I', r.conname);
  END LOOP;
END $$;

ALTER TABLE public.commercial_contact_owners
  ADD CONSTRAINT commercial_contact_owners_source_check
  CHECK (
    source IN (
      'manual',
      'import',
      'campaign',
      'webhook',
      'round_robin',
      'contact_sync'
    )
  );

ALTER TABLE public.commercial_contact_owners
  DROP CONSTRAINT IF EXISTS commercial_contact_owners_lead_score_check;

ALTER TABLE public.commercial_contact_owners
  ADD CONSTRAINT commercial_contact_owners_lead_score_check
  CHECK (lead_score IS NULL OR (lead_score >= 0 AND lead_score <= 100));

COMMENT ON COLUMN public.commercial_contact_owners.lead_score IS
  'Pontuação 0–100 do lead na carteira (HOT/WARM/COLD derivado no app).';

COMMENT ON COLUMN public.commercial_contact_owners.estimated_value_cents IS
  'Valor estimado do negócio em centavos (opcional).';
