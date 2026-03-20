-- Path do PDF no bucket company-invoices (ex: company_id/2026-03.pdf)
ALTER TABLE public.company_invoices
  ADD COLUMN IF NOT EXISTS storage_path text;

COMMENT ON COLUMN public.company_invoices.storage_path IS 'Path no bucket company-invoices (company_id/YYYY-MM.pdf)';
