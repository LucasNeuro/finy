# Deploy da aplicação no Render

Guia para subir o app Next.js (finy/clicvend) no Render como **Web Service** (SSR + API routes).

---

## 1. Pré-requisitos

- Conta no [Render](https://render.com)
- Repositório do projeto no GitHub ou GitLab (conectado ao Render)
- Supabase e UAZAPI já configurados (ver `CONFIGURACAO-WEBHOOK-E-ENV.md`)

---

## 2. Criar o Web Service no Render

1. **Dashboard** → **New +** → **Web Service**.

2. **Connect** o repositório (GitHub/GitLab) e selecione o repositório do projeto.

3. **Configurações do serviço**

   | Campo | Valor |
   |-------|--------|
   | **Name** | Ex: `finy` ou `clicvend` |
   | **Region** | Escolha a mais próxima dos usuários |
   | **Branch** | `main` (ou a branch que quiser) |
   | **Runtime** | **Node** |
   | **Build Command** | `npm install && npm run build` |
   | **Start Command** | `npm run start` |
   | **Instance Type** | Free ou Paid (conforme plano) |

4. **Node version (recomendado)**  
   Em **Environment** (Environment Variables), adicione:
   - **Key:** `NODE_VERSION`  
   - **Value:** `20`  
   Assim o Render usa Node 20 para build e run (Next.js 14 funciona bem com Node 20).

---

## 3. Variáveis de ambiente

Em **Environment** (Environment Variables) do Web Service, adicione as mesmas variáveis do `.env`:

| Key | Value (exemplo) |
|-----|------------------|
| `NEXT_PUBLIC_SUPABASE_URL` | `https://seu-projeto.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | `eyJ...` |
| `SUPABASE_SERVICE_ROLE_KEY` | `eyJ...` |
| `UAZAPI_BASE_URL` | `https://clicvend.uazapi.com` |
| `UAZAPI_ADMIN_TOKEN` | seu admin token |
| `UAZAPI_WEBHOOK_URL` | (opcional) URL da Edge Function, se usar |
| `NEXT_PUBLIC_APP_URL` | **URL do app no Render** (ex: `https://clicvend.onrender.com`) |
| **`APP_URL`** | **Mesma URL do app** (ex: `https://clicvend.onrender.com`) — usada pelo webhook para chamar sync de histórico ao conectar |
| **`INTERNAL_SYNC_SECRET`** | **Senha secreta** (ex: string longa aleatória) — autentica a chamada interna de sync (só o servidor deve saber) |

**Importante:** depois do primeiro deploy, o Render mostra a URL do serviço (ex: `https://clicvend.onrender.com`). Use essa URL em `NEXT_PUBLIC_APP_URL` e em `APP_URL`.

### Redis: não use no Render (recomendado)

**Filas, conversas e distribuição são 100% controlados pelo Supabase.** O Redis no projeto é só cache opcional (lista de conversas e webhook). Não é necessário para nada funcionar.

Para **evitar o erro** `getaddrinfo ENOTFOUND redis-...` no Render:

- **Não adicione** nenhuma variável `REDIS_*` no Environment do Render, **ou**
- Se já tiver `REDIS_URL` / `REDIS_HOST` lá, adicione **`USE_REDIS`** = **`false`** (assim o app não tenta conectar).

Sem Redis, o app usa só Supabase e tudo segue funcionando (listagem, webhook, filas, atribuições).

Se no futuro quiser ativar Redis (ex.: Redis Labs acessível), use **`USE_REDIS`** = **`true`** e uma **`REDIS_URL`** válida no formato `redis://usuario:senha@host:porta` (host **sem** porta no meio, ex.: `redis://default:xxx@redis-15295.c98.us-east-1-4.ec2.cloud.redislabs.com:15295`).

1. No **Dashboard** do Render, abra o **Web Service** do projeto (ex.: clicvend).
2. No menu lateral, clique em **Environment**.
3. Clique em **Add Environment Variable**.
4. Adicione cada variável:
   - **Key:** `APP_URL`  
     **Value:** `https://clicvend.onrender.com` (troque pelo seu URL real).
   - **Key:** `INTERNAL_SYNC_SECRET`  
     **Value:** use um valor gerado como abaixo (não compartilhe essa chave).
   - **Não adicione** variáveis Redis no Render (ou defina `USE_REDIS=false` para evitar erros de conexão).
5. Clique em **Save Changes**. O Render pode fazer um **redeploy automático**; se não, use **Manual Deploy** para aplicar.

Com `APP_URL` e `INTERNAL_SYNC_SECRET` definidos, quando a UAZAPI envia o evento de **conexão** (WhatsApp conectado), o webhook dispara a sincronização do histórico em background e as conversas antigas passam a aparecer sem o usuário clicar em "Sincronizar histórico".

### Como gerar o INTERNAL_SYNC_SECRET

Gere uma string aleatória de 64 caracteres (hex). **Não** coloque no código nem no Git; use só nas variáveis de ambiente do Render.

**Com Node (funciona em qualquer OS, inclusive Windows):**
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

**Com OpenSSL (se tiver instalado):**
```bash
openssl rand -hex 32
```

Copie a saída e cole no **Value** de `INTERNAL_SYNC_SECRET` no Render. Para gerar outro valor no futuro, rode o comando de novo.

---

## 4. Banco de dados (migrations)

Para a aplicação funcionar corretamente (conversas, mensagens, filas, contatos), as tabelas do Supabase precisam estar atualizadas. **Rode as migrations** antes ou logo após o primeiro deploy:

- **Supabase CLI (recomendado):** na raiz do projeto: `npx supabase db push` (ou `supabase db push` se tiver o CLI instalado).
- **Dashboard Supabase:** em **SQL Editor**, execute na ordem os arquivos em `supabase/migrations/` (cada arquivo `.sql` uma vez).

Se você não alterou nenhuma tabela manualmente, não é obrigatório rodar nada novo no banco para as funcionalidades atuais (lista de conversas, abas, contatos, chat). Só aplique as migrations que ainda não foram aplicadas no seu projeto.

---

## 5. Deploy

- Clique em **Create Web Service**. O Render vai rodar `npm install && npm run build` e depois `npm run start`.
- O app fica disponível em `https://SEU-SERVICO.onrender.com` (ou no domínio customizado que configurar).

---

## 6. Domínio customizado (opcional)

Em **Settings** do Web Service → **Custom Domains** → **Add Custom Domain**. Informe o domínio (ex: `app.seudominio.com`) e configure o CNAME no seu DNS apontando para o endereço que o Render indicar. Depois defina `NEXT_PUBLIC_APP_URL=https://app.seudominio.com`.

---

## 7. Resumo

| Item | Configuração |
|------|--------------|
| Tipo | Web Service (Node) |
| Build | `npm install && npm run build` |
| Start | `npm run start` |
| Node | Recomendado: `NODE_VERSION=20` |
| Env | Todas as variáveis do `.env` (Supabase, UAZAPI, APP_URL, INTERNAL_SYNC_SECRET, Redis) com a URL final do app |

A Edge Function continua no Supabase; apenas o app Next.js roda no Render. O webhook global da UAZAPI deve apontar para a URL da Edge Function (não para a URL do Render).

---

## 8. Performance e travamentos

### Cold start (plano Free)

No **Free tier**, o Render desliga o serviço após ~15 min sem requisições. A primeira requisição depois disso pode levar **30s–1min** (cold start). Para ferramenta de atendimento isso gera “travamento” na primeira carga.

- **Solução recomendada:** plano **Starter** (pago) ou usar **cron job** externo (ex.: UptimeRobot) para chamar a URL do app a cada 5–10 min e evitar o sleep.
- Com Redis ativo (`USE_REDIS=true` + `REDIS_URL`), lista e detalhe de conversas usam cache; a primeira leitura após cold start continua indo ao banco, mas as seguintes ficam rápidas.

### Cache (Redis) e estado

- **Lista de conversas:** cache em Redis com TTL de 30s; primeiro request preenche o cache, os próximos leem do Redis.
- **Detalhe da conversa (chat):** cache com TTL 60s; ao abrir o chat a resposta pode vir do cache.
- No frontend, **permissões** e **conversa** usam SWR com `dedupingInterval` alto (2 min para permissions, 45s de polling para a conversa aberta), reduzindo chamadas repetidas à API.

### Webhook UAZAPI chamado o tempo todo

A UAZAPI envia um **POST** para o webhook a cada evento (mensagem, status, leitura, etc.). Várias requisições seguidas são **normais**. O que importa:

- O handler responde **200 rápido** (resposta em poucos ms).
- Trabalho pesado (sync de histórico, etc.) é feito em **background** (sem bloquear a resposta).

Não é possível “reduzir” o número de chamadas que a UAZAPI faz; só garantir que o endpoint esteja leve e estável.
