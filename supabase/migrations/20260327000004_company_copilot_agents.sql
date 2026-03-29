-- Agentes copilot por empresa (escopo conexão/fila). Provedor externo (ex.: ag_*) fica em external_agent_id.

CREATE TABLE public.company_copilot_agents (
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

CREATE INDEX company_copilot_agents_company_active_idx
  ON public.company_copilot_agents (company_id)
  WHERE is_active = true;
