-- ClicVend – Repair/ensure invoices table + storage bucket
-- This migration is intentionally idempotent so it can be applied safely
-- even if earlier migrations were skipped in some environments.

begin;

CREATE TABLE IF NOT EXISTS public.company_invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  cora_invoice_id text,
  cora_code text,
  amount_cents int NOT NULL,
  due_date date NOT NULL,
  status text DEFAULT 'OPEN',
  month int NOT NULL,
  year int NOT NULL,
  bank_slip_url text,
  bank_slip_barcode text,
  bank_slip_digitable text,
  pix_emv text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(company_id, month, year)
);

CREATE INDEX IF NOT EXISTS idx_company_invoices_company ON public.company_invoices(company_id);
CREATE INDEX IF NOT EXISTS idx_company_invoices_due ON public.company_invoices(due_date);
CREATE INDEX IF NOT EXISTS idx_company_invoices_status ON public.company_invoices(status);

ALTER TABLE public.company_invoices
  ADD COLUMN IF NOT EXISTS storage_path text;

INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES (
  'company-invoices',
  'company-invoices',
  false,
  10485760 -- 10 MB
)
ON CONFLICT (id) DO NOTHING;

commit;

