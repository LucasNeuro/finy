-- ClicVend – Cobranças de Implantação (taxa única)

CREATE TABLE IF NOT EXISTS public.company_implantations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  cora_invoice_id text,
  due_date date NOT NULL,
  amount_cents int NOT NULL,
  status text DEFAULT 'OPEN',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),

  -- Link/PDF para auditoria e reenvios
  bank_slip_url text,
  pix_emv text,
  storage_path text,

  -- Garantia simples: uma implantação por empresa em uma data.
  UNIQUE(company_id, due_date)
);

CREATE INDEX IF NOT EXISTS idx_company_implantations_company ON public.company_implantations(company_id);
CREATE INDEX IF NOT EXISTS idx_company_implantations_due ON public.company_implantations(due_date);
CREATE INDEX IF NOT EXISTS idx_company_implantations_status ON public.company_implantations(status);

