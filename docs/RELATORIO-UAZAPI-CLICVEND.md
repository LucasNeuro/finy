# Relatório UAZAPI × ClicVend – Sistema de Atendimento

**Data:** 01/03/2025  
**Objetivo:** Mapear recursos da UAZAPI, revisar banco de dados e definir plano passo a passo para integração completa.  
**Status:** Apenas relatório – nenhuma implementação realizada.

---

## 1. Respostas Automáticas na UAZAPI

### 1.1 O que são e para que servem

Na UAZAPI existem **dois conceitos distintos**:

| Recurso | Endpoint | Função | Automático? |
|---------|----------|--------|-------------|
| **Respostas Rápidas (QuickReply)** | `/quickreply/edit`, `/quickreply/showall` | Templates armazenados na API para o atendente usar na interface | **Não** – a API só armazena; o frontend exibe e o atendente escolhe |
| **Respostas Automáticas (Chatbot)** | `/trigger/edit`, `/trigger/list` + `/instance/updatechatbotsettings` | Quando o cliente envia certas palavras, a UAZAPI responde sozinha | **Sim** – a UAZAPI envia a resposta automaticamente |

### 1.2 Como obter respostas automáticas

A spec da UAZAPI deixa claro:

> *"**Não é um chatbot**: Para respostas automáticas, use os recursos de Chatbot."* (tag Respostas Rápidas)

Para ter **respostas automáticas** é preciso:

1. **Habilitar o chatbot** – `POST /instance/updatechatbotsettings` com `chatbot_enabled: true`
2. **Criar triggers** – `POST /trigger/edit` com um dos tipos:
   - **`agent`** – aciona IA (OpenAI, Anthropic, Gemini, DeepSeek)
   - **`quickreply`** – aciona uma resposta rápida cadastrada (envio automático quando o cliente digita a palavra-chave)
   - **`flow`** – dispara um fluxo salvo
3. **Configurar palavras-chave** – `wordsToStart` no trigger (ex: `olá|bom dia|qual seu nome`)

### 1.3 Fluxo de Resposta Automática via QuickReply

```
Cliente envia "olá"
    → UAZAPI verifica triggers ativos
    → Trigger type=quickreply com wordsToStart="olá|oi"
    → UAZAPI envia automaticamente o conteúdo da QuickReply cadastrada
```

### 1.4 Resumo

| Pergunta | Resposta |
|----------|----------|
| Dá para criar respostas automáticas? | **Sim** – via triggers + chatbot habilitado |
| QuickReply sozinho é automático? | **Não** – só armazena; precisa de trigger type=quickreply |
| Onde configurar? | Chatbot settings + `/trigger/edit` |

---

## 2. Inventário Completo de Recursos UAZAPI (para Sistema de Atendimento)

### 2.1 Instância e Conexão

| Endpoint | Método | Descrição |
|----------|--------|-----------|
| `/instance/init` | POST | Criar instância (admin) |
| `/instance/all` | GET | Listar instâncias (admin) |
| `/instance/connect` | POST | Conectar (QR ou código) |
| `/instance/disconnect` | POST | Desconectar |
| `/instance/status` | GET | Status (conectado, QR, paircode) |
| `/instance` | DELETE | Deletar instância |
| `/instance/updateInstanceName` | POST | Renomear instância |
| `/instance/updateAdminFields` | POST | Campos admin (admin) |
| `/instance/updateDelaySettings` | POST | Delay na fila de mensagens |
| `/instance/proxy` | GET/POST/DELETE | Configurar proxy |
| `/instance/privacy` | GET/POST | Privacidade (status, visto por último, etc.) |
| `/instance/presence` | POST | Presença (available/unavailable) |
| `/instance/updateFieldsMap` | POST | Campos customizados de leads (CRM) |

### 2.2 Perfil

| Endpoint | Método | Descrição |
|----------|--------|-----------|
| `/profile/name` | POST | Alterar nome do perfil |
| `/profile/image` | POST | Alterar foto do perfil |

### 2.3 Chatbot e Respostas Automáticas

| Endpoint | Método | Descrição |
|----------|--------|-----------|
| `/instance/updatechatbotsettings` | POST | Habilitar chatbot, openai_apikey, stop, ignoreGroups |
| `/trigger/edit` | POST | Criar/editar/deletar trigger (agent, quickreply, flow) |
| `/trigger/list` | GET | Listar triggers |
| `/agent/edit` | POST | Criar/editar agente de IA |
| `/agent/list` | GET | Listar agentes |
| `/knowledge/edit` | POST | Criar/editar conhecimento (base para IA) |
| `/knowledge/list` | GET | Listar conhecimentos |
| `/function/edit` | POST | Criar/editar funções API (integração externa) |
| `/function/list` | GET | Listar funções |

### 2.4 Respostas Rápidas (QuickReply)

| Endpoint | Método | Descrição |
|----------|--------|-----------|
| `/quickreply/edit` | POST | Criar/editar/deletar resposta rápida |
| `/quickreply/showall` | GET | Listar respostas rápidas |

### 2.5 Envio de Mensagens

| Endpoint | Método | Descrição |
|----------|--------|-----------|
| `/send/text` | POST | Texto |
| `/send/media` | POST | Imagem, vídeo, áudio, documento, sticker |
| `/send/contact` | POST | Cartão de contato |
| `/send/location` | POST | Localização |
| `/send/status` | POST | Stories |
| `/send/menu` | POST | Botões, listas, enquetes, carrossel |
| `/send/carousel` | POST | Carrossel |
| `/send/location-button` | POST | Botão solicitar localização |
| `/send/request-payment` | POST | Solicitar pagamento |
| `/send/pix-button` | POST | Botão PIX |
| `/message/presence` | POST | Presença (digitando, gravando) |

### 2.6 Mensagens / Ações

| Endpoint | Método | Descrição |
|----------|--------|-----------|
| `/message/download` | POST | Baixar mídia |
| `/message/find` | POST | Buscar mensagens |
| `/message/markread` | POST | Marcar como lida |
| `/message/react` | POST | Reagir (emoji) |
| `/message/delete` | POST | Apagar para todos |
| `/message/edit` | POST | Editar mensagem |

### 2.7 Chats / CRM

| Endpoint | Método | Descrição |
|----------|--------|-----------|
| `/chat/find` | POST | Buscar chats com filtros |
| `/chat/details` | POST | Detalhes completos do chat |
| `/chat/check` | POST | Verificar números no WhatsApp |
| `/chat/editLead` | POST | Editar lead (CRM) |
| `/chat/block` | POST | Bloquear/desbloquear |
| `/chat/blocklist` | GET | Lista de bloqueados |
| `/chat/labels` | POST | Etiquetas do chat |
| `/chat/delete` | POST | Deletar chat |
| `/chat/archive` | POST | Arquivar |
| `/chat/read` | POST | Marcar lido |
| `/chat/mute` | POST | Silenciar |
| `/chat/pin` | POST | Fixar |

### 2.8 Contatos / Etiquetas

| Endpoint | Método | Descrição |
|----------|--------|-----------|
| `/contacts` | GET | Listar contatos |
| `/contacts/list` | POST | Listar com paginação |
| `/contact/add` | POST | Adicionar contato |
| `/contact/remove` | POST | Remover contato |
| `/label/edit` | POST | Editar etiqueta |
| `/labels` | GET | Listar etiquetas |

### 2.9 Grupos / Comunidades

| Endpoint | Método | Descrição |
|----------|--------|-----------|
| `/group/create` | POST | Criar grupo |
| `/group/info` | POST | Info do grupo |
| `/group/inviteInfo` | POST | Info por link |
| `/group/join` | POST | Entrar |
| `/group/leave` | POST | Sair |
| `/group/list` | GET/POST | Listar grupos |
| `/group/resetInviteCode` | POST | Novo link |
| `/group/updateAnnounce` | POST | Apenas admins enviam |
| `/group/updateDescription` | POST | Descrição |
| `/group/updateImage` | POST | Imagem |
| `/group/updateLocked` | POST | Apenas admins editam |
| `/group/updateName` | POST | Nome |
| `/group/updateParticipants` | POST | Add/remove/promote |
| `/community/create` | POST | Criar comunidade |
| `/community/editgroups` | POST | Add/remove grupos |

### 2.10 Webhooks / SSE

| Endpoint | Método | Descrição |
|----------|--------|-----------|
| `/webhook` | GET/POST | Ver/configurar webhook da instância |
| `/globalwebhook` | GET/POST | Webhook global (admin) |
| `/sse` | GET | Server-Sent Events (tempo real) |

### 2.11 Mensagem em Massa

| Endpoint | Método | Descrição |
|----------|--------|-----------|
| `/sender/simple` | POST | Campanha simples |
| `/sender/advanced` | POST | Campanha avançada |
| `/sender/edit` | POST | Stop/continue/delete |
| `/sender/cleardone` | POST | Limpar enviadas |
| `/sender/clearall` | DELETE | Limpar tudo |
| `/sender/listfolders` | GET | Listar campanhas |
| `/sender/listmessages` | POST | Mensagens da campanha |

### 2.12 Chamadas / Business / Chatwoot

| Endpoint | Método | Descrição |
|----------|--------|-----------|
| `/call/make` | POST | Iniciar chamada |
| `/call/reject` | POST | Rejeitar chamada |
| `/chatwoot/config` | GET/PUT | Integração Chatwoot |
| `/business/get/profile` | POST | Perfil comercial |
| `/business/get/categories` | GET | Categorias |
| `/business/update/profile` | POST | Atualizar perfil |
| `/business/catalog/*` | POST | Catálogo de produtos |

---

## 3. Configuração de Instâncias – Onde ficará a configuração

### 3.1 Estrutura atual

- **Channels** = 1 canal = 1 instância UAZAPI (1 WhatsApp)
- **ChannelConfigSideOver** = aba de configuração por canal

### 3.2 Abas já existentes no ChannelConfigSideOver

| Aba | Status | UAZAPI |
|-----|--------|--------|
| Conectar | ✅ Implementado | `/instance/connect`, `/instance/status` |
| Perfil | ✅ Implementado | `/profile/name`, `/profile/image` |
| Privacidade | ✅ Implementado | `/instance/privacy` |
| Respostas automáticas | ✅ Parcial (só chatbot settings) | `/instance/updatechatbotsettings` |
| Presença | ✅ Implementado | `/instance/presence` |

### 3.3 O que falta na aba de Respostas Automáticas

Hoje só há:
- `chatbot_enabled`, `chatbot_ignoreGroups`, `chatbot_stopConversation`, etc.

Falta:
- **Triggers** – criar/editar triggers (agent, quickreply, flow)
- **Agentes de IA** – criar/editar agentes
- **QuickReply** – cadastro de respostas rápidas (para uso manual ou em triggers)
- **Conhecimento** – base de conhecimento para IA
- **Funções** – integração com APIs externas

### 3.4 Proposta de formulário completo

- **Subseção 1 – Chatbot geral**
  - Habilitar/desabilitar
  - Ignorar grupos
  - Palavra para parar
  - Tempos de pausa

- **Subseção 2 – Triggers**
  - Lista de triggers
  - Criar/editar/deletar
  - Tipo: agent | quickreply | flow
  - Palavras-chave, prioridade, condição de lead

- **Subseção 3 – Agentes de IA**
  - Lista de agentes
  - Criar/editar (provider, model, apikey, basePrompt, etc.)

- **Subseção 4 – Respostas rápidas**
  - Lista de QuickReply
  - Criar/editar (shortCut, text, type, file)

- **Subseção 5 – Conhecimento**
  - Lista de conhecimentos
  - Criar/editar (tittle, content)

- **Subseção 6 – Funções**

---

## 4. Revisão do Banco de Dados (Supabase)

### 4.1 Tabelas já existentes

| Tabela | Propósito |
|--------|-----------|
| `companies` | Empresas (multi-tenant) |
| `queues` | Filas de atendimento |
| `profiles` | Usuários × empresas (roles) |
| `channels` | Canais WhatsApp (uazapi_instance_id, uazapi_token_encrypted) |
| `conversations` | Conversas (external_id, customer_phone, status, assigned_to) |
| `messages` | Mensagens (direction, content, external_id) |
| `tags` | Etiquetas |
| `conversation_tags` | Tags × conversas |
| `canned_responses` | Respostas rápidas internas (por company) |
| `conversation_ratings` | Avaliação de satisfação |
| `custom_field_definitions` | Campos customizados |
| `conversation_custom_fields` | Valores de campos customizados |
| `company_links` | Slug por empresa |

### 4.2 Relação UAZAPI × ClicVend

| UAZAPI | ClicVend |
|--------|----------|
| Instância (token) | `channels` (uazapi_instance_id, uazapi_token_encrypted) |
| Chat (wa_chatid) | `conversations` (external_id) |
| Lead (CRM) | `conversations` + campos customizados |
| Mensagens | `messages` |
| QuickReply | UAZAPI armazena; ClicVend tem `canned_responses` próprio |
| Triggers, Agentes, Conhecimento | **Não persistidos** – ficam só na UAZAPI |

### 4.3 Gaps de persistência

| Recurso UAZAPI | Persistido no ClicVend? | Recomendação |
|----------------|-------------------------|--------------|
| Instância | Sim (channels) | ✅ |
| Token | Sim (channels.uazapi_token_encrypted) | ✅ |
| Webhook | Não | Criar `channel_webhooks` ou similar |
| Config chatbot | Não | Criar `channel_chatbot_config` (cache) |
| Triggers | Não | Criar `channel_triggers` (cache/sync) |
| Agentes | Não | Criar `channel_agents` (cache) |
| QuickReply | Não (UAZAPI) | `canned_responses` é por company; pode sincronizar com UAZAPI |
| Conhecimento | Não | Criar `channel_knowledge` (cache) |

### 4.4 Proposta de novas tabelas (para persistência)

```sql
-- Cache/sync da configuração de chatbot por canal
CREATE TABLE channel_chatbot_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id uuid NOT NULL REFERENCES channels(id) ON DELETE CASCADE UNIQUE,
  chatbot_enabled boolean DEFAULT false,
  chatbot_ignore_groups boolean DEFAULT true,
  chatbot_stop_word text,
  chatbot_stop_minutes int DEFAULT 30,
  chatbot_stop_when_send int DEFAULT 5,
  openai_apikey_encrypted text,
  synced_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Triggers da UAZAPI (cache para exibição/edição)
CREATE TABLE channel_triggers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id uuid NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
  uazapi_trigger_id text NOT NULL,
  type text NOT NULL CHECK (type IN ('agent', 'quickreply', 'flow')),
  agent_id text,
  quickreply_id text,
  flow_id text,
  words_to_start text,
  priority int DEFAULT 0,
  active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(channel_id, uazapi_trigger_id)
);

-- Agentes de IA (cache)
CREATE TABLE channel_agents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id uuid NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
  uazapi_agent_id text NOT NULL,
  name text NOT NULL,
  provider text,
  model text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(channel_id, uazapi_agent_id)
);

-- Webhooks configurados por canal
CREATE TABLE channel_webhooks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id uuid NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
  uazapi_webhook_id text,
  url text NOT NULL,
  events jsonb DEFAULT '[]',
  exclude_messages jsonb DEFAULT '[]',
  enabled boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
```

### 4.5 Observação

- A UAZAPI é a **fonte da verdade** para triggers, agentes, conhecimento, quickreply.
- O banco pode ser usado como **cache** para:
  - Exibir na UI sem chamar a API sempre
  - Manter histórico de alterações
  - Funcionar offline (parcialmente)
- A decisão de persistir ou não depende de UX e requisitos de auditoria.

---

## 5. O que a UAZAPI oferece × O que o ClicVend já usa

### 5.1 Implementado no ClicVend

| Recurso | UAZAPI | ClicVend |
|---------|--------|----------|
| Criar instância | `/instance/init` | Via API channels |
| Conectar | `/instance/connect` | ✅ |
| Status | `/instance/status` | ✅ |
| Desconectar | `/instance/disconnect` | ✅ |
| Deletar | `/instance` DELETE | ✅ |
| Perfil (nome, imagem) | `/profile/name`, `/profile/image` | ✅ |
| Privacidade | `/instance/privacy` | ✅ |
| Presença | `/instance/presence` | ✅ |
| Chatbot settings | `/instance/updatechatbotsettings` | ✅ |
| Proxy | `/instance/proxy` | ✅ |
| Delay | `/instance/updateDelaySettings` | ✅ |
| Webhook | `/webhook` | ✅ |

### 5.2 Não implementado

| Recurso | UAZAPI | ClicVend |
|---------|--------|----------|
| Triggers | `/trigger/edit`, `/trigger/list` | ❌ |
| Agentes | `/agent/edit`, `/agent/list` | ❌ |
| Conhecimento | `/knowledge/edit`, `/knowledge/list` | ❌ |
| Funções | `/function/edit`, `/function/list` | ❌ |
| QuickReply | `/quickreply/edit`, `/quickreply/showall` | ❌ |
| Envio de mensagens | `/send/*` | ❌ |
| Buscar mensagens | `/message/find` | ❌ |
| Chats | `/chat/find`, `/chat/details`, `/chat/editLead` | ❌ |
| Grupos | `/group/*` | ❌ |
| Contatos | `/contacts`, `/contact/add` | ❌ |
| Etiquetas | `/label/edit`, `/labels` | ❌ |
| Bloqueios | `/chat/block`, `/chat/blocklist` | ❌ |
| Mensagem em massa | `/sender/*` | ❌ |

---

## 6. Plano Passo a Passo

### Fase 1 – Respostas automáticas (prioridade)

1. **API routes**
   - `POST /api/uazapi/trigger` – criar/editar/delete trigger
   - `GET /api/uazapi/trigger` – listar triggers
   - `POST /api/uazapi/quickreply` – criar/editar/delete QuickReply
   - `GET /api/uazapi/quickreply` – listar QuickReply

2. **UI**
   - Expandir aba "Respostas automáticas" no ChannelConfigSideOver
   - Formulário de triggers (tipo, palavras-chave, quickReply_id, agent_id)
   - Formulário de QuickReply (shortCut, text, type, file)

3. **Persistência** (opcional)
   - Cache de triggers e quickreply no banco

### Fase 2 – Envio e recebimento de mensagens

1. **Webhook**
   - Garantir que o webhook recebe mensagens e atualiza `conversations` e `messages`

2. **Envio**
   - API routes para `/send/text`, `/send/media` etc.
   - UI no chat para enviar mensagens

3. **Histórico**
   - Sincronizar com `/message/find` quando necessário

### Fase 3 – CRM e leads

1. `/chat/editLead` – mapear para campos de conversa
2. `/chat/find` – buscar chats
3. Campos customizados

### Fase 4 – Recursos avançados

1. Agentes de IA
2. Conhecimento
3. Funções
4. Grupos, contatos, etiquetas

---

## 7. Resumo Executivo

| Item | Conclusão |
|------|-----------|
| **Respostas automáticas** | Sim, via triggers + chatbot habilitado. QuickReply sozinho não é automático. |
| **Formulário completo** | Inventário de 100+ endpoints mapeado; proposta de subseções na aba de configuração. |
| **Configuração de instâncias** | ChannelConfigSideOver; falta triggers, agentes, quickreply, conhecimento, funções. |
| **Banco de dados** | Schema OK para core; proposta de tabelas para cache de chatbot/config. |
| **UAZAPI vs ClicVend** | ~15 endpoints implementados; ~50+ pendentes. |
| **Próximo passo** | Implementar triggers e QuickReply na UI e no backend. |

---

*Fim do relatório*
