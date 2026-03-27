begin;

alter table if exists public.quick_replies
  add column if not exists template_category text not null default 'general';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'quick_replies_template_category_check'
  ) then
    alter table public.quick_replies
      add constraint quick_replies_template_category_check
      check (template_category in ('general', 'consent', 'campaign'));
  end if;
end $$;

create index if not exists idx_quick_replies_company_template_category
  on public.quick_replies (company_id, template_category, updated_at desc);

commit;
