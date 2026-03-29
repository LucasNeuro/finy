-- Configuração do agente Mistral (Conversations API) por empresa: id e versão exibidos no painel.
ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS copilot_mistral_config jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.companies.copilot_mistral_config IS
  'Mistral Copilot: { "agents": [{ "id": "uuid", "agent_id": "ag_...", "agent_version", "prompt", "channel_id", "queue_id" }], "agent_id"?: legado }. Fallback: env MISTRAL_COPILOT_AGENT_ID.';
