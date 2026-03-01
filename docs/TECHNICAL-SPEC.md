# Technical Specification  
## Sistema de Atendimento Multi-Empresas (WhatsApp)

**Versão:** 1.0  
**Data:** 2025-02-28  
**Complementa:** `PRD.md`

---

## 1. Stack

| Camada | Tecnologia |
|--------|------------|
| Front-end + API | **Next.js** (App Router), React |
| Banco de dados + Auth | **Supabase** (PostgreSQL, Auth, opcional Realtime) |
| Canal WhatsApp | **uazapi** (API + webhook); spec em `docs/uazapi-openapi-spec (8).yaml` |

---

## 2. Multi-tenancy

### 2.1 Estratégia de “link próprio”

Escolher **uma** das opções:

- **Subdomínio:** `acme.seudominio.com` → empresa identificada pelo subdomínio (`acme`).
- **Path:** `seudominio.com/acme` → empresa identificada pelo primeiro segmento da URL (`acme`).

Recomendação para “cada empresa com seu link”: **subdomínio** (mais comum em SaaS). Path é mais simples de implementar no início (sem DNS wildcard).

### 2.2 Resolução do tenant

- **Subdomínio:** middleware Next.js lê `Host` (ex.: `acme.app.com`), extrai `acme`, busca em `companies` por `subdomain = 'acme'` e obtém `company_id`; injeta em contexto/headers/sessão.
- **Path:** middleware lê primeiro segmento da URL (ex.: `/acme/dashboard` → `acme`), busca por `slug = 'acme'` e obtém `company_id`; idem.

Todas as rotas de API e páginas do painel devem receber o `company_id` (via contexto, cookie de sessão ou header) e **nunca** retornar dados de outra empresa.

### 2.3 Tabela `companies` (tenants)

| Campo | Tipo | Descrição |
|-------|------|-----------|
| id | uuid | PK, default `gen_random_uuid()` |
| name | text | Nome de exibição (ex.: nome fantasia ou razão social) |
| slug | text | Identificador único na URL (path) ou mesmo valor do subdomínio |
| subdomain | text | (Opcional) Se usar subdomínio; único |
| custom_domain | text | (Opcional, v2) Domínio próprio ex.: `atendimento.cliente.com` |
| **cnpj** | text | CNPJ 14 dígitos (único); preenchido via OpenCNPJ no onboarding |
| **razao_social** | text | Razão social (OpenCNPJ) |
| **nome_fantasia** | text | Nome fantasia (OpenCNPJ) |
| **situacao_cadastral** | text | Ex.: Ativa (OpenCNPJ) |
| **data_situacao_cadastral** | date | (OpenCNPJ) |
| **matriz_filial** | text | Matriz/Filial (OpenCNPJ) |
| **data_inicio_atividade** | date | (OpenCNPJ) |
| **cnae_principal** | text | (OpenCNPJ) |
| **cnaes_secundarios** | jsonb | (OpenCNPJ) |
| **natureza_juridica** | text | (OpenCNPJ) |
| **logradouro, numero, complemento, bairro, cep, uf, municipio** | text | Endereço (OpenCNPJ) |
| **email** | text | E-mail da empresa (OpenCNPJ) |
| **telefones** | jsonb | Array de { ddd, numero, is_fax } (OpenCNPJ) |
| **capital_social, porte_empresa** | text | (OpenCNPJ) |
| **opcao_simples, data_opcao_simples, opcao_mei, data_opcao_mei** | text/date | Simples/MEI (OpenCNPJ) |
| **qsa** | jsonb | Quadro de sócios (OpenCNPJ) |
| **opencnpj_raw** | jsonb | Resposta completa da API OpenCNPJ para auditoria e campos futuros |
| created_at | timestamptz | |
| updated_at | timestamptz | |

Índice único em `slug` e em `cnpj` (quando preenchido). Campos OpenCNPJ são preenchidos no onboarding em etapas via API **OpenCNPJ** (GET `https://api.opencnpj.org/{CNPJ}`); no formulário exibem-se apenas **dados básicos** (CNPJ, razão social, nome fantasia, telefone), mas **todo o retorno da API é armazenado** no banco (campos normais + `opencnpj_raw`).

---

## 2.4 Landing page e identidade visual

- **Landing page:** Estrutura e layout iguais à referência do Sistema Licitação, **adaptada ao ClicVend**: hero com proposta de valor, CTAs "Cadastre-se" e "Já tenho conta", seção de funcionalidades (cards), etapas do onboarding (3 passos), métricas (destaque em faixa escura), CTA final "Comece gratuitamente".
- **Cores:** Tons de **azul e cinza** na plataforma (ex.: azul primário #2563EB, cinzas #1E293B, #64748B, #E2E8F0, #F8FAFC). Logo/ícone no mesmo estilo da referência (símbolo tipo play/triângulo), em cinza/azul.
- **Cadastre-se** inicia o **onboarding em etapas** (ver §8).

---

## 3. Modelo de dados (Supabase / PostgreSQL)

### 3.1 Tabelas

**companies** (acima).

**channels** (canais WhatsApp por empresa)

| Campo | Tipo | Descrição |
|-------|------|-----------|
| id | uuid | PK |
| company_id | uuid | FK → companies |
| name | text | Nome exibido (ex.: "WhatsApp Vendas") |
| uazapi_instance_id | text | ID da instância na uazapi (para identificar webhook e chamadas) |
| uazapi_token_encrypted | text | Token da instância (criptografado); usar apenas no backend |
| queue_id | uuid | FK → queues (fila padrão para conversas deste canal) |
| webhook_secret | text | (Opcional) Para validar payload do webhook |
| is_active | boolean | default true |
| created_at, updated_at | timestamptz | |

**queues** (filas / inboxes)

| Campo | Tipo | Descrição |
|-------|------|-----------|
| id | uuid | PK |
| company_id | uuid | FK → companies |
| name | text | Ex.: "Vendas", "Suporte" |
| slug | text | Único por company_id |
| created_at, updated_at | timestamptz | |

**profiles** ou **company_users** (vínculo usuário ↔ empresa e role)

| Campo | Tipo | Descrição |
|-------|------|-----------|
| id | uuid | PK |
| user_id | uuid | FK → auth.users (Supabase Auth) |
| company_id | uuid | FK → companies |
| role | text | 'admin' \| 'supervisor' \| 'agent' |
| created_at, updated_at | timestamptz | |

Índice único (user_id, company_id).

**conversations**

| Campo | Tipo | Descrição |
|-------|------|-----------|
| id | uuid | PK |
| company_id | uuid | FK → companies |
| channel_id | uuid | FK → channels |
| external_id | text | ID no sistema externo (ex.: chatId uazapi); único por channel_id |
| customer_phone | text | Número do cliente (formato normalizado) |
| customer_name | text | (Opcional) Nome do contato |
| queue_id | uuid | FK → queues |
| assigned_to | uuid | FK → auth.users (opcional) |
| status | text | Ex.: 'open', 'pending', 'resolved' |
| last_message_at | timestamptz | Para ordenação na lista |
| created_at, updated_at | timestamptz | |

Índice único (channel_id, external_id). Índice (company_id, queue_id, last_message_at) para listagem.

**messages**

| Campo | Tipo | Descrição |
|-------|------|-----------|
| id | uuid | PK |
| conversation_id | uuid | FK → conversations |
| direction | text | 'in' \| 'out' |
| content | text | Corpo da mensagem |
| external_id | text | (Opcional) ID na uazapi |
| sent_at | timestamptz | |
| created_at | timestamptz | |

Índice (conversation_id, sent_at).

### 3.2 Row Level Security (RLS)

- Habilitar RLS em todas as tabelas que tenham `company_id` (ou que dependam de uma tabela com company_id).
- Políticas baseadas em:
  - `auth.uid()` para saber o usuário logado.
  - Junção com `profiles`/`company_users` para obter `company_id` permitido.
  - Restringir SELECT/INSERT/UPDATE/DELETE para linhas onde `company_id` está na lista de empresas do usuário (e, onde aplicável, apenas para a empresa atual da sessão).

Exemplo conceitual para `conversations`:

- SELECT: usuário pode ver conversas onde `conversations.company_id` = algum `company_id` em `profiles` onde `profiles.user_id = auth.uid()`.
- INSERT/UPDATE: idem, garantindo que `company_id` da conversa seja um dos permitidos.

---

## 4. APIs / Rotas (Next.js)

Base URL da API: `/api`. Todas as rotas (exceto webhook e auth público) devem exigir autenticação e validar `company_id` da sessão.

### 4.1 Webhook (uazapi)

- **POST /api/webhook/uazapi**
  - Recebe eventos da uazapi (ex.: mensagem recebida).
  - **Não** protegido por auth de usuário; validar por token/secret no body ou header se a uazapi enviar.
  - Fluxo: identificar instância (e assim `channel_id` e `company_id`); criar ou atualizar `conversations` por `external_id`; inserir em `messages`; atualizar `last_message_at` e possivelmente `queue_id` do canal.
  - Referência de payload: spec uazapi, seção Webhooks e SSE e schema `WebhookEvent`.

### 4.2 Conversas

- **GET /api/conversations**  
  - Query: `queue_id` (opcional), `status` (opcional), paginação.  
  - Retorna conversas da empresa atual (`company_id` da sessão), ordenadas por `last_message_at`.  
  - Auth obrigatória.

- **GET /api/conversations/[id]**  
  - Detalhe da conversa + lista de mensagens (ordenadas por `sent_at`).  
  - Validar que a conversa pertence à empresa atual.

- **POST /api/conversations/[id]/messages**  
  - Body: `{ "content": "texto" }`.  
  - Backend: envia mensagem via uazapi (usar token do canal da conversa), grava em `messages` com `direction = 'out'`, atualiza `last_message_at` da conversa.  
  - Auth obrigatória; validar empresa e permissão de atendente.

- **PATCH /api/conversations/[id]** (opcional)  
  - Atualizar `assigned_to`, `status`, `queue_id`.  
  - Auth e company_id.

### 4.3 Filas e canais

- **GET /api/queues** – lista filas da empresa.
- **POST /api/queues** – criar fila (admin).
- **GET /api/channels** – lista canais da empresa.
- **POST /api/channels** – criar canal (vincular instância uazapi, fila padrão); admin.

### 4.4 Auth e sessão

- Login/signup via **Supabase Auth** (e-mail/senha).
- Após login: obter empresas do usuário (`profiles`); definir “empresa atual” (primeira ou pela URL/subdomínio).
- Middleware: em toda requisição autenticada, garantir `company_id` no contexto (a partir de subdomínio ou path).

### 4.5 OpenCNPJ (onboarding)

- **GET /api/opencnpj/[cnpj]** (opcional): proxy server-side para `https://api.opencnpj.org/{CNPJ}` para evitar CORS e controlar rate limit. Retorna o JSON da API; o front pode chamar direto a API OpenCNPJ (pública) e enviar os dados no payload do onboarding.
- No onboarding, ao informar CNPJ: buscar dados (via API ou proxy), preencher formulário com dados básicos e persistir em `companies` (incluindo `opencnpj_raw`) ao salvar a etapa.

---

## 5. Fluxo do webhook (detalhe)

1. uazapi envia POST para `https://seu-dominio.com/api/webhook/uazapi` (ou URL por instância, se suportado).
2. Backend lê o payload (ex.: tipo de evento, instância, remetente, mensagem).
3. Identificar **instância** (ex.: por campo no body ou header) → buscar `channels` por `uazapi_instance_id` → obter `channel_id`, `company_id`, `queue_id` (fila padrão do canal).
4. Identificador da conversa externa: ex.: `chatId` ou par (instance_id, remote_jid) → mapear para `external_id` da conversa.
5. Upsert em `conversations`: se não existir, criar com `channel_id`, `company_id`, `queue_id`, `customer_phone`, `external_id`, `status = 'open'`; se existir, atualizar `last_message_at`.
6. Inserir em `messages`: `conversation_id`, `direction = 'in'`, `content`, `sent_at`.
7. Responder 200 OK rapidamente para evitar retentativas desnecessárias.

Consultar `docs/uazapi-openapi-spec (8).yaml` para o formato exato do evento (ex.: `WebhookEvent`, campos de mensagem recebida).

---

## 6. Front-end (painel)

- **Layout:** barra com empresa atual (e se houver múltiplas empresas, seletor ou troca por link).
- **Páginas sugeridas:**
  - Login (redirect para link da empresa se aplicável).
  - Inbox: listagem de conversas por fila (sidebar com filas, lista de conversas, painel de detalhe com thread).
  - Conversa: thread de mensagens + campo para enviar (chama POST `/api/conversations/[id]/messages`).
  - Configurações (canais, filas, usuários) – restrito a admin.
- Dados: fetch em `/api/queues`, `/api/conversations`, `/api/conversations/[id]`; envio via POST para mensagens. Opcional: Supabase Realtime em `conversations` e `messages` para atualização ao vivo.

---

## 7. Segurança

- **Isolamento:** todas as queries filtradas por `company_id`; RLS como segunda barreira.
- **Tokens uazapi:** armazenar criptografados; usar apenas no backend e apenas no contexto do canal/empresa correto.
- **Webhook:** validar origem/assinatura se a uazapi fornecer; não expor dados internos na resposta.
- **Middleware:** em rotas autenticadas, rejeitar se não houver `company_id` válido ou se o usuário não tiver vínculo com essa empresa.

---

## 8. Onboarding de nova empresa (em etapas)

O onboarding é um **formulário em etapas** (5 etapas), inspirado na referência do Sistema Licitação. Integração com a **API OpenCNPJ** para enriquecer dados da empresa.

### 8.1 API OpenCNPJ

- **URL:** `GET https://api.opencnpj.org/{CNPJ}` (CNPJ com ou sem pontuação, 14 dígitos).
- **Uso:** Na **Etapa 1 (Dados da empresa)**, o usuário informa o CNPJ; o front ou um endpoint intermediário chama a API, preenche os campos do formulário com dados básicos (razão social, nome fantasia, telefone, endereço) e o backend **armazena no banco todo o retorno** (campos normais em `companies` + cópia completa em `companies.opencnpj_raw`).
- **No cadastro (formulário):** exibir apenas **dados básicos** (CNPJ, Razão Social, Nome Fantasia, Telefone). Endereço e demais campos podem ser exibidos em etapas seguintes (ex.: Etapa 3 Endereço) ou apenas persistidos a partir do JSON.
- **Autenticação:** API pública, sem chave. Rate limit ~50 req/s por IP.

### 8.2 Etapas do onboarding (5 etapas)

1. **Dados da Empresa (Etapa 1 de 5)**  
   CNPJ obrigatório; ao informar, consultar OpenCNPJ e preencher razão social, nome fantasia, telefone. Persistir em `companies` todos os campos retornados (e `opencnpj_raw`). Gerar `slug` a partir do nome (ou CNPJ sem pontuação) para o link de acesso.

2. **Dados de Acesso (Etapa 2 de 5)**  
   E-mail, cargo (role: admin/supervisor/agent), senha, confirmar senha. Criar usuário no **Supabase Auth** (signUp) ao concluir esta etapa ou ao final do fluxo.

3. **Endereço (Etapa 3 de 5)**  
   Exibir/editar logradouro, número, complemento, bairro, CEP, UF, município (já preenchidos pela OpenCNPJ quando disponíveis). Atualizar `companies`.

4. **Configuração do serviço (Etapa 4 de 5)**  
   Configuração inicial do atendimento: criar fila padrão (ex.: "Padrão"), opcionalmente nome do primeiro canal. Garantir que a empresa tenha ao menos uma fila ao finalizar onboarding.

5. **Informações do Perfil (Etapa 5 de 5)**  
   Confirmação do perfil do primeiro usuário (nome de exibição, cargo). Inserir em `profiles` com `company_id` e `role = 'admin'`.

Ao concluir: criar registro em `companies` (com todos os dados OpenCNPJ e campos extras), usuário em Auth, perfil em `profiles`, fila padrão em `queues`; exibir **link de acesso** `https://seudominio.com/{slug}` e redirecionar para o painel.

### 8.3 Resumo do fluxo

1. Landing → **Cadastre-se** → início do onboarding em etapas.
2. Etapa 1: CNPJ → consulta OpenCNPJ → preencher e salvar dados da empresa (todo o JSON no banco; formulário só dados básicos).
3. Etapas 2–5: acesso (Auth), endereço, configuração (fila padrão), perfil.
4. Fim: link `/{slug}` gerado; usuário vira admin da empresa e pode configurar canais (Conexões).

---

## 9. Ordem de implementação sugerida

1. Projeto Next.js + Supabase; schema SQL (tabelas + migration OpenCNPJ em `companies`) e RLS.
2. **Landing page** (estrutura referência Sistema Licitação, adaptada ClicVend, azul/cinza) com CTAs Cadastre-se / Já tenho conta.
3. **Onboarding em etapas** (5 etapas): integração OpenCNPJ, dados empresa, acesso (Auth), endereço, configuração (fila), perfil; persistir todo retorno OpenCNPJ em `companies`.
4. Auth (login) e tabela de perfis; middleware de resolução de tenant.
5. Webhook uazapi → conversas e mensagens.
6. APIs: conversas, filas, canais.
7. Painel: conversas, chat, configuração (Conexões, filas).
8. Ajustes e testes do fluxo completo (landing → onboarding → link da empresa → configurar canal).

---

*Implementação deve seguir esta spec e o `PRD.md`. Critérios de aceite em `ACCEPTANCE-CRITERIA.md`.*
