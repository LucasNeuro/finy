# Configuração: Secrets e variáveis para webhook global e conexões

Guia para fazer tudo funcionar após o deploy da Edge Function no Supabase: empresas conectarem números, criarem instâncias e receberem mensagens via webhook global.

---

## 1. Supabase – Secrets da Edge Function

A função **`uazapi-webhook`** usa apenas:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

O Supabase **já injeta** essas duas variáveis em todas as Edge Functions do projeto. **Você não precisa configurar nenhum secret** no painel (Project Settings → Edge Functions → Secrets) para essa função funcionar.

Resumo: **nenhum secret obrigatório no Supabase** para o webhook global.

---

## 2. App Next.js (Vercel / .env) – Para as empresas conectarem números

Para a API do app conseguir criar instâncias, conectar números e usar o webhook global, configure estas variáveis no **ambiente do Next.js** (Vercel, Render, ou arquivo `.env` local). Ver também **Deploy no Render**: `docs/DEPLOY-RENDER.md`.

| Variável | Obrigatório | Descrição |
|----------|-------------|-----------|
| `NEXT_PUBLIC_SUPABASE_URL` | Sim | URL do projeto (ex: `https://xxxx.supabase.co`) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Sim | Chave anon do Supabase (Settings → API) |
| `SUPABASE_SERVICE_ROLE_KEY` | Sim | Chave service_role (backend/API routes) |
| `UAZAPI_BASE_URL` | Sim | URL do servidor UAZAPI (ex: `https://clicvend.uazapi.com`) |
| `UAZAPI_ADMIN_TOKEN` | Sim | Admin Token do painel uazapiGO (mesmo servidor) |
| `UAZAPI_WEBHOOK_URL` | Recomendado | URL da Edge Function para webhook global (veja abaixo) |
| `NEXT_PUBLIC_APP_URL` | Recomendado em produção | URL pública do app (ex: `https://app.seudominio.com`) |

### UAZAPI_WEBHOOK_URL (webhook global)

Para usar a Edge Function como receptor do webhook global:

```env
UAZAPI_WEBHOOK_URL=https://SEU_PROJETO_REF.supabase.co/functions/v1/uazapi-webhook
```

Substitua `SEU_PROJETO_REF` pelo **Reference ID** do projeto (Supabase → Settings → General).

Sem essa variável, o app usa a URL do Next.js (`/api/webhook/uazapi`) ao configurar o webhook global.

---

## 3. Fluxo completo para as empresas

1. **Deploy da Edge Function** (uma vez):
   ```bash
   supabase functions deploy uazapi-webhook
   ```

2. **Configurar variáveis do app** (acima) no Vercel ou no `.env`.

3. **Configurar webhook global no UAZAPI** (uma vez por servidor):
   - No app: tela **Conexões** → botão **Webhook global**, ou
   - No painel uazapiGO: Webhooks → Webhook Global → URL = `https://SEU_REF.supabase.co/functions/v1/uazapi-webhook`, Events = `messages`, `connection`, Exclude = `wasSentByApi`.

4. **Empresas** usam o app para:
   - Criar conexão WhatsApp (cria instância + canal no Supabase),
   - Escanear QR / código de pareamento,
   - A partir daí, mensagens recebidas vão para a Edge Function → Supabase (conversas e mensagens).

---

## 4. Resumo rápido

| Onde | O que configurar |
|------|-------------------|
| **Supabase → Edge Function secrets** | Nada (SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY já vêm automáticos) |
| **Vercel / Render / .env do app** | NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY, UAZAPI_BASE_URL, UAZAPI_ADMIN_TOKEN, UAZAPI_WEBHOOK_URL (recomendado), NEXT_PUBLIC_APP_URL |

Com isso, as empresas podem conectar números, criar instâncias e usar todas as funções da API (criar canal, conectar, receber mensagens via webhook global).
