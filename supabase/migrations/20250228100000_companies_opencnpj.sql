-- ClicVend – Estender companies com dados OpenCNPJ
-- Depende de: 20250228000000_initial_schema.sql
-- API: GET https://api.opencnpj.org/{CNPJ} — armazenamos resposta completa e campos principais para consulta.

-- ========== CAMPOS OPENCNPJ EM companies ==========

-- CNPJ (14 dígitos); único por empresa
ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS cnpj text UNIQUE;

COMMENT ON COLUMN public.companies.cnpj IS 'CNPJ 14 dígitos; preenchido via OpenCNPJ no onboarding';

-- Dados cadastrais principais (preenchidos pela API ou formulário)
ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS razao_social text;
ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS nome_fantasia text;
ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS situacao_cadastral text;
ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS data_situacao_cadastral date;
ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS matriz_filial text;
ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS data_inicio_atividade date;
ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS cnae_principal text;
ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS cnaes_secundarios jsonb;
ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS natureza_juridica text;

-- Endereço
ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS logradouro text;
ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS numero text;
ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS complemento text;
ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS bairro text;
ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS cep text;
ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS uf text;
ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS municipio text;

-- Contato
ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS email text;
ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS telefones jsonb;

-- Outros (Receita)
ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS capital_social text;
ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS porte_empresa text;
ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS opcao_simples text;
ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS data_opcao_simples date;
ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS opcao_mei text;
ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS data_opcao_mei date;
ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS qsa jsonb;

-- Resposta bruta da API (tudo que a API retornar, para auditoria e campos futuros)
ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS opencnpj_raw jsonb;

COMMENT ON COLUMN public.companies.opencnpj_raw IS 'Resposta completa GET https://api.opencnpj.org/{CNPJ}';

-- Índice para busca por CNPJ (já existe UNIQUE em cnpj)
CREATE INDEX IF NOT EXISTS idx_companies_cnpj ON public.companies(cnpj) WHERE cnpj IS NOT NULL;
