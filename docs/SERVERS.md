# Servers (APIs e Edge Function)

Documentação de todos os endpoints de backend do Finy: **Next.js API Routes** e **Supabase Edge Function**.

---

## 1. Next.js API Routes (Base: `/api`)

Todas as rotas (exceto webhook e onboarding) exigem **autenticação** e **company_id** em cookie (`clicvend_company_id`). O middleware define o tenant pelo slug da URL.

### 1.1 Webhook UAZAPI (público)

| Método | Caminho | Auth | Descrição |
|--------|---------|------|-----------|
| **POST** | `/api/webhook/uazapi` | Não | Recebe eventos da UAZAPI (ex.: `messages`). Identifica instância → canal → empresa; faz upsert em `conversations` e insert em `messages`. Responder 200 rápido. |

- **Body (exemplo):** `{ event, instance, data: { chatId, from, text, fromMe, ... } }`
- Só processa `event === "messages"` e `!data.fromMe`.
- Implementação: `src/app/api/webhook/uazapi/route.ts`

---

### 1.2 Conversas

| Método | Caminho | Auth | Descrição |
|--------|---------|------|-----------|
| **GET** | `/api/conversations` | Sim | Lista conversas da empresa. Query: `queue_id`, `status`, `limit`, `offset`. Ordenação por `last_message_at` desc. |
| **GET** | `/api/conversations/[id]` | Sim | Detalhe da conversa + mensagens (ordenadas por `sent_at`). |
| **PATCH** | `/api/conversations/[id]` | Sim | Atualiza `assigned_to`, `status`, `queue_id`. Body: `{ assigned_to?, status?, queue_id? }`. |
| **POST** | `/api/conversations/[id]/messages` | Sim | Envia mensagem: body `{ content }`. Envia via UAZAPI (token do canal), grava em `messages` com `direction: 'out'`, atualiza `last_message_at`. |

- Implementações: `src/app/api/conversations/route.ts`, `src/app/api/conversations/[id]/route.ts`, `src/app/api/conversations/[id]/messages/route.ts`

---

### 1.3 Filas (queues)

| Método | Caminho | Auth | Descrição |
|--------|---------|------|-----------|
| **GET** | `/api/queues` | Sim | Lista filas da empresa. |
| **POST** | `/api/queues` | Sim (admin) | Cria fila. Body: `{ name, slug }`. |

- Implementação: `src/app/api/queues/route.ts`

---

### 1.4 Canais (channels)

| Método | Caminho | Auth | Descrição |
|--------|---------|------|-----------|
| **GET** | `/api/channels` | Sim | Lista canais da empresa. |
| **POST** | `/api/channels` | Sim (admin) | Cria canal. Body: `{ name, uazapi_instance_id, uazapi_token_encrypted?, queue_id? }`. |

- Implementação: `src/app/api/channels/route.ts`

---

### 1.5 OpenCNPJ (proxy)

| Método | Caminho | Auth | Descrição |
|--------|---------|------|-----------|
| **GET** | `/api/opencnpj/[cnpj]` | Não | Proxy para `https://api.opencnpj.org/{CNPJ}`. CNPJ com ou sem pontuação (14 dígitos). Retorna JSON da API; usado no onboarding. |

- Implementação: `src/app/api/opencnpj/[cnpj]/route.ts`

---

### 1.6 Onboarding

| Método | Caminho | Auth | Descrição |
|--------|---------|------|-----------|
| **POST** | `/api/onboarding` | Sim (usuário logado) | Cria empresa + perfil admin + fila padrão. Body: dados da empresa (name, slug, cnpj, razao_social, nome_fantasia, endereço, email, telefones, opencnpj_raw, queue_name). Retorna `{ company, queue }`. |

- Implementação: `src/app/api/onboarding/route.ts`

---

### 1.7 UAZAPI – instância e webhook

| Método | Caminho | Auth | Descrição |
|--------|---------|------|-----------|
| **POST** | `/api/uazapi/instance` | Sim (admin) | Cria instância na UAZAPI. Body: `{ name, createChannel?, queue_id? }`. Se `createChannel`, cria canal na empresa com token. |
| **POST** | `/api/uazapi/instance/connect` | Sim | Inicia conexão (QR/pareamento). Body: `{ token }` ou `{ channel_id, phone? }`. |
| **GET** | `/api/uazapi/instance/status` | Sim | Status da instância. Query: `token` ou `channel_id`. Retorna qrcode, paircode, connected, loggedIn. |
| **POST** | `/api/uazapi/webhook` | Sim | Configura webhook **da instância** para `{origin}/api/webhook/uazapi`. Body: `{ channel_id }` ou `{ token }`. |
| **GET** | `/api/uazapi/global-webhook` | Sim | Retorna configuração atual do webhook global (UAZAPI admin). |
| **POST** | `/api/uazapi/global-webhook` | Sim | Configura webhook **global** no servidor UAZAPI. Usa `UAZAPI_WEBHOOK_URL` ou URL do Next.js. |

- Implementações: `src/app/api/uazapi/instance/route.ts`, `instance/connect/route.ts`, `instance/status/route.ts`, `webhook/route.ts`, `global-webhook/route.ts`

---

## 2. Supabase Edge Function

### 2.1 uazapi-webhook

- **Caminho:** `https://<PROJECT_REF>.supabase.co/functions/v1/uazapi-webhook`
- **Método:** POST
- **Auth:** Não (webhook chamado pela UAZAPI)
- **Uso:** Receptor alternativo ao Next.js para o webhook global. Configure no painel UAZAPI esta URL em vez de `/api/webhook/uazapi` quando quiser usar a Edge Function (ex.: para evitar timeout ou rodar na borda).
- **Payload:** Igual ao POST `/api/webhook/uazapi`: `{ event, instance, data }`. Processa apenas `event === "messages"` e `!data.fromMe`; upsert em `conversations`, insert em `messages` usando Service Role.
- **Arquivo:** `supabase/functions/uazapi-webhook/index.ts`

**Variáveis de ambiente (Supabase):** `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` (já definidas no projeto).

---

## 3. Resumo rápido

| Tipo | Quantidade | Observação |
|------|------------|------------|
| Next.js API Routes | 13 arquivos (vários métodos) | Webhook público; demais com auth + company_id |
| Supabase Edge Function | 1 (uazapi-webhook) | Opcional; mesma lógica do webhook Next.js |

Todos os servers listados estão implementados e alinhados ao `TECHNICAL-SPEC.md`.
