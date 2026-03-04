-- Atualiza cargos padrão (Admin, Supervisor, Atendente)
-- para garantir o conjunto completo de permissões hoje existentes.
-- Não remove permissões já concedidas; apenas adiciona as que faltam.

DO $$
DECLARE
  admin_perms jsonb := '[
    "inbox.read","inbox.reply","inbox.transfer","inbox.assign","inbox.claim",
    "inbox.close","inbox.reopen","inbox.see_all","inbox.export",
    "channels.view","channels.manage",
    "queues.view","queues.manage",
    "users.view","users.manage",
    "reports.view","reports.export",
    "contacts.view","contacts.manage",
    "quickreplies.view","quickreplies.manage",
    "tags.view","tags.manage",
    "profile.view"
  ]'::jsonb;

  supervisor_perms jsonb := '[
    "inbox.read","inbox.reply","inbox.transfer","inbox.assign","inbox.claim",
    "inbox.close","inbox.reopen","inbox.see_all","inbox.export",
    "channels.view",
    "queues.view",
    "reports.view","reports.export",
    "contacts.view",
    "quickreplies.view",
    "tags.view",
    "profile.view"
  ]'::jsonb;

  agent_perms jsonb := '[
    "inbox.read","inbox.reply","inbox.transfer","inbox.assign","inbox.claim",
    "inbox.close","inbox.reopen",
    "contacts.view",
    "quickreplies.view",
    "tags.view",
    "profile.view"
  ]'::jsonb;

BEGIN
  -- Admin: garante todas as permissões da plataforma.
  UPDATE public.roles r
  SET permissions = (
    SELECT jsonb_agg(DISTINCT value)
    FROM jsonb_array_elements_text(
      COALESCE(r.permissions, '[]'::jsonb) || admin_perms
    ) AS t(value)
  )
  WHERE r.name = 'Admin';

  -- Supervisor: foco em visão geral e atendimento, sem gestão estrutural.
  UPDATE public.roles r
  SET permissions = (
    SELECT jsonb_agg(DISTINCT value)
    FROM jsonb_array_elements_text(
      COALESCE(r.permissions, '[]'::jsonb) || supervisor_perms
    ) AS t(value)
  )
  WHERE r.name = 'Supervisor';

  -- Atendente: foco em atendimento e visão básica de contatos/tags/respostas rápidas.
  UPDATE public.roles r
  SET permissions = (
    SELECT jsonb_agg(DISTINCT value)
    FROM jsonb_array_elements_text(
      COALESCE(r.permissions, '[]'::jsonb) || agent_perms
    ) AS t(value)
  )
  WHERE r.name = 'Atendente';
END
$$;

