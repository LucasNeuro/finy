-- Cargos (roles) por empresa com permissões; atribuição de usuários a caixas (queue_assignments).
-- profiles.role_id aponta para o cargo; mantemos profiles.role por compatibilidade (backfill).

-- Tabela de cargos por empresa
CREATE TABLE IF NOT EXISTS public.roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name text NOT NULL,
  permissions jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(company_id, name)
);

CREATE INDEX IF NOT EXISTS idx_roles_company_id ON public.roles(company_id);
COMMENT ON TABLE public.roles IS 'Cargos da empresa. permissions: array de strings (ex: inbox.read, queues.manage).';

-- Atribuição usuário ↔ caixa (quem pode atender em qual caixa)
CREATE TABLE IF NOT EXISTS public.queue_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  queue_id uuid NOT NULL REFERENCES public.queues(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(queue_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_queue_assignments_company_user ON public.queue_assignments(company_id, user_id);
CREATE INDEX IF NOT EXISTS idx_queue_assignments_queue ON public.queue_assignments(queue_id);
COMMENT ON TABLE public.queue_assignments IS 'Usuários atribuídos a cada caixa (fila). Quem pode receber/ver conversas daquela caixa.';

-- Coluna role_id em profiles (cargo customizado; substitui uso exclusivo de role enum no futuro)
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS role_id uuid REFERENCES public.roles(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.profiles.role_id IS 'Cargo (role) do usuário na empresa. Quando preenchido, permissões vêm daqui; senão usa role legado.';

-- RLS
ALTER TABLE public.roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.queue_assignments ENABLE ROW LEVEL SECURITY;

-- roles: usuário vê/edita apenas cargos da empresa em que tem perfil
CREATE POLICY "roles_select_by_company" ON public.roles FOR SELECT
  USING (company_id IN (SELECT company_id FROM public.profiles WHERE user_id = auth.uid()));
CREATE POLICY "roles_insert_by_company" ON public.roles FOR INSERT
  WITH CHECK (company_id IN (SELECT company_id FROM public.profiles WHERE user_id = auth.uid()));
CREATE POLICY "roles_update_by_company" ON public.roles FOR UPDATE
  USING (company_id IN (SELECT company_id FROM public.profiles WHERE user_id = auth.uid()));
CREATE POLICY "roles_delete_by_company" ON public.roles FOR DELETE
  USING (company_id IN (SELECT company_id FROM public.profiles WHERE user_id = auth.uid()));

-- queue_assignments: usuário vê/edita apenas da sua empresa
CREATE POLICY "queue_assignments_select_by_company" ON public.queue_assignments FOR SELECT
  USING (company_id IN (SELECT company_id FROM public.profiles WHERE user_id = auth.uid()));
CREATE POLICY "queue_assignments_insert_by_company" ON public.queue_assignments FOR INSERT
  WITH CHECK (company_id IN (SELECT company_id FROM public.profiles WHERE user_id = auth.uid()));
CREATE POLICY "queue_assignments_update_by_company" ON public.queue_assignments FOR UPDATE
  USING (company_id IN (SELECT company_id FROM public.profiles WHERE user_id = auth.uid()));
CREATE POLICY "queue_assignments_delete_by_company" ON public.queue_assignments FOR DELETE
  USING (company_id IN (SELECT company_id FROM public.profiles WHERE user_id = auth.uid()));

-- Backfill: criar 3 cargos padrão por empresa e preencher profiles.role_id
INSERT INTO public.roles (company_id, name, permissions)
SELECT DISTINCT company_id, 'Admin', '["inbox.read","inbox.reply","inbox.transfer","inbox.assign","channels.manage","queues.manage","users.manage","reports.view"]'::jsonb
FROM public.profiles
ON CONFLICT (company_id, name) DO NOTHING;

INSERT INTO public.roles (company_id, name, permissions)
SELECT DISTINCT company_id, 'Supervisor', '["inbox.read","inbox.reply","inbox.transfer","inbox.assign","reports.view"]'::jsonb
FROM public.profiles
ON CONFLICT (company_id, name) DO NOTHING;

INSERT INTO public.roles (company_id, name, permissions)
SELECT DISTINCT company_id, 'Atendente', '["inbox.read","inbox.reply","inbox.transfer","inbox.assign"]'::jsonb
FROM public.profiles
ON CONFLICT (company_id, name) DO NOTHING;

UPDATE public.profiles p
SET role_id = r.id
FROM public.roles r
WHERE r.company_id = p.company_id AND r.name = 'Admin' AND p.role = 'admin' AND p.role_id IS NULL;

UPDATE public.profiles p
SET role_id = r.id
FROM public.roles r
WHERE r.company_id = p.company_id AND r.name = 'Supervisor' AND p.role = 'supervisor' AND p.role_id IS NULL;

UPDATE public.profiles p
SET role_id = r.id
FROM public.roles r
WHERE r.company_id = p.company_id AND r.name = 'Atendente' AND p.role = 'agent' AND p.role_id IS NULL;
