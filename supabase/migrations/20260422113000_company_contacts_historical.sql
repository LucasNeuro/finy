-- Camada histórica de contatos por empresa (independente do ciclo de vida do canal).
-- Objetivo: não perder contatos da ferramenta quando a conexão/canal for removido.

create table if not exists public.company_contacts (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  source_channel_id uuid references public.channels(id) on delete set null,
  jid text not null,
  phone text,
  contact_name text,
  first_name text,
  avatar_url text,
  last_seen_at timestamptz not null default now(),
  synced_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique(company_id, jid)
);

create index if not exists idx_company_contacts_company
  on public.company_contacts(company_id);

create index if not exists idx_company_contacts_company_phone
  on public.company_contacts(company_id, phone);

create index if not exists idx_company_contacts_source_channel
  on public.company_contacts(source_channel_id);

alter table public.company_contacts enable row level security;

create policy "company_contacts_company"
  on public.company_contacts for all
  using (
    company_id in (
      select company_id from public.profiles where user_id = auth.uid()
    )
  )
  with check (
    company_id in (
      select company_id from public.profiles where user_id = auth.uid()
    )
  );
