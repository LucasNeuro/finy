-- Campos de consentimento para campanhas em channel_contacts
-- Regras:
-- - opt_in_at preenchido + opt_out_at nulo => contato apto para campanhas
-- - opt_out_at preenchido => bloqueado para campanhas

begin;

alter table if exists public.channel_contacts
  add column if not exists opt_in_at timestamptz null,
  add column if not exists opt_in_source text null,
  add column if not exists opt_in_evidence jsonb null,
  add column if not exists opt_out_at timestamptz null,
  add column if not exists opt_out_reason text null;

create index if not exists idx_channel_contacts_campaign_consent
  on public.channel_contacts (company_id, channel_id, opt_in_at, opt_out_at);

commit;
