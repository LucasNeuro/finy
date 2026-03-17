-- Agendamento de pipelines de broadcast via pg_cron + pg_net (Supabase).
-- Chama a Edge Function broadcast-pipelines-cron a cada minuto.
--
-- PRÉ-REQUISITOS:
-- 1. Habilitar pg_cron e pg_net no Supabase Dashboard: Integrations > Cron Postgres Module
-- 2. Fazer deploy da Edge Function: supabase functions deploy broadcast-pipelines-cron
-- 3. Configurar secrets na Edge Function (Dashboard > Edge Functions > broadcast-pipelines-cron > Secrets):
--    - UAZAPI_BASE_URL: https://clicvend.uazapi.com (ou sua URL UAZAPI)
--    - CRON_SECRET: 8f3a9c2e1b7d4f6a0e5c8b9d2a1f4e7c (ou seu secret)
-- 4. Criar os secrets no Vault (execute no SQL Editor antes de rodar esta migration):
--
--    SELECT vault.create_secret('https://xrzhxzmcleacacitbjqn.supabase.co', 'broadcast_cron_supabase_url');
--    SELECT vault.create_secret('8f3a9c2e1b7d4f6a0e5c8b9d2a1f4e7c', 'broadcast_cron_secret');
--
--    (Substitua pela URL do seu projeto Supabase e pelo secret real.)

-- Garantir que as extensões existam (podem precisar ser habilitadas no Dashboard)
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- Remover job antigo se existir (para idempotência)
DO $$
BEGIN
  PERFORM cron.unschedule('broadcast-pipelines-cron');
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

-- Agendar: a cada minuto, chama a Edge Function broadcast-pipelines-cron
SELECT cron.schedule(
  'broadcast-pipelines-cron',
  '* * * * *',
  $$
  SELECT net.http_post(
    url := (
      SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'broadcast_cron_supabase_url'
    ) || '/functions/v1/broadcast-pipelines-cron',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'broadcast_cron_secret')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  ) AS request_id;
  $$
);
