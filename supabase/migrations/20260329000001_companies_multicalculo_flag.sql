alter table public.companies
add column if not exists multicalculo_seguros_enabled boolean not null default false;
