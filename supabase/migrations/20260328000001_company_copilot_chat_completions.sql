-- Copiloto: modo chat completions (prompt + modelo) sem POST /v1/agents na Mistral.

ALTER TABLE public.company_copilot_agents
  ALTER COLUMN external_agent_id DROP NOT NULL;

ALTER TABLE public.company_copilot_agents
  ADD COLUMN IF NOT EXISTS provider_kind text NOT NULL DEFAULT 'mistral_agent';

ALTER TABLE public.company_copilot_agents
  ADD COLUMN IF NOT EXISTS system_instructions text NOT NULL DEFAULT ''::text;

ALTER TABLE public.company_copilot_agents
  ADD COLUMN IF NOT EXISTS completion_model text NOT NULL DEFAULT 'mistral-small-latest'::text;

COMMENT ON COLUMN public.company_copilot_agents.provider_kind IS 'mistral_agent: Conversations API com external_agent_id. chat_completions: só /v1/chat/completions com system_instructions + completion_model.';
