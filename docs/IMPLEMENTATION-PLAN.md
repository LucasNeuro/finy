# Plano de Implementação – ClicVend

**Versão:** 1.0  
**Data:** 2025-02-28  
**Referência:** PRD.md, TECHNICAL-SPEC.md, DESIGN-SYSTEM.md, ACCEPTANCE-CRITERIA.md

Este documento define as fases e a ordem de implementação do sistema ClicVend. Use como checklist e como guia para o agente ou equipe de desenvolvimento.

---

## Visão geral

- **Objetivo:** Sistema de atendimento multi-empresas (WhatsApp via uazapi), com link próprio por empresa e UI baseada na digisac (identidade ClicVend).
- **Stack:** Next.js (App Router) + Supabase (PostgreSQL, Auth). **OpenCNPJ** (API pública) para dados cadastrais de empresas no onboarding.
- **Ordem:** Landing + onboarding em etapas (com OpenCNPJ) → Base de dados (schema com companies estendido) e auth → multi-tenant → webhook → APIs → UI (Conversas/Chat) → Configuração.

---

## Fase 0 – Preparação

| # | Tarefa | Referência | Entregável |
|---|--------|------------|------------|
| 0.1 | Criar projeto Next.js (App Router); instalar e configurar cliente Supabase | TECHNICAL-SPEC §1 | Projeto com Next + Supabase |
| 0.2 | Configurar variáveis de ambiente (Supabase URL, anon key; service role se necessário) | — | `.env.local` (e documentação no README) |
| 0.3 | Decidir estratégia de tenant: **path** (`/acme/...`) ou **subdomínio** (`acme.dominio.com`) | TECHNICAL-SPEC §2 | Decisão registrada (path é mais simples no início) |

---

## Fase 1 – Base de dados e autenticação

| # | Tarefa | Referência | Entregável |
|---|--------|------------|------------|
| 1.1 | Criar schema SQL no Supabase: `companies`, `channels`, `queues`, `profiles` (ou `company_users`), `conversations`, `messages` com campos e FKs conforme TECHNICAL-SPEC | TECHNICAL-SPEC §3 | Migrations ou script SQL aplicado |
| 1.2 | Habilitar RLS em todas as tabelas; políticas por `company_id` e `auth.uid()` | TECHNICAL-SPEC §3.2 | Isolamento por empresa garantido |
| 1.3 | Implementar login/signup (Supabase Auth); tabela de perfis vinculando usuário ↔ empresa(s) e role | TECHNICAL-SPEC §4.4, PRD F2 | Usuário loga e tem `company_id` na sessão |
| 1.4 | Tela de **login** no estilo digisac: centralizada, logo ClicVend, 2 inputs (e-mail, senha com olho), “Esqueci minha senha”, botão “Entrar”, rodapé (Termos \| Política) | DESIGN-SYSTEM §4.1, §5.1 | Primeira tela funcional com nossa marca |

---

## Fase 2 – Multi-tenant e rotas protegidas

| # | Tarefa | Referência | Entregável |
|---|--------|------------|------------|
| 2.1 | Middleware Next.js: resolver tenant por path (`/[slug]/...`) ou subdomínio; injetar `company_id` (cookie/header/context) | TECHNICAL-SPEC §2.2 | Toda requisição autenticada sabe a empresa |
| 2.2 | Layout do app: **header** no estilo digisac (barra escura, logo ClicVend, ícones, sino com badge, avatar com bolinha verde) | DESIGN-SYSTEM §4.2, §5.2 | Estrutura igual à referência, cores ClicVend |
| 2.3 | Proteger rotas: só acessa área logada quem tiver sessão e vínculo com a empresa; redirect para login se não autenticado | TECHNICAL-SPEC §7 | Acesso negado a quem não pertence à empresa |

---

## Fase 3 – Webhook e dados de conversas

| # | Tarefa | Referência | Entregável |
|---|--------|------------|------------|
| 3.1 | Endpoint **POST /api/webhook/uazapi**: receber evento, identificar instância → canal → `company_id`; upsert em `conversations`, insert em `messages` | TECHNICAL-SPEC §4.1, §5 | Mensagem que chega no WhatsApp vira conversa + mensagem no banco |
| 3.2 | Documentar na uazapi a URL do webhook por instância; testar com um número de teste | uazapi-openapi-spec (8).yaml | Webhook estável e testado |

---

## Fase 4 – APIs do painel

| # | Tarefa | Referência | Entregável |
|---|--------|------------|------------|
| 4.1 | **GET /api/queues** e **GET /api/conversations** (filtro por `queue_id` e empresa da sessão) | TECHNICAL-SPEC §4.2 | Front consegue listar filas e conversas |
| 4.2 | **GET /api/conversations/[id]** (detalhe + mensagens) e **POST /api/conversations/[id]/messages** (enviar via uazapi e gravar) | TECHNICAL-SPEC §4.2 | Abrir conversa e enviar mensagem pelo backend |
| 4.3 | **CRUD /api/queues** e **/api/channels** (admin); canais com `uazapi_instance_id` e token (armazenar criptografado) | TECHNICAL-SPEC §4.3 | Admin configura filas e canais |

---

## Fase 5 – UI principal (Conversas e Chat)

| # | Tarefa | Referência | Entregável |
|---|--------|------------|------------|
| 5.1 | Página **Conversas**: sidebar com “Conversas”, busca, abas Chats/Fila/Contatos, “Criar novo”, lista de conversas (avatar, nome, último texto, badge); área direita com empty state “Selecione um contato para iniciar uma conversa” | DESIGN-SYSTEM §4.3, §5.3, §5.8 | Layout digisac com cores ClicVend |
| 5.2 | Ao clicar numa conversa: carregar mensagens (**GET /api/conversations/[id]**) e exibir thread (balões esquerda/direita, horário); rodapé com “Transferir chamado” se aplicável | DESIGN-SYSTEM §5.7 | Chat utilizável |
| 5.3 | Campo de envio: ao enviar, **POST /api/conversations/[id]/messages** e atualizar a thread (otimistic ou refetch) | TECHNICAL-SPEC §4.2 | Fluxo completo: receber + ver + responder |

---

## Fase 6 – Configuração (Conexões, Contatos, Filas)

| # | Tarefa | Referência | Entregável |
|---|--------|------------|------------|
| 6.1 | Página **Conexões**: título “Conexões”, “Exibir Filtros”, refresh, cards (ícone WhatsApp, nome do canal, “Conectado”, número, menu); paginação “Mostrando X-Y de Z resultados”, “15 por página” | DESIGN-SYSTEM §5.3, design/references | Listagem de canais como na referência |
| 6.2 | Página **Contatos**: “Importar contatos”, “Novo contato”, “Exibir Filtros”, tabela (Nome, Pessoa, Número, Conexão, Tags, Ações); empty “Nenhum resultado encontrado”; paginação | DESIGN-SYSTEM §5.4 | CRUD ou listagem de contatos |
| 6.3 | Integrar filas nos filtros da lista de conversas e na configuração de canais (fila padrão) | TECHNICAL-SPEC §3.1 | Filas integradas ao fluxo |

---

## Fase 7 – Landing page e onboarding em etapas

| # | Tarefa | Referência | Entregável |
|---|--------|------------|------------|
| 7.1 | Fluxo de **criação de empresa** (nome, slug): criar registro em `companies`, primeiro usuário admin, vínculo em `profiles` | TECHNICAL-SPEC §8 | Nova empresa com um admin |
| 7.2 | Gerar e exibir **link** de acesso (`https://app.com/[slug]` ou subdomínio) após criar empresa | PRD, ACCEPTANCE-CRITERIA MT-4, ONB-3 | “Contratar” = ter link próprio |
| 7.4 | (Opcional) Tags e Respostas rápidas | DESIGN-SYSTEM | Consistência referência |

**Detalhamento Fase 7:** (7.0) Landing no estilo referência Sistema Licitação: hero, CTAs Cadastre-se/Já tenho conta, seção Funcionalidades (cards), Como funciona (3 etapas), faixa de métricas (azul/cinza), CTA Comece gratuitamente; cores azul e cinza; logo ClicVend (ícone tipo play). (7.1) Onboarding em 5 etapas: 1-Dados da empresa (CNPJ → consulta OpenCNPJ, formulário com dados básicos; persistir em `companies` todo retorno + `opencnpj_raw`), 2-Dados de acesso (e-mail, cargo, senha), 3-Endereço, 4-Configuração do serviço (fila padrão), 5-Informações do perfil (criar Auth, profile admin, exibir link `https://app.com/[slug]`). (7.2) Opcional: GET /api/opencnpj/[cnpj] como proxy para OpenCNPJ.

---

## Ordem de execução resumida

1. **Fase 0** → **Fase 1**: projeto, banco (schema + migration OpenCNPJ em companies), auth, tela de login.
2. **Fase 7 (Landing + Onboarding):** landing no estilo referência (azul/cinza), onboarding em 5 etapas com OpenCNPJ, link por empresa — **recomendado antecipar** para ter cadastro completo desde o início.
3. **Fase 2**: middleware de tenant + layout do app (header).
4. **Fase 3**: webhook para popular conversas e mensagens.
5. **Fase 4** + **Fase 5**: APIs + UI de Conversas e Chat (fluxo completo de atendimento).
6. **Fase 6**: Conexões, Contatos, Filas.

---

## Uso com o agente

- **Tarefas e subtarefas completas:** Ver [IMPLEMENTATION-TASKS-FULL.md](IMPLEMENTATION-TASKS-FULL.md) para a lista detalhada de todas as tarefas e subtarefas (Fases 0 a 7) com checkboxes, para deixar o sistema rodando.
- Para começar: *“Execute a Fase 0 e a Fase 1 conforme docs/IMPLEMENTATION-PLAN.md”* (ou use IMPLEMENTATION-TASKS-FULL.md por item).
- Para continuar: *“Execute a Fase 2 conforme o IMPLEMENTATION-PLAN”*, e assim por diante.
- Validar entregas com **ACCEPTANCE-CRITERIA.md** ao fim de cada fase quando aplicável.

---

*Documento alinhado ao PRD, Technical Spec, Design System e Acceptance Criteria.*
