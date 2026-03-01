# ClicVend

Sistema de atendimento multi-empresas (WhatsApp via uazapi), com link próprio por empresa. Next.js (App Router) + Supabase.

## Configuração

### 1. Variáveis de ambiente

Copie o arquivo de exemplo e preencha com os dados do seu projeto:

```bash
cp .env.local.example .env.local
```

**Supabase** (obrigatório):

- Acesse [Supabase Dashboard](https://supabase.com), crie um projeto e obtenha:
  - **Project URL** → `NEXT_PUBLIC_SUPABASE_URL`
  - **anon public** key → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- Para o webhook que recebe mensagens da uazapi, use **service_role** em `SUPABASE_SERVICE_ROLE_KEY` (apenas no backend; nunca exponha no cliente).

**UAZAPI (servidor uazapiGO):**

- **Server URL** do painel (ex.: `https://clicvend.uazapi.com`) → `UAZAPI_BASE_URL`. Se não definir, o padrão é `https://free.uazapi.com`.
- **Admin Token** do painel → `UAZAPI_ADMIN_TOKEN` (para criar instâncias/configurar webhook pela API, quando implementado).

Referência completa (incluindo schema de tabelas): [docs/VARIABLES-AND-SCHEMA.md](docs/VARIABLES-AND-SCHEMA.md).

### 2. Instalação e execução

```bash
npm install
npm run dev
```

Acesse [http://localhost:3000](http://localhost:3000). Login em `/login`.

### 3. Banco de dados

Execute o schema SQL no Supabase (SQL Editor ou migrations). Veja `docs/TECHNICAL-SPEC.md` e os scripts em `supabase/migrations/` ou `docs/sql/`.

### 4. Webhook uazapi

Para receber mensagens do WhatsApp no painel:

1. **URL do webhook:** `https://seu-dominio.com/api/webhook/uazapi` (em desenvolvimento: use um túnel como ngrok e configure essa URL na uazapi).
2. Na uazapi, por instância: configure o webhook com a URL acima e evento `messages`.
3. No ClicVend, cadastre um canal (Conexões) com o mesmo **ID da instância** uazapi e uma fila padrão.
4. **Teste:** envie uma mensagem do WhatsApp para o número conectado à instância; em até alguns segundos a conversa deve aparecer em `/[slug]/conversas` com a mensagem na thread.
5. O webhook responde **200 OK** para eventos processados ou ignorados; erros de payload retornam 400.

## Documentação

- [PRD](docs/PRD.md) – requisitos do produto  
- [Technical Spec](docs/TECHNICAL-SPEC.md) – arquitetura e modelo de dados  
- [Design System](docs/DESIGN-SYSTEM.md) – UI ClicVend (base digisac)  
- [Implementation Plan](docs/IMPLEMENTATION-PLAN.md) – fases de implementação  
- [Tarefas completas](docs/IMPLEMENTATION-TASKS-FULL.md) – checklist Fases 0 a 7  

## Multi-tenant

Empresa identificada por **path**: `/[slug]/...` (ex.: `/demo/conversas`). Decisão registrada em `docs/decisions.md`.
