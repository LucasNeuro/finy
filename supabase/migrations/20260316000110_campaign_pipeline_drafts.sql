begin;

create table if not exists public.campaign_pipeline_drafts (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  channel_id uuid not null references public.channels(id) on delete cascade,
  name text not null,
  stage text not null default 'draft' check (stage in ('draft', 'segmented', 'scheduled')),
  segment jsonb not null default '{}'::jsonb,
  batching jsonb not null default '{}'::jsonb,
  send_window jsonb not null default '{}'::jsonb,
  snapshot jsonb not null default '{}'::jsonb,
  total_contacts integer not null default 0,
  eligible_contacts integer not null default 0,
  blocked_contacts integer not null default 0,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_campaign_pipeline_drafts_company_channel_created
  on public.campaign_pipeline_drafts (company_id, channel_id, created_at desc);

create index if not exists idx_campaign_pipeline_drafts_company_stage
  on public.campaign_pipeline_drafts (company_id, stage, created_at desc);

commit;
