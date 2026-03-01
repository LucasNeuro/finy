# ClicVend – Variáveis e schema

Referência das variáveis do **servidor uazapiGO** e do **Supabase**, e do **schema completo** de tabelas para a aplicação funcionar.

---

## 1. Variáveis do servidor uazapiGO (painel)

No painel do **uazapiGO** (ex.: “Conecte seu número”) você tem:

| Variável no painel | Descrição | Uso na aplicação |
|--------------------|-----------|-------------------|
| **Server URL** | Base da API, ex.: `https://clicvend.uazapi.com` | Definir em `UAZAPI_BASE_URL` no `.env.local` |
| **Admin Token** | Token de administrador (criar instância, webhook global, etc.) | Definir em `UAZAPI_ADMIN_TOKEN` para criar instâncias/ configurar webhook pela API |

**Autenticação na API (OpenAPI):**

- Endpoints **normais** (enviar mensagem, status, webhook da instância): header **`token`** = token **da instância** (cada canal/conexão tem o seu; fica em `channels.uazapi_token_encrypted`).
- Endpoints **administrativos** (criar instância, listar instâncias, webhook global): header **`admintoken`** = Admin Token do painel.

Ou seja: o “motor” da aplicação é a **UAZAPI** (servidor uazapiGO); o **Supabase** é o banco (empresas, filas, canais, conversas, mensagens).

---

## 2. Variáveis de ambiente da aplicação (.env.local)

```env
# ========== Supabase ==========
NEXT_PUBLIC_SUPABASE_URL=https://seu-projeto.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=sua-anon-key
SUPABASE_SERVICE_ROLE_KEY=sua-service-role-key

# ========== UAZAPI (servidor uazapiGO) ==========
# Base URL do seu servidor (igual ao "Server URL" do painel, sem barra no final)
UAZAPI_BASE_URL=https://clicvend.uazapi.com

# Token de administrador (igual ao "Admin Token" do painel)
# Usado para criar instâncias e configurar webhook global (quando implementado)
UAZAPI_ADMIN_TOKEN=seu-admin-token-aqui
```

Resumo:

- **Supabase:** URL, anon key e service role (webhook/onboarding usam service role).
- **UAZAPI:** base URL do servidor (ex.: `https://clicvend.uazapi.com`) e admin token para operações administrativas. O token **por canal** (instância) fica no banco em `channels.uazapi_token_encrypted`.
- **OpenCNPJ:** API pública, sem variáveis de ambiente. Usada no onboarding (GET `https://api.opencnpj.org/{CNPJ}`) para preencher dados da empresa; todo o retorno é armazenado em `companies` (campos normais + `opencnpj_raw`).

---

## 3. Schema completo das tabelas (Supabase)

Ordem recomendada de criação: **companies** (initial_schema + migration OpenCNPJ) → **queues** → **profiles** → **channels** → **conversations** → **messages**. RLS e índices estão em `supabase/migrations/20250228000000_initial_schema.sql` e campos OpenCNPJ em `20250228100000_companies_opencnpj.sql`.

### 3.1 companies

| Coluna         | Tipo         | Restrições              | Descrição                    |
|----------------|--------------|--------------------------|------------------------------|
| id             | uuid         | PK, default gen_random_uuid() | Identificador da empresa |
| name           | text         | NOT NULL                 | Nome de exibição (ex.: nome fantasia) |
| slug           | text         | NOT NULL, UNIQUE         | Slug da URL (ex.: demo)       |
| subdomain      | text         | UNIQUE                   | Subdomínio (opcional)         |
| custom_domain  | text         | —                        | Domínio próprio (opcional)    |
| **cnpj**       | text         | UNIQUE                   | CNPJ 14 dígitos (OpenCNPJ)    |
| **razao_social** | text       | —                        | Razão social (OpenCNPJ)      |
| **nome_fantasia** | text      | —                        | Nome fantasia (OpenCNPJ)      |
| **situacao_cadastral** | text | —                  | Ex.: Ativa (OpenCNPJ)        |
| **data_situacao_cadastral** | date | —              | (OpenCNPJ)                   |
| **matriz_filial** | text      | —                        | (OpenCNPJ)                   |
| **data_inicio_atividade** | date | —               | (OpenCNPJ)                   |
| **cnae_principal** | text     | —                        | (OpenCNPJ)                   |
| **cnaes_secundarios** | jsonb  | —                        | (OpenCNPJ)                   |
| **natureza_juridica** | text  | —                        | (OpenCNPJ)                   |
| **logradouro, numero, complemento, bairro, cep, uf, municipio** | text | — | Endereço (OpenCNPJ) |
| **email**      | text         | —                        | E-mail da empresa (OpenCNPJ)  |
| **telefones**  | jsonb        | —                        | Array { ddd, numero, is_fax } (OpenCNPJ) |
| **capital_social, porte_empresa** | text | —               | (OpenCNPJ)                   |
| **opcao_simples, data_opcao_simples, opcao_mei, data_opcao_mei** | text/date | — | Simples/MEI (OpenCNPJ) |
| **qsa**        | jsonb        | —                        | Quadro de sócios (OpenCNPJ)   |
| **opencnpj_raw** | jsonb       | —                        | Resposta completa da API OpenCNPJ |
| created_at     | timestamptz  | NOT NULL, default now()  | Criação                       |
| updated_at     | timestamptz  | NOT NULL, default now()  | Atualização                   |

Campos em negrito são preenchidos no **onboarding em etapas** via API **OpenCNPJ** (GET `https://api.opencnpj.org/{CNPJ}`). No formulário exibem-se apenas dados básicos (CNPJ, razão social, nome fantasia, telefone); **todo o retorno da API é armazenado** (campos normais + `opencnpj_raw`).

### 3.2 queues

| Coluna     | Tipo        | Restrições                    | Descrição           |
|------------|-------------|--------------------------------|---------------------|
| id         | uuid        | PK, default gen_random_uuid() | ID da fila          |
| company_id | uuid        | NOT NULL, FK → companies(id) ON DELETE CASCADE | Empresa |
| name       | text        | NOT NULL                      | Nome da fila         |
| slug       | text        | NOT NULL                      | Slug (ex.: default)  |
| created_at | timestamptz | NOT NULL, default now()       | Criação             |
| updated_at | timestamptz | NOT NULL, default now()       | Atualização         |

- UNIQUE(company_id, slug).

### 3.3 profiles

| Coluna     | Tipo        | Restrições                    | Descrição                    |
|------------|-------------|--------------------------------|------------------------------|
| id         | uuid        | PK, default gen_random_uuid() | ID do perfil                 |
| user_id    | uuid        | NOT NULL, FK → auth.users(id) ON DELETE CASCADE | Usuário Supabase Auth |
| company_id | uuid        | NOT NULL, FK → companies(id) ON DELETE CASCADE  | Empresa |
| role       | text        | NOT NULL, CHECK IN ('admin','supervisor','agent') | Função |
| created_at | timestamptz | NOT NULL, default now()       | Criação                      |
| updated_at | timestamptz | NOT NULL, default now()       | Atualização                  |

- UNIQUE(user_id, company_id).

### 3.4 channels

| Coluna                 | Tipo        | Restrições                    | Descrição                          |
|------------------------|-------------|--------------------------------|------------------------------------|
| id                     | uuid        | PK, default gen_random_uuid() | ID do canal                         |
| company_id             | uuid        | NOT NULL, FK → companies(id) ON DELETE CASCADE | Empresa                    |
| name                   | text        | NOT NULL                      | Nome do canal (ex.: WhatsApp Vendas) |
| uazapi_instance_id     | text        | NOT NULL                      | ID da instância na UAZAPI          |
| uazapi_token_encrypted | text        | —                             | Token da instância (header `token`) |
| queue_id               | uuid        | FK → queues(id) ON DELETE SET NULL | Fila padrão do canal          |
| webhook_secret         | text        | —                             | Segredo para validar webhook (opcional) |
| is_active              | boolean     | NOT NULL, default true        | Canal ativo                        |
| created_at             | timestamptz | NOT NULL, default now()      | Criação                            |
| updated_at             | timestamptz | NOT NULL, default now()      | Atualização                        |

Conexão com UAZAPI: cada canal = uma instância; `uazapi_instance_id` identifica no webhook; `uazapi_token_encrypted` é usado nas chamadas à API (ex.: `/send/text`).

### 3.5 conversations

| Coluna          | Tipo        | Restrições                    | Descrição                    |
|-----------------|-------------|--------------------------------|------------------------------|
| id              | uuid        | PK, default gen_random_uuid() | ID da conversa               |
| company_id      | uuid        | NOT NULL, FK → companies(id) ON DELETE CASCADE | Empresa              |
| channel_id      | uuid        | NOT NULL, FK → channels(id) ON DELETE CASCADE  | Canal                 |
| external_id     | text        | NOT NULL                      | ID no WhatsApp/UAZAPI (ex.: chatId) |
| customer_phone  | text        | NOT NULL                      | Telefone do cliente           |
| customer_name   | text        | —                             | Nome do cliente               |
| queue_id        | uuid        | FK → queues(id) ON DELETE SET NULL | Fila da conversa        |
| assigned_to     | uuid        | FK → auth.users(id) ON DELETE SET NULL | Atendente atribuído   |
| status          | text        | NOT NULL, default 'open'      | open, closed, pending, etc.   |
| last_message_at | timestamptz | NOT NULL, default now()       | Última mensagem                |
| created_at      | timestamptz | NOT NULL, default now()       | Criação                       |
| updated_at      | timestamptz | NOT NULL, default now()       | Atualização                   |

- UNIQUE(channel_id, external_id).
- Índice: (company_id, queue_id, last_message_at DESC) para listagem de conversas.

### 3.6 messages

| Coluna           | Tipo        | Restrições                    | Descrição              |
|------------------|-------------|--------------------------------|------------------------|
| id               | uuid        | PK, default gen_random_uuid() | ID da mensagem         |
| conversation_id  | uuid        | NOT NULL, FK → conversations(id) ON DELETE CASCADE | Conversa   |
| direction        | text        | NOT NULL, CHECK IN ('in','out') | Entrada ou saída     |
| content          | text        | NOT NULL                      | Texto da mensagem      |
| external_id      | text        | —                             | ID da mensagem na UAZAPI |
| sent_at          | timestamptz | NOT NULL, default now()       | Data/hora de envio     |
| created_at       | timestamptz | NOT NULL, default now()       | Criação                |

- Índice: (conversation_id, sent_at) para mensagens por conversa.

---

## 4. Fluxo resumido (UAZAPI + Supabase)

1. **Conexão:** Aplicação usa `UAZAPI_BASE_URL` para falar com o servidor uazapiGO; cada canal tem `uazapi_instance_id` e `uazapi_token_encrypted` no Supabase.
2. **Webhook:** UAZAPI envia eventos (ex.: `messages`) para `POST /api/webhook/uazapi`; o webhook identifica o canal por `instance`, faz upsert em `conversations` e insert em `messages` (com service role quando necessário).
3. **Envio:** Para enviar mensagem, a API lê o token do canal em `channels`, chama `POST {UAZAPI_BASE_URL}/send/text` com header `token` e grava a mensagem em `messages`.
4. **Multi-tenant:** Empresas e dados são isolados por `company_id`; RLS usa `profiles` (user_id + company_id) para permitir acesso apenas às empresas do usuário.

Com essas variáveis (Supabase + UAZAPI) e este schema aplicado no Supabase, a aplicação fica corretamente ligada ao “motor” UAZAPI e ao banco Supabase.
