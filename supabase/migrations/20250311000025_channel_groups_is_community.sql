-- Marcar grupos que são comunidades (criadas via create community).
ALTER TABLE public.channel_groups
  ADD COLUMN IF NOT EXISTS is_community boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_channel_groups_is_community
  ON public.channel_groups(company_id) WHERE is_community = true;
