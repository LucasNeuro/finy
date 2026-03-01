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
| `UAZAPI_WEBHOOK_URL` | `https://SEU_REF.supabase.co/functions/v1/uazapi-webhook` |
| `NEXT_PUBLIC_APP_URL` | **URL que o Render der** (ex: `https://finy.onrender.com`) |

**Importante:** depois do primeiro deploy, o Render mostra a URL do serviço (ex: `https://finy.onrender.com`). Atualize `NEXT_PUBLIC_APP_URL` para essa URL e faça um novo deploy (ou use **Manual Deploy**), para que redirecionamentos e links do app usem a URL correta.

---

## 4. Deploy

- Clique em **Create Web Service**. O Render vai rodar `npm install && npm run build` e depois `npm run start`.
- O app fica disponível em `https://SEU-SERVICO.onrender.com` (ou no domínio customizado que configurar).

---

## 5. Domínio customizado (opcional)

Em **Settings** do Web Service → **Custom Domains** → **Add Custom Domain**. Informe o domínio (ex: `app.seudominio.com`) e configure o CNAME no seu DNS apontando para o endereço que o Render indicar. Depois defina `NEXT_PUBLIC_APP_URL=https://app.seudominio.com`.

---

## 6. Resumo

| Item | Configuração |
|------|--------------|
| Tipo | Web Service (Node) |
| Build | `npm install && npm run build` |
| Start | `npm run start` |
| Node | Recomendado: `NODE_VERSION=20` |
| Env | Todas as variáveis do `.env.example` + `NEXT_PUBLIC_APP_URL` com a URL final do app |

A Edge Function continua no Supabase; apenas o app Next.js roda no Render. O webhook global da UAZAPI deve apontar para a URL da Edge Function (não para a URL do Render).
