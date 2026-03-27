create table if not exists public.insurance_multicalculo_quotes (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  title text not null default 'Simulação',
  status text not null default 'draft' check (status in ('draft', 'calculated', 'proposal_sent', 'archived')),
  insured_data jsonb not null default '{}'::jsonb,
  driver_data jsonb not null default '{}'::jsonb,
  vehicle_data jsonb not null default '{}'::jsonb,
  questionnaire_data jsonb not null default '{}'::jsonb,
  policy_data jsonb not null default '{}'::jsonb,
  coverage_data jsonb not null default '{}'::jsonb,
  services_data jsonb not null default '{}'::jsonb,
  quotes_result jsonb not null default '[]'::jsonb,
  selected_quote jsonb,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists insurance_multicalculo_quotes_company_idx
  on public.insurance_multicalculo_quotes(company_id, created_at desc);
