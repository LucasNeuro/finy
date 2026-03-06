# Fluxo: Filas e Caixas de Entrada (ClicVend + UAZAPI)

## 1. Conceito no banco: uma única entidade

No nosso banco **não existem duas tabelas** (uma para “fila” e outra para “caixa”). Existe só a tabela **`queues`**, que representa ao mesmo tempo:

- **Fila** – quando falamos de “por qual setor” as conversas são atendidas (Comercial, Suporte, etc.).
- **Caixa de entrada** – quando falamos de “onde caem” as conversas que chegam por um número.

Ou seja: **fila = caixa de entrada**. É a mesma coisa no modelo de dados. Na interface podemos usar o termo “Caixa de entrada” na tela de conexões (vinculação ao número) e “Fila” na tela de conversas (filtrar por setor).

---

## 2. Estrutura no banco

```
companies (empresa)
    │
    ├── queues (filas / caixas de entrada)
    │       id, company_id, name, slug
    │       Ex.: "Comercial", "Suporte", "Padrão"
    │
    ├── channels (números WhatsApp = instâncias UAZAPI)
    │       id, company_id, name, uazapi_instance_id, queue_id ← caixa PADRÃO (novas conversas)
    │
    ├── channel_queues (até 8 caixas por canal)
    │       channel_id, queue_id, is_default  ← uma is_default = true; refletida em channel.queue_id
    │
    └── conversations (conversas)
            id, company_id, channel_id, queue_id, customer_phone, status, ...
```

- **`queues`**: as “caixas” / filas da empresa (ex.: Comercial, Suporte).
- **`channels`**: cada número WhatsApp; **`channel.queue_id`** é a **caixa padrão** (onde caem novas conversas). Cada canal pode ter **até 8 caixas** vinculadas na tabela **`channel_queues`** (uma delas é a padrão).
- **`channel_queues`**: vínculo canal ↔ caixa (até 8 por canal). `is_default = true` em uma delas; o webhook usa **`channels.queue_id`** (sempre igual à caixa padrão).
- **`conversations`**: cada conversa tem **`channel_id`** e **`queue_id`** (caixa onde caiu). Na criação pelo webhook usamos **`channel.queue_id`** (caixa padrão do número).

---

## 3. Fluxo completo (lógica)

### 3.1 Configuração (uma vez por empresa)

1. **Criar filas (caixas de entrada)**  
   - Admin cria registros em **`queues`** (ex.: “Comercial”, “Suporte”, “Padrão”).  
   - Pode ser no onboarding (`queue_names`) ou na tela de Conexões (“+ Nova caixa de entrada”).

2. **Criar e conectar números (canais)**  
   - Admin cria a instância na UAZAPI e o **canal** no ClicVend (**`channels`**).  
   - Na criação escolhe uma Caixa de entrada (padrão); grava em channels.queue_id e insere em channel_queues com is_default: true. Depois, em Configurar canal, pode adicionar até 8 caixas, definir outra como padrão ou remover.

3. **Alterar a caixa de um número**  
   - Em Configurar canal, o campo “Caixa de entrada” altera **`channels.queue_id`** (PATCH no canal).  
 (UAZAPI → ClicVend)

### 3.2 Quando chega mensagem (UAZAPI → ClicVend)

1. **UAZAPI** envia webhook com:
   - `event`: ex.: `"messages"`
   - `instance`: id da instância (nosso `channels.uazapi_instance_id`)
   - `data`: chatId, from, text, fromMe, etc.

2. **Nosso webhook** (`/api/webhook/uazapi`):
   - Busca **canal** por `uazapi_instance_id` → obtém `channel.id`, `channel.company_id`, **`channel.queue_id`**.
   - Se não achar canal ativo, ignora.
   - Cria ou atualiza **conversation** com:
     - `channel_id` = canal que recebeu,
     - **`queue_id` = `channel.queue_id`** (a caixa em que esse número está),
     - `external_id`, `customer_phone`, `customer_name`, `status`, etc.
   - Insere **message** na conversa.

3. **Resultado**  
   - A conversa “cai” na **caixa (fila)** configurada no número.  
   - Na tela de conversas, o usuário filtra por **fila** (`queue_id`) e vê só as conversas daquela caixa.

### 3.3 Resumo do fluxo de dados

```
UAZAPI (instance + mensagem)
    → webhook identifica canal por uazapi_instance_id
    → lê channel.queue_id (caixa do número)
    → cria/atualiza conversation com esse queue_id
    → insere message

Listagem de conversas
    → filtra por company_id e, se quiser, por queue_id (fila/caixa)
```

---

## 4. O que a UAZAPI não faz

A UAZAPI **não conhece** filas nem caixas. Ela só:

- Envia eventos (ex.: `messages`) com `instance` e `data`.
- Permite configurar instância, triggers, quickreply, etc.

Toda a lógica de **“qual caixa / fila”** é **nossa**:

- Definida por **`channel_queues`** (até 8 por número) e pela **caixa padrão** **`channels.queue_id`**.
- Usada no webhook para preencher **`conversations.queue_id`**.
- Usada na listagem para filtrar por fila (caixa).

---

## 5. Regras práticas

| Ação | Onde | Efeito no banco |
|------|------|------------------|
| Criar caixa de entrada | Conexões → "+ Nova caixa de entrada" ou onboarding | INSERT em `queues` |
| Vincular número a uma caixa | Nova conexão → select "Caixa de entrada" | `channels.queue_id` na criação do canal |
| Vincular número a uma caixa | Nova conexão → select "Caixa de entrada" | `channels.queue_id` + INSERT em `channel_queues` |
| Gerir até 8 caixas por número | Configurar canal → "Caixas de entrada (até 8)" | GET/POST/DELETE `/api/channels/[id]/queues` |
| Definir caixa padrão | Configurar canal → estrela na caixa | `channel_queues.is_default` + `channels.queue_id` |
| Trocar caixa padrão de um número | Configurar canal → "Definir como padrão" em outra caixa | POST com `is_default: true`; atualiza `channels.queue_id` |
| Onde a conversa “cai” | Automático no webhook | `conversations.queue_id` = `channel.queue_id` no momento da mensagem |
| Filtrar conversas por setor | Tela Conversas → filtro por fila | WHERE `conversations.queue_id` = id da fila |

---

## 6. Até 8 caixas por número

Cada **canal** (número) pode ter **até 8 caixas** vinculadas:

- Tabela **`channel_queues`**: `(channel_id, queue_id, is_default)`. Máximo 8 linhas por `channel_id` (trigger no banco).
- Uma delas é **padrão** (`is_default = true`); o mesmo valor fica em **`channels.queue_id`** para o webhook usar.
- **Novas conversas** desse número sempre caem na **caixa padrão**. O atendente pode mover conversas entre filas na tela de conversas (se implementado).
- Vários números podem compartilhar as mesmas caixas (ex.: Comercial vinculada a 3 canais).

## 7. Múltiplos números na mesma caixa

Vários **canais** (números) podem ter o **mesmo** `queue_id`:

- Ex.: Número “Vendas SP” e “Vendas RJ” ambos com `queue_id` = Comercial.
- As conversas dos dois números passam a aparecer na **mesma caixa** (fila Comercial) na listagem.

Um **canal** tem apenas **uma** caixa (um `queue_id`); a caixa pode ser compartilhada por vários canais.

---

## 8. Conclusão

- **Filas e caixas de entrada** são a mesma coisa no banco: tabela **`queues`**.
- **Números** são **`channels`**; cada número pode ter **até 8 caixas** em **`channel_queues`**; a **caixa padrão** fica em **`channels.queue_id`**.
- **Fluxo:** criar filas (caixas) → criar/conectar números e escolher a caixa padrão (e depois adicionar até 8) → webhook usa `channel.queue_id` para novas conversas → listagem filtra por `queue_id` (fila).
- A **UAZAPI** só envia evento por instância; **quem define a caixa/fila** é o ClicVend.

---

## 9. Redis vs Supabase para filas/caixas

No diagrama tipo Chatwoot, o **Redis** aparece para **filas de jobs** (Sidekiq): tarefas assíncronas (enviar mensagem, processar webhook pesado, etc.). Isso **não** é a mesma coisa que as nossas **filas/caixas de entrada** (setores como Comercial, Suporte).

| Conceito | Onde fica no ClicVend | Redis? |
|----------|------------------------|--------|
| **Filas/caixas de entrada** (Comercial, Suporte, onde cai conversa) | **Supabase (Postgres)** – tabelas `queues`, `channel_queues`, `channels.queue_id` | Não. São dados de negócio; leitura/escrita esporádica. Postgres aguenta muito bem. |
| **Fila de jobs** (processar envio de mensagem, webhook em background, relatórios) | Hoje não temos worker assíncrono. Se quisermos, podemos usar **Redis + BullMQ**, **Inngest**, ou **Supabase Edge Functions + pg_cron** | Só faria sentido para **jobs assíncronos**, não para “qual caixa o número usa”. |

**Resumo:**  
- **Controle de filas e caixas de entrada** (até 8 por número, caixa padrão, vinculação) fica **só no Supabase**. Não há gargalo típico: são poucas linhas por canal e poucas escritas por minuto.  
- **Redis** (ou outro sistema de fila de jobs) entra se no futuro quisermos **processar tarefas em background** (ex.: enviar mensagem pela UAZAPI sem travar a requisição, reprocessar webhooks). Com o volume atual, dá para seguir só com Supabase e considerar Redis/job queue quando houver necessidade real de workers assíncronos.

---

## 10. Fluxo de atendimento (atendente)

Este é o fluxo na tela de **Conversas**: como o atendente vê as conversas, assume e transfere.

### 10.1 Abas na sidebar

| Aba | O que mostra | API |
|-----|----------------|-----|
| **Meus atendimentos** | Conversas em que **eu** sou o atendente (`assigned_to` = meu usuário). | `GET /api/conversations?only_assigned_to_me=1` |
| **Filas** | Conversas da **fila** escolhida no dropdown (e, se o usuário não for owner/admin, só das filas em que está atribuído). | `GET /api/conversations?queue_id=...` |
| **Contatos** | Link para a página de Contatos (não é lista de conversas). | — |

### 10.2 Fluxo: da fila para “Meus atendimentos”

```
┌─────────────────────────────────────────────────────────────────────────┐
│  CONVERSAS (sidebar)                                                     │
├─────────────────────────────────────────────────────────────────────────┤
│  [ Meus atendimentos ]  [ Filas ]  [ Contatos ]                           │
│  Filtro: Todas as filas ▼   Todos ▼    [+ Criar novo]                     │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  Aba "Filas" → listagem por queue_id (conversas daquela fila).           │
│  Muitas podem estar sem atendente (assigned_to = null).                  │
│                                                                          │
│  Atendente CLICA numa conversa da fila                                   │
│       ↓                                                                  │
│  Abre o chat (página /conversas/[id])                                     │
│       ↓                                                                  │
│  Se a conversa não tem atendente E o usuário tem permissão inbox.claim:  │
│       → POST /api/conversations/[id]/claim (automático, uma vez)        │
│       → assigned_to = eu, status = in_progress                           │
│       → conversa “sai” da fila (para quem filtra “só minha fila”)        │
│       → e passa a aparecer em “Meus atendimentos”                        │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

- **Ticket = conversa:** no nosso modelo, cada conversa é um “ticket”. Ao assumir, ela fica **atribuída** a você e o **status** vai para `in_progress`.
- Quem **não** tem `inbox.claim` pode abrir a conversa para ler, mas **não** assume automaticamente (a conversa continua na fila até alguém com permissão assumir ou um supervisor atribuir).

### 10.3 Quem pode transferir

Só podem **transferir** (reatribuir o chamado para outra pessoa ou mudar fila) quem tem uma destas permissões:

- **inbox.assign** – Atribuir atendimento  
- **inbox.manage_tickets** – Visão gerencial (owner/admin)  
- **inbox.transfer** – Transferir atendimento  

Na tela do chat, o botão **“Transferir chamado”** só aparece para usuários com uma dessas permissões. O backend (PATCH em `/api/conversations/[id]`) já valida ao alterar `assigned_to` ou `queue_id`.

### 10.4 Status do ticket (conversa)

| Status | Quando |
|--------|--------|
| `waiting` / `open` | Conversa na fila, sem atendente ou recém-criada. |
| `in_progress` | Atendente assumiu (claim ou atribuição manual). |
| `closed` | Atendimento encerrado (exige `inbox.close`). |

Reabrir uma conversa `closed` exige permissão **inbox.reopen**.

### 10.5 Resumo do fluxo para o atendente

1. Entro em **Conversas** e escolho a aba **Filas** e a fila (ex.: “Atendimentos gerais”).  
2. Vejo as conversas daquela fila (algumas sem atendente).  
3. Clico numa conversa → abre o chat.  
4. Se eu tiver **Pegar chamado da fila** (`inbox.claim`) e a conversa estiver sem atendente, **assumo automaticamente**: a conversa fica em **Meus atendimentos** e o status vai para **em atendimento**.  
5. Só **supervisor / ADM / owner** (ou quem tiver `inbox.assign` ou `inbox.transfer`) pode **transferir** esse chamado para outro atendente.  
6. Ao encerrar, mudo o status para **closed** (quem tem `inbox.close`).
