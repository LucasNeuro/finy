begin;

create table if not exists public.quick_reply_channels (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  quick_reply_id uuid not null references public.quick_replies(id) on delete cascade,
  channel_id uuid not null references public.channels(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (quick_reply_id, channel_id)
);

create index if not exists idx_quick_reply_channels_company_channel
  on public.quick_reply_channels (company_id, channel_id, created_at desc);

commit;
