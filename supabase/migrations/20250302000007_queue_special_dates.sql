-- Datas específicas por caixa: feriados, exceções (aberto/fechado em datas pontuais).
-- special_dates: jsonb array of { "date": "YYYY-MM-DD", "closed": true } ou { "date": "YYYY-MM-DD", "open": "HH:mm", "close": "HH:mm" }.

ALTER TABLE public.queues
  ADD COLUMN IF NOT EXISTS special_dates jsonb DEFAULT '[]'::jsonb;

COMMENT ON COLUMN public.queues.special_dates IS
  'Datas específicas: { date: "YYYY-MM-DD", closed: true } ou { date, open: "HH:mm", close: "HH:mm" }. Sobrescreve business_hours nessa data.';
