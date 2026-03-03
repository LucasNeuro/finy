-- ClicVend – Até 8 caixas de entrada por número (canal)
-- Cada canal pode estar vinculado a até 8 filas (caixas); uma delas é a padrão para novas conversas.
-- channels.queue_id continua sendo a caixa padrão (para o webhook); channel_queues guarda a lista completa.

CREATE TABLE IF NOT EXISTS public.channel_queues (
  channel_id uuid NOT NULL REFERENCES public.channels(id) ON DELETE CASCADE,
  queue_id uuid NOT NULL REFERENCES public.queues(id) ON DELETE CASCADE,
  is_default boolean NOT NULL DEFAULT false,
  created_at timestamptz DEFAULT now() NOT NULL,
  PRIMARY KEY (channel_id, queue_id),
  CONSTRAINT channel_queues_channel_fk CHECK (true)
);

COMMENT ON TABLE public.channel_queues IS
  'Vinculação canal ↔ caixas de entrada (até 8 por canal). is_default = caixa onde caem novas conversas.';

-- Apenas uma caixa padrão por canal
CREATE UNIQUE INDEX IF NOT EXISTS idx_channel_queues_one_default
  ON public.channel_queues (channel_id)
  WHERE is_default = true;

CREATE INDEX IF NOT EXISTS idx_channel_queues_channel ON public.channel_queues(channel_id);
CREATE INDEX IF NOT EXISTS idx_channel_queues_queue ON public.channel_queues(queue_id);

-- Trigger: limitar a 8 caixas por canal
CREATE OR REPLACE FUNCTION check_channel_queues_limit()
RETURNS TRIGGER AS $$
DECLARE
  cnt integer;
BEGIN
  SELECT count(*) INTO cnt
  FROM public.channel_queues
  WHERE channel_id = NEW.channel_id;
  IF cnt >= 8 THEN
    RAISE EXCEPTION 'Canal pode ter no máximo 8 caixas de entrada.';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_channel_queues_limit ON public.channel_queues;
CREATE TRIGGER trg_channel_queues_limit
  BEFORE INSERT ON public.channel_queues
  FOR EACH ROW EXECUTE PROCEDURE check_channel_queues_limit();

-- Backfill: para cada canal que tem queue_id, inserir em channel_queues como padrão
INSERT INTO public.channel_queues (channel_id, queue_id, is_default)
SELECT id, queue_id, true
FROM public.channels
WHERE queue_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.channel_queues cq
    WHERE cq.channel_id = channels.id AND cq.queue_id = channels.queue_id
  )
ON CONFLICT (channel_id, queue_id) DO NOTHING;

-- RLS
ALTER TABLE public.channel_queues ENABLE ROW LEVEL SECURITY;

CREATE POLICY "channel_queues_all_by_company" ON public.channel_queues
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
