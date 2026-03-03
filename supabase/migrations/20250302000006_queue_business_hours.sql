-- Horários de atendimento por caixa/fila (ex.: Seg 9h-18h).
-- business_hours: jsonb array of { "day": 0-6 (0=Dom), "open": "HH:mm", "close": "HH:mm" }. Null ou [] = 24/7.

ALTER TABLE public.queues
  ADD COLUMN IF NOT EXISTS business_hours jsonb DEFAULT '[]'::jsonb;

COMMENT ON COLUMN public.queues.business_hours IS
  'Horários de atendimento. Array de { day: 0-6, open: "HH:mm", close: "HH:mm" }. Vazio = 24/7.';
