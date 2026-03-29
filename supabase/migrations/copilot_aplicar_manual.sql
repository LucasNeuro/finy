-- =============================================================================
-- Copiloto: aplicar manualmente no SQL Editor do Supabase (ordem importa).
-- Depois: atualize o schema local se usar CLI (supabase db pull) ou ignore.
-- =============================================================================

-- --- 20260327000003_companies_copilot_mistral_config.sql ---
ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS copilot_mistral_config jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.companies.copilot_mistral_config IS
  'Mistral Copilot: config legada / metadados. Resolução do agente na conversa prioriza company_copilot_agents.';

-- --- 20260327000004_company_copilot_agents.sql ---
CREATE TABLE IF NOT EXISTS public.company_copilot_agents (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  name text NOT NULL DEFAULT 'Copiloto'::text,
  external_agent_id text NOT NULL,
  agent_version integer NOT NULL DEFAULT 0,
  prompt_extra text NOT NULL DEFAULT ''::text,
  channel_id uuid,
  queue_id uuid,
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT company_copilot_agents_pkey PRIMARY KEY (id),
  CONSTRAINT company_copilot_agents_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE,
  CONSTRAINT company_copilot_agents_channel_id_fkey FOREIGN KEY (channel_id) REFERENCES public.channels(id) ON DELETE SET NULL,
  CONSTRAINT company_copilot_agents_queue_id_fkey FOREIGN KEY (queue_id) REFERENCES public.queues(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS company_copilot_agents_company_active_idx
  ON public.company_copilot_agents (company_id)
  WHERE is_active = true;

-- --- 20260328000001_company_copilot_chat_completions.sql (chat + prompt, sem Agents API) ---
ALTER TABLE public.company_copilot_agents
  ALTER COLUMN external_agent_id DROP NOT NULL;

ALTER TABLE public.company_copilot_agents
  ADD COLUMN IF NOT EXISTS provider_kind text NOT NULL DEFAULT 'mistral_agent';

ALTER TABLE public.company_copilot_agents
  ADD COLUMN IF NOT EXISTS system_instructions text NOT NULL DEFAULT ''::text;

ALTER TABLE public.company_copilot_agents
  ADD COLUMN IF NOT EXISTS completion_model text NOT NULL DEFAULT 'mistral-small-latest'::text;

-- --- 20260327000005_copilot_module_and_role_permissions.sql ---
UPDATE public.companies
SET enabled_modules = COALESCE(enabled_modules, '{}'::jsonb) || jsonb_build_object('copilot', true)
WHERE NOT (enabled_modules ? 'copilot');

UPDATE public.roles
SET permissions = permissions || '["copilot.use"]'::jsonb
WHERE NOT (permissions @> '["copilot.use"]'::jsonb);

UPDATE public.roles
SET permissions = permissions || '["copilot.manage"]'::jsonb
WHERE permissions @> '["users.manage"]'::jsonb
  AND NOT (permissions @> '["copilot.manage"]'::jsonb);
