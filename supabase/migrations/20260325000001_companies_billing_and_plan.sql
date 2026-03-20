-- ClicVend – Billing + Plano (Basic R$350, Plus R$600, Extra R$980)
-- Corrige erro "column companies.billing_status does not exist" e adiciona plano.

-- Billing (status de pagamento)
ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS billing_status text DEFAULT 'active';

ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS billing_notes text;

ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS billing_updated_at timestamptz;

-- Plano escolhido (Basic R$350, Plus R$600, Extra R$980)
ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS billing_plan text DEFAULT 'basic';

COMMENT ON COLUMN public.companies.billing_status IS 'Status: active, trial, suspended, cancelled';
COMMENT ON COLUMN public.companies.billing_notes IS 'Observações do admin sobre pagamento';
COMMENT ON COLUMN public.companies.billing_plan IS 'Plano: basic R$350, plus R$600, extra R$980';
