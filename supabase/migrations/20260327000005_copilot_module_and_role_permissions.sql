-- Módulo Copiloto em enabled_modules (default true quando a chave não existir no app; aqui preenchemos só quem não tem a chave).
UPDATE public.companies
SET enabled_modules = COALESCE(enabled_modules, '{}'::jsonb) || jsonb_build_object('copilot', true)
WHERE NOT (enabled_modules ? 'copilot');

-- Permissões: quem já podia usar o inbox ganha uso do copiloto; quem geria usuários ganha gerir copiloto.
UPDATE public.roles
SET permissions = permissions || '["copilot.use"]'::jsonb
WHERE NOT (permissions @> '["copilot.use"]'::jsonb);

UPDATE public.roles
SET permissions = permissions || '["copilot.manage"]'::jsonb
WHERE permissions @> '["users.manage"]'::jsonb
  AND NOT (permissions @> '["copilot.manage"]'::jsonb);
