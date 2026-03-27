-- ClicVend – Faturas/boletos emitidos via Cora
-- Armazena boletos gerados para cobrança recorrente das empresas.

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

COMMENT ON TABLE public.company_invoices IS 'Boletos emitidos via API Cora para cobrança mensal das empresas';
