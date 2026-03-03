-- ClicVend – Configuração de Chatbot e Triggers UAZAPI
-- Tabelas de cache/sincronização por canal (instance) para permitir
-- configuração completa de respostas automáticas na aplicação.

-- ========== CONFIGURAÇÃO GERAL DO CHATBOT POR CANAL ==========

CREATE TABLE IF NOT EXISTS public.channel_chatbot_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id uuid NOT NULL REFERENCES public.channels(id) ON DELETE CASCADE,
  chatbot_enabled boolean DEFAULT false,
  chatbot_ignore_groups boolean DEFAULT true,
  chatbot_stop_word text,
  chatbot_stop_minutes integer DEFAULT 30,
  chatbot_stop_when_send integer DEFAULT 5,
  openai_apikey_encrypted text,
  synced_at timestamptz,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL,
  UNIQUE(channel_id)
);

COMMENT ON TABLE public.channel_chatbot_config IS
  'Cache/sync das configurações de chatbot da instância UAZAPI por canal.';

-- ========== TRIGGERS DO CHATBOT POR CANAL ==========

CREATE TABLE IF NOT EXISTS public.channel_triggers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id uuid NOT NULL REFERENCES public.channels(id) ON DELETE CASCADE,
  uazapi_trigger_id text NOT NULL,
  type text NOT NULL CHECK (type IN ('agent', 'quickreply', 'flow')),
  agent_id text,
  quickreply_id text,
  flow_id text,
  words_to_start text,
  priority integer DEFAULT 0,
  ignore_groups boolean DEFAULT true,
  lead_field text,
  lead_operator text,
  lead_value text,
  response_delay_seconds integer,
  active boolean DEFAULT true,
  synced_at timestamptz,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL,
  UNIQUE(channel_id, uazapi_trigger_id)
);

COMMENT ON TABLE public.channel_triggers IS
  'Triggers de chatbot da UAZAPI (cache por canal para exibição/edição na UI).';

CREATE INDEX IF NOT EXISTS idx_channel_triggers_channel
  ON public.channel_triggers(channel_id, priority DESC, created_at DESC);

-- ========== AGENTES DE IA POR CANAL ==========

CREATE TABLE IF NOT EXISTS public.channel_agents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id uuid NOT NULL REFERENCES public.channels(id) ON DELETE CASCADE,
  uazapi_agent_id text NOT NULL,
  name text NOT NULL,
  provider text,
  model text,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL,
  UNIQUE(channel_id, uazapi_agent_id)
);

COMMENT ON TABLE public.channel_agents IS
  'Agentes de IA da UAZAPI (cache por canal).';

CREATE INDEX IF NOT EXISTS idx_channel_agents_channel
  ON public.channel_agents(channel_id);

-- ========== WEBHOOKS POR CANAL (INSTÂNCIA) ==========

CREATE TABLE IF NOT EXISTS public.channel_webhooks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id uuid NOT NULL REFERENCES public.channels(id) ON DELETE CASCADE,
  uazapi_webhook_id text,
  url text NOT NULL,
  events jsonb DEFAULT '[]'::jsonb,
  exclude_messages jsonb DEFAULT '[]'::jsonb,
  enabled boolean DEFAULT true,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL
);

COMMENT ON TABLE public.channel_webhooks IS
  'Configuração de webhooks por canal (cache da UAZAPI para auditoria/relatórios).';

CREATE INDEX IF NOT EXISTS idx_channel_webhooks_channel
  ON public.channel_webhooks(channel_id);

-- ========== RLS ==========

ALTER TABLE public.channel_chatbot_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.channel_triggers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.channel_agents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.channel_webhooks ENABLE ROW LEVEL SECURITY;

-- Usuário só enxerga/gera registros de canais em empresas nas quais tem perfil.

CREATE POLICY "channel_chatbot_config_all_by_company" ON public.channel_chatbot_config
FOR ALL
USING (
  channel_id IN (
    SELECT id FROM public.channels
    WHERE company_id IN (
      SELECT company_id FROM public.profiles WHERE user_id = auth.uid()
    )
  )
)
WITH CHECK (
  channel_id IN (
    SELECT id FROM public.channels
    WHERE company_id IN (
      SELECT company_id FROM public.profiles WHERE user_id = auth.uid()
    )
  )
);

CREATE POLICY "channel_triggers_all_by_company" ON public.channel_triggers
FOR ALL
USING (
  channel_id IN (
    SELECT id FROM public.channels
    WHERE company_id IN (
      SELECT company_id FROM public.profiles WHERE user_id = auth.uid()
    )
  )
)
WITH CHECK (
  channel_id IN (
    SELECT id FROM public.channels
    WHERE company_id IN (
      SELECT company_id FROM public.profiles WHERE user_id = auth.uid()
    )
  )
);

CREATE POLICY "channel_agents_all_by_company" ON public.channel_agents
FOR ALL
USING (
  channel_id IN (
    SELECT id FROM public.channels
    WHERE company_id IN (
      SELECT company_id FROM public.profiles WHERE user_id = auth.uid()
    )
  )
)
WITH CHECK (
  channel_id IN (
    SELECT id FROM public.channels
    WHERE company_id IN (
      SELECT company_id FROM public.profiles WHERE user_id = auth.uid()
    )
  )
);

CREATE POLICY "channel_webhooks_all_by_company" ON public.channel_webhooks
FOR ALL
USING (
  channel_id IN (
    SELECT id FROM public.channels
    WHERE company_id IN (
      SELECT company_id FROM public.profiles WHERE user_id = auth.uid()
    )
  )
)
WITH CHECK (
  channel_id IN (
    SELECT id FROM public.channels
    WHERE company_id IN (
      SELECT company_id FROM public.profiles WHERE user_id = auth.uid()
    )
  )
);

