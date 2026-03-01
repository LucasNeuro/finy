# PRD – Product Requirements Document  
## Sistema de Atendimento Multi-Empresas (WhatsApp)

**Versão:** 1.0  
**Data:** 2025-02-28

---

## 1. Visão e objetivos

### Visão (uma frase)

Sistema de atendimento ao cliente **multi-empresa**, conectado ao **WhatsApp** via API uazapi, com **filas**, **canais** e **link próprio por empresa** (subdomínio ou path), permitindo que cada contratante acesse e gerencie apenas seus dados.

### Objetivos

- **Multi-tenant:** várias empresas no mesmo sistema; cada uma com isolamento total de dados e acesso apenas pelo seu link (ex.: `acme.app.com` ou `app.com/acme`).
- **Atendimento centralizado:** atendentes veem conversas por fila, assumem e respondem pelo painel; histórico e mensagens ficam no sistema.
- **Canal WhatsApp:** receber e enviar mensagens via números conectados à API uazapi, com webhook em tempo (quase) real.
- **Contratar = ter link:** ao contratar, a empresa ganha seu espaço (tenant) e sua URL de acesso; onboarding com primeiro usuário admin e configuração inicial.

---

## 2. Personas e usuários

| Persona | Descrição | Necessidades principais |
|--------|------------|--------------------------|
| **Admin da empresa** | Responsável pela configuração da conta da empresa | Conectar números WhatsApp (canais), criar filas, convidar/gerenciar atendentes e supervisores, ver configurações e (futuro) relatórios. |
| **Atendente** | Quem responde ao cliente no dia a dia | Ver conversas da(s) fila(s) atribuídas, abrir chat, enviar e receber mensagens, marcar como resolvido. |
| **Supervisor** (opcional no v1) | Acompanha equipe e filas | Ver todas as conversas da fila, desempenho, eventual atribuição manual. |

---

## 3. Escopo

### No escopo (v1)

- Login e autenticação por empresa (acesso via link próprio da empresa).
- **Multi-tenant:** cada empresa com seu link (subdomínio ou path); dados isolados por `company_id`.
- Conexão de **número(s) WhatsApp** via API uazapi (uma ou mais instâncias por empresa).
- **Canais** (mapeamento instância uazapi ↔ canal no sistema) e **filas** (inbox por tipo/equipe).
- **Webhook uazapi** → criar/atualizar conversas e mensagens no sistema.
- **Inbox:** listagem de conversas por fila, abrir conversa, ver thread de mensagens.
- **Envio de mensagem:** atendente envia texto na thread; backend envia via uazapi e grava no histórico.
- **Configuração:** canais e filas por empresa (CRUD básico).
- **Onboarding:** criação de nova empresa (tenant), slug/subdomínio, primeiro usuário admin e geração do link de acesso.

### Fora do escopo (v1)

- Regras de atribuição automática (round-robin, etc.).
- Relatórios avançados e dashboards.
- App mobile nativo.
- Domínio customizado por empresa (ex.: `atendimento.cliente.com`).
- Billing e planos (pode ser tabela/modelo preparado, mas sem fluxo completo).

---

## 4. Funcionalidades (resumo)

| # | Funcionalidade | Descrição | Usuário | Prioridade |
|---|----------------|-----------|---------|------------|
| F1 | Acesso por link da empresa | Usuário acessa apenas pela URL da empresa (subdomínio ou path); sessão vinculada ao tenant. | Todos | P0 |
| F2 | Login / Auth | Login com e-mail e senha (Supabase Auth); após login, contexto da empresa atual. | Todos | P0 |
| F3 | Canais WhatsApp | Admin configura canais vinculados a instâncias uazapi; webhook configurado para cada instância/canal. | Admin | P0 |
| F4 | Filas | Admin cria filas (ex.: Vendas, Suporte); conversas são associadas a filas. | Admin | P0 |
| F5 | Recebimento de mensagens | Webhook uazapi recebe evento → sistema cria/atualiza conversa e mensagem na fila correta. | Sistema | P0 |
| F6 | Inbox por fila | Atendente vê lista de conversas da fila; pode filtrar/ordenar por data, status. | Atendente | P0 |
| F7 | Visualizar conversa | Abrir uma conversa e ver thread de mensagens (histórico). | Atendente | P0 |
| F8 | Enviar mensagem | Atendente digita e envia; backend envia via uazapi e grava na conversa. | Atendente | P0 |
| F9 | Usuários da empresa | Admin gerencia atendentes (e roles); usuário vinculado a uma ou mais empresas. | Admin | P1 |
| F10 | Onboarding nova empresa | Criar tenant (empresa), slug/subdomínio, primeiro admin e link de acesso. | Sistema / Admin plataforma | P1 |

---

## 5. Fluxos principais

### 5.1 Mensagem entrando (WhatsApp → Sistema)

1. Cliente envia mensagem no WhatsApp para o número conectado.
2. uazapi envia evento para o **webhook** configurado (URL do nosso backend).
3. Backend identifica a instância/canal e, por consequência, a **empresa** e a **fila**.
4. Backend cria ou atualiza a **conversa** (por identificador externo + canal) e insere a **mensagem**.
5. Atendente vê a conversa na fila (atualização em tempo real ou ao recarregar/abrir inbox).

### 5.2 Atendente responde

1. Atendente abre a conversa no painel e digita a mensagem.
2. Front chama API **POST /api/conversations/[id]/messages**.
3. Backend valida empresa e permissão; envia mensagem via **API uazapi** (envio de texto).
4. Backend grava a mensagem na tabela `messages` com direção "out".
5. Cliente recebe no WhatsApp; mensagem aparece na thread no painel.

### 5.3 Nova empresa (onboarding)

1. Processo de contratação/cadastro (manual ou futuro fluxo de signup).
2. Sistema cria registro em **companies** (nome, slug/subdomínio).
3. Cria primeiro usuário (Supabase Auth) e associa à empresa como **admin** (tabela de perfis/company_users).
4. (Opcional) Cria fila padrão e instruções para conectar primeiro canal.
5. Empresa recebe o **link** de acesso (ex.: `https://acme.app.com` ou `https://app.com/acme`).

---

## 6. Critérios de sucesso

- Uma empresa **nova** consegue acessar **apenas** pelo seu link e ver **apenas** seus dados (canais, filas, conversas, usuários).
- Mensagem recebida no WhatsApp aparece na conversa correta na fila em tempo aceitável (ex.: &lt; 1 minuto em condições normais).
- Atendente consegue **enviar** mensagem pelo painel e o cliente recebe no WhatsApp no número correto.
- Configuração de canais e filas é feita por empresa, sem impacto em outras empresas.

---

## 7. Premissas e restrições

- **WhatsApp:** uso exclusivo da API **uazapi** no v1 (spec em `docs/uazapi-openapi-spec (8).yaml`).
- **Stack:** Next.js (painel + API), Supabase (PostgreSQL, Auth); opcional Realtime para atualização ao vivo.
- **Link por empresa:** subdomínio **ou** path; definir uma estratégia na especificação técnica.
- Recomendação uazapi: preferir **WhatsApp Business** para instâncias de produção.

---

## 8. Referências

- **uazapi OpenAPI:** `docs/uazapi-openapi-spec (8).yaml` (endpoints de instância, webhook, envio de mensagens).
- **Referência de produto:** [Front – Common use cases](https://help.front.com/en/articles/2482#common_use_cases) (inboxes, canais, teammates, triagem).

---

*Documento para alinhamento de produto e handoff para agente/desenvolvimento. Detalhes de implementação estão em `TECHNICAL-SPEC.md` e critérios de aceite em `ACCEPTANCE-CRITERIA.md`.*
