-- ClicVend – Campos de billing/mensalidade para painel admin
-- Permite ao dono da plataforma controlar status de pagamento.

ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS billing_status text DEFAULT 'active'
    CHECK (billing_status IN ('active', 'trial', 'suspended', 'cancelled'));

ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS billing_updated_at timestamptz;

ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS billing_notes text;

COMMENT ON COLUMN public.companies.billing_status IS 'Status de pagamento: active, trial, suspended, cancelled';
COMMENT ON COLUMN public.companies.billing_notes IS 'Observações do admin sobre pagamento/mensalidade';
