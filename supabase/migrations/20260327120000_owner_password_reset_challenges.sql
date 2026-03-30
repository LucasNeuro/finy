-- Desafios de OTP para redefinição de senha do proprietário via WhatsApp (service role apenas).

CREATE TABLE IF NOT EXISTS public.owner_password_reset_challenges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  code_hash text NOT NULL,
  expires_at timestamptz NOT NULL,
  attempts smallint NOT NULL DEFAULT 0,
  consumed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ix_owner_pwd_reset_user_pending
  ON public.owner_password_reset_challenges (user_id, expires_at DESC)
  WHERE consumed_at IS NULL;

COMMENT ON TABLE public.owner_password_reset_challenges IS
  'OTP para reset de senha (owner). Acesso apenas via service role; sem políticas RLS para client.';

ALTER TABLE public.owner_password_reset_challenges ENABLE ROW LEVEL SECURITY;
