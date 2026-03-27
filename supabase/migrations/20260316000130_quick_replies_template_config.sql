begin;

alter table if exists public.quick_replies
  add column if not exists template_config jsonb not null default '{}'::jsonb;

commit;
