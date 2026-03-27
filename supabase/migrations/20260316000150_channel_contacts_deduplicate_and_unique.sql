-- Remove duplicidades em channel_contacts e adiciona trava única por canal+jid.
-- Objetivo: impedir qualquer criação futura de contato duplicado.

-- 1) Normaliza jid para minúsculo
update public.channel_contacts
set jid = lower(trim(jid))
where jid is not null
  and jid <> lower(trim(jid));

-- 2) Preenche jid em formato canônico quando possível (digits@s.whatsapp.net)
with base as (
  select
    id,
    regexp_replace(coalesce(phone, split_part(jid, '@', 1)), '\D', '', 'g') as digits_raw
  from public.channel_contacts
),
norm as (
  select
    id,
    case
      when digits_raw = '' then null
      when length(digits_raw) in (10, 11) then '55' || digits_raw
      when length(digits_raw) in (12, 13) and left(digits_raw, 2) = '55' then digits_raw
      else digits_raw
    end as digits_norm
  from base
)
update public.channel_contacts c
set
  phone = coalesce(n.digits_norm, c.phone),
  jid = case
    when n.digits_norm is not null then n.digits_norm || '@s.whatsapp.net'
    else lower(trim(c.jid))
  end
from norm n
where c.id = n.id;

-- 3) Deduplica por chave canônica (company_id + channel_id + phone/jid normalizado)
with ranked as (
  select
    c.id,
    row_number() over (
      partition by
        c.company_id,
        c.channel_id,
        coalesce(
          nullif(regexp_replace(coalesce(c.phone, split_part(c.jid, '@', 1)), '\D', '', 'g'), ''),
          lower(trim(c.jid))
        )
      order by
        (c.opt_out_at is not null) desc,
        (c.opt_in_at is not null) desc,
        (coalesce(c.contact_name, '') <> '') desc,
        (coalesce(c.first_name, '') <> '') desc,
        (coalesce(c.avatar_url, '') <> '') desc,
        c.synced_at desc,
        c.created_at desc,
        c.id desc
    ) as rn
  from public.channel_contacts c
)
delete from public.channel_contacts c
using ranked r
where c.id = r.id
  and r.rn > 1;

-- 3.1) Deduplica novamente por chave exata que será usada no índice único (channel_id + jid)
-- Mantém o melhor registro e remove os demais.
with ranked_jid as (
  select
    c.id,
    c.channel_id,
    c.jid,
    row_number() over (
      partition by c.channel_id, c.jid
      order by
        (c.opt_out_at is not null) desc,
        (c.opt_in_at is not null) desc,
        (coalesce(c.contact_name, '') <> '') desc,
        (coalesce(c.first_name, '') <> '') desc,
        (coalesce(c.avatar_url, '') <> '') desc,
        c.synced_at desc,
        c.created_at desc,
        c.id desc
    ) as rn
  from public.channel_contacts c
),
to_drop as (
  select id
  from ranked_jid
  where rn > 1
)
delete from public.channel_contacts c
using to_drop d
where c.id = d.id;

-- 4) Trava definitiva para impedir duplicidade por jid no mesmo canal
create unique index if not exists ux_channel_contacts_channel_jid
  on public.channel_contacts (channel_id, jid);

-- 5) Índice de suporte para buscas por company+channel+phone
create index if not exists ix_channel_contacts_company_channel_phone
  on public.channel_contacts (company_id, channel_id, phone);
