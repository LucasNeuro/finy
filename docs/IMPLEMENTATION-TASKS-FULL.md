# Tarefas e subtarefas – ClicVend (sistema rodando)

**Objetivo:** Lista completa de tarefas e subtarefas das Fases 0 a 7 do [IMPLEMENTATION-PLAN.md](IMPLEMENTATION-PLAN.md) para executar em ordem e deixar o sistema rodando.

---

## Fase 0 – Preparação

### 0.1 Criar projeto Next.js e configurar Supabase

- [ ] 0.1.1 Na raiz do projeto, rodar `npx create-next-app@latest .` (ou equivalente) com TypeScript, ESLint, Tailwind CSS, App Router; garantir que a pasta `docs/` não seja sobrescrita.
- [ ] 0.1.2 Instalar dependências: `@supabase/supabase-js` e `@supabase/ssr`.
- [ ] 0.1.3 Criar `src/lib/supabase/client.ts`: `createBrowserClient` com `NEXT_PUBLIC_SUPABASE_URL` e `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
- [ ] 0.1.4 Criar `src/lib/supabase/server.ts`: `createServerClient` com cookies para uso em rotas e Server Components.
- [ ] 0.1.5 Verificar que `npm run dev` sobe o Next.js sem erros.

### 0.2 Variáveis de ambiente

- [ ] 0.2.1 Criar `.env.local` na raiz com `NEXT_PUBLIC_SUPABASE_URL` e `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
- [ ] 0.2.2 Garantir que `.env.local` está no `.gitignore`.
- [ ] 0.2.3 Atualizar README com instruções: criar projeto no Supabase Dashboard, obter URL e anon key, preencher `.env.local`.

### 0.3 Estratégia de tenant (path)

- [ ] 0.3.1 Decidir path-based tenant: primeiro segmento da URL = `slug` da empresa (ex.: `/demo/conversas`).
- [ ] 0.3.2 Registrar em `docs/decisions.md` ou README: “Fase 0: path `/[slug]/...` para identificar empresa; subdomínio em iteração futura.”

---

## Fase 1 – Base de dados e autenticação

### 1.1 Schema SQL no Supabase

- [ ] 1.1.1 Criar tabela `companies` (id, name, slug unique, subdomain nullable unique, custom_domain nullable, created_at, updated_at).
- [ ] 1.1.2 Criar tabela `profiles` (id, user_id FK auth.users, company_id FK companies, role text, created_at, updated_at; unique user_id+company_id).
- [ ] 1.1.3 Criar tabela `queues` (id, company_id FK companies, name, slug, created_at, updated_at; unique company_id+slug).
- [ ] 1.1.4 Criar tabela `channels` (id, company_id FK companies, name, uazapi_instance_id, uazapi_token_encrypted, queue_id FK queues, webhook_secret nullable, is_active default true, created_at, updated_at).
- [ ] 1.1.5 Criar tabela `conversations` (id, company_id, channel_id, external_id, customer_phone, customer_name nullable, queue_id, assigned_to nullable, status, last_message_at, created_at, updated_at; unique channel_id+external_id; índice company_id+queue_id+last_message_at).
- [ ] 1.1.6 Criar tabela `messages` (id, conversation_id FK, direction, content, external_id nullable, sent_at, created_at; índice conversation_id+sent_at).
- [ ] 1.1.7 Incluir seed: uma company com slug `demo` (e opcionalmente uma fila `default`) para testes.

### 1.2 RLS (Row Level Security)

- [ ] 1.2.1 Habilitar RLS em `companies`, `profiles`, `queues`, `channels`, `conversations`, `messages`.
- [ ] 1.2.2 Política em `profiles`: SELECT/INSERT/UPDATE/DELETE onde `user_id = auth.uid()`.
- [ ] 1.2.3 Política em `companies`: SELECT onde id em (SELECT company_id FROM profiles WHERE user_id = auth.uid()).
- [ ] 1.2.4 Políticas em `queues`, `channels`, `conversations`, `messages`: SELECT (e INSERT/UPDATE/DELETE onde aplicável) onde `company_id` em (SELECT company_id FROM profiles WHERE user_id = auth.uid()).
- [ ] 1.2.5 Documentar ou comentar políticas no SQL (ou em doc).

### 1.3 Login/signup e vínculo usuário–empresa

- [ ] 1.3.1 Implementar chamada a `signInWithPassword` (Supabase Auth) com e-mail e senha.
- [ ] 1.3.2 Após login: buscar em `profiles` por `user_id = user.id`; obter `company_id` e role.
- [ ] 1.3.3 Se usuário não tiver perfil: redirecionar para “Sem empresa vinculada” ou (dev) inserir perfil na company `demo` com role admin.
- [ ] 1.3.4 Guardar `company_id` na sessão (cookie ou contexto React).
- [ ] 1.3.5 Definir rota de login: `/login`; após sucesso redirect para `/[slug]/` (ex.: `/demo`).

### 1.4 Tela de login (UI digisac / ClicVend)

- [ ] 1.4.1 Criar página `/login`: layout centralizado, fundo `#F8FAFC`.
- [ ] 1.4.2 Logo “ClicVend” no topo (cor primária escura).
- [ ] 1.4.3 Input e-mail e input senha (borda `#E2E8F0`, radius 8px, placeholder cinza); senha com ícone olho (mostrar/ocultar).
- [ ] 1.4.4 Link “Esqueci minha senha” à direita (cor secundária).
- [ ] 1.4.5 Botão “Entrar”: largura total, cor primária `#6366F1` ou `#7C3AED`, desabilitado em cinza até preenchimento.
- [ ] 1.4.6 Seletor de idioma (globo + “Português” + chevron).
- [ ] 1.4.7 Rodapé: “ClicVend © 2026” | “Termos de uso” | “Política de Privacidade”.
- [ ] 1.4.8 Conectar formulário ao `signInWithPassword` e redirect; exibir erro de credenciais.

---

## Fase 2 – Multi-tenant e rotas protegidas

### 2.1 Middleware de tenant

- [ ] 2.1.1 Criar middleware Next.js que intercepta rotas `/[slug]/...` (excluindo `login`, `api`, `_next`, assets).
- [ ] 2.1.2 Extrair `slug` do primeiro segmento da URL; buscar em `companies` por `slug`; obter `company_id`.
- [ ] 2.1.3 Se company não existir: redirect para `/login` ou página 404.
- [ ] 2.1.4 Validar que o usuário autenticado tem perfil nessa company (consultar `profiles`); se não, redirect ou 403.
- [ ] 2.1.5 Injetar `company_id` (e opcionalmente `slug`) em cookie, header ou contexto para uso nas rotas/páginas.

### 2.2 Layout do app (header digisac)

- [ ] 2.2.1 Criar layout principal para `/[slug]/`: barra superior com fundo `#1E293B` ou `#312E81`.
- [ ] 2.2.2 Logo ClicVend à esquerda (branco).
- [ ] 2.2.3 À direita: ícones (documentos, chat, contatos, ajuda, sino com badge, menu, bandeira, avatar com bolinha verde) em branco.
- [ ] 2.2.4 Estrutura e posição conforme DESIGN-SYSTEM §4.2 e §5.2; cores ClicVend.

### 2.3 Rotas protegidas

- [ ] 2.3.1 Em middleware ou layout: se rota for `/[slug]/...` e usuário não estiver logado, redirect para `/login` (com returnUrl opcional).
- [ ] 2.3.2 Se usuário logado mas sem vínculo com a company do slug, exibir “Sem acesso” ou redirect.
- [ ] 2.3.3 Garantir que APIs internas (quando chamadas do front) recebam ou leiam `company_id` da sessão e rejeitem se não autorizado.

---

## Fase 3 – Webhook e dados de conversas

### 3.1 Endpoint POST /api/webhook/uazapi

- [ ] 3.1.1 Criar rota `app/api/webhook/uazapi/route.ts` (POST).
- [ ] 3.1.2 Ler payload do body; identificar instância (campo do evento uazapi) e buscar canal por `uazapi_instance_id` em `channels`; obter `company_id`, `channel_id`, `queue_id`.
- [ ] 3.1.3 Extrair identificador da conversa (ex.: chatId) e mapear para `external_id`; extrair remetente (customer_phone), conteúdo da mensagem, timestamp.
- [ ] 3.1.4 Upsert em `conversations`: se não existir (channel_id + external_id), inserir com company_id, queue_id, customer_phone, status 'open'; se existir, atualizar `last_message_at`.
- [ ] 3.1.5 Inserir em `messages`: conversation_id, direction 'in', content, sent_at.
- [ ] 3.1.6 Responder 200 OK; opcional: validar token/secret do webhook se uazapi enviar.
- [ ] 3.1.7 Usar cliente Supabase com service role para inserir em conversations/messages (bypass RLS no webhook).

### 3.2 Documentar e testar webhook

- [ ] 3.2.1 Documentar URL do webhook (ex.: `https://seu-dominio.com/api/webhook/uazapi`) para configurar na uazapi por instância.
- [ ] 3.2.2 Testar com um número de teste: enviar mensagem no WhatsApp e verificar criação de conversa e mensagem no Supabase.

---

## Fase 4 – APIs do painel

### 4.1 GET /api/queues e GET /api/conversations

- [ ] 4.1.1 Criar `app/api/queues/route.ts`: GET; obter `company_id` da sessão (middleware/cookie); retornar filas da empresa com Supabase (com RLS).
- [ ] 4.1.2 Criar `app/api/conversations/route.ts`: GET; query opcional `queue_id`, `status`; filtrar por company_id da sessão; ordenar por last_message_at desc; paginação opcional.

### 4.2 GET /api/conversations/[id] e POST /api/conversations/[id]/messages

- [ ] 4.2.1 Criar `app/api/conversations/[id]/route.ts`: GET; validar que a conversa pertence à company da sessão; retornar conversa + mensagens ordenadas por sent_at.
- [ ] 4.2.2 Criar `app/api/conversations/[id]/messages/route.ts`: POST body `{ content }`; validar company e permissão; obter token do canal da conversa; chamar API uazapi para enviar mensagem; inserir em `messages` com direction 'out'; atualizar last_message_at da conversa.

### 4.3 CRUD /api/queues e /api/channels

- [ ] 4.3.1 GET/POST (e opcional PATCH/DELETE) em `app/api/queues/route.ts`; restringir a role admin (consultar profiles); validar company_id.
- [ ] 4.3.2 GET/POST (e opcional PATCH/DELETE) em `app/api/channels/route.ts`; admin apenas; armazenar token do canal criptografado; associar queue_id (fila padrão).

---

## Fase 5 – UI principal (Conversas e Chat)

### 5.1 Página Conversas (sidebar + lista)

- [ ] 5.1.1 Criar rota `/[slug]/conversas` (ou `/[slug]` como inbox).
- [ ] 5.1.2 Sidebar esquerda: título “Conversas”, ícone três pontos; campo busca “Pesquisar por nome ou número…”; abas Chats | Fila | Contatos (ativa com sublinhado primário); botão “Criar novo” com +.
- [ ] 5.1.3 Lista de conversas: para cada item, avatar, ícone WhatsApp verde, nome, último texto, data, badge de não lidas se houver; item selecionado com fundo roxo claro.
- [ ] 5.1.4 Área direita: empty state “Selecione um contato para iniciar uma conversa” com ícone.
- [ ] 5.1.5 Buscar conversas via GET /api/conversations (filtrar por fila se abas usarem); exibir lista.

### 5.2 Thread de mensagens

- [ ] 5.2.1 Ao clicar numa conversa: chamar GET /api/conversations/[id]; exibir cabeçalho do chat (seta voltar, avatar, nome do contato, tags se houver).
- [ ] 5.2.2 Exibir thread: mensagens do contato à esquerda (fundo branco); mensagens do atendente à direita (fundo verde claro); horário em cada uma.
- [ ] 5.2.3 Rodapé do chat: texto “Chamado pertence a outro atendente.” e link “Transferir chamado” quando aplicável.

### 5.3 Envio de mensagem

- [ ] 5.3.1 Campo de texto e botão enviar no rodapé do chat.
- [ ] 5.3.2 Ao enviar: POST /api/conversations/[id]/messages com `{ content }`; atualizar thread (refetch ou otimistic).
- [ ] 5.3.3 Tratar erro (ex.: falha uazapi) com mensagem ao usuário.

---

## Fase 6 – Configuração (Conexões, Contatos, Filas)

### 6.1 Página Conexões

- [ ] 6.1.1 Criar rota `/[slug]/conexoes`.
- [ ] 6.1.2 Título “Conexões”; botão “Exibir Filtros” e botão circular refresh.
- [ ] 6.1.3 Listar canais via GET /api/channels; exibir em cards: ícone WhatsApp verde, nome do canal, status “Conectado”, número (se houver), menu três pontos.
- [ ] 6.1.4 Paginação: “Mostrando X-Y de Z resultados” e dropdown “15 por página”.
- [ ] 6.1.5 (Opcional) Formulário para adicionar novo canal (instância uazapi, token, fila padrão).

### 6.2 Página Contatos

- [ ] 6.2.1 Criar rota `/[slug]/contatos`.
- [ ] 6.2.2 Título “Contatos”; botões “+ Importar contatos”, “Novo contato” (primário), “Exibir Filtros”, refresh.
- [ ] 6.2.3 Tabela: colunas Nome, Pessoa (avatar), Número, Conexão, Tags, Ações (três pontos); checkbox para seleção em massa.
- [ ] 6.2.4 Dados: podem vir de conversas (customer_phone, customer_name) ou tabela dedicada se existir; listar e exibir empty “Nenhum resultado encontrado” quando vazio.
- [ ] 6.2.5 Paginação no rodapé.

### 6.3 Integrar filas

- [ ] 6.3.1 Na lista de conversas, filtro por fila (dropdown ou abas) usando GET /api/queues e filtrando GET /api/conversations por queue_id.
- [ ] 6.3.2 Na configuração de canal (criar/editar), seleção de fila padrão (queue_id) para novas conversas do canal.

---

## Fase 7 – Onboarding e link por empresa

### 7.1 Fluxo de criação de empresa

- [ ] 7.1.1 Criar rota ou fluxo (ex.: `/onboarding` ou área admin): formulário com nome da empresa e slug (único).
- [ ] 7.1.2 Inserir em `companies` (name, slug); criar primeiro usuário (Supabase Auth) ou vincular existente; inserir em `profiles` com company_id e role 'admin'.
- [ ] 7.1.3 (Opcional) Criar fila padrão para a nova empresa.

### 7.2 Gerar e exibir link de acesso

- [ ] 7.2.1 Após criar empresa, gerar URL: `https://[seu-dominio]/[slug]` (ou subdomínio se implementado).
- [ ] 7.2.2 Exibir na tela de confirmação: “Seu link de acesso: …” com instruções para o admin acessar e configurar canal/fila.

### 7.3 (Opcional) Tags e Respostas rápidas

- [ ] 7.3.1 Página Tags: título “Tags”, busca “Pesquisar por nome”, tabela Cor, Nome (ordenável), Contatos com a tag, Ações; empty state e paginação.
- [ ] 7.3.2 Página Respostas rápidas: título “Respostas rápidas”, “Exibir Filtros”, refresh, tabela Título, Texto, Departamentos que podem utilizar, Ações; empty “Nenhum resultado encontrado”; paginação.
- [ ] 7.3.3 Backend: tabelas e APIs para tags e respostas rápidas se estiver no escopo v1.

---

## Ordem de execução

1. Fase 0 (0.1 → 0.2 → 0.3)  
2. Fase 1 (1.1 → 1.2 → 1.3 → 1.4)  
3. Fase 2 (2.1 → 2.2 → 2.3)  
4. Fase 3 (3.1 → 3.2)  
5. Fase 4 (4.1 → 4.2 → 4.3)  
6. Fase 5 (5.1 → 5.2 → 5.3)  
7. Fase 6 (6.1 → 6.2 → 6.3)  
8. Fase 7 (7.1 → 7.2; 7.3 opcional)

---

## Checklist final (sistema rodando)

- [ ] Login em `/login` com ClicVend; redirect para `/[slug]`.
- [ ] Header digisac com logo e ícones; rotas `/[slug]/...` protegidas.
- [ ] Webhook recebe mensagem WhatsApp e cria conversa + mensagem no banco.
- [ ] Lista de conversas em `/[slug]/conversas`; ao clicar, thread de mensagens; envio pelo painel funciona.
- [ ] Páginas Conexões e Contatos; filas no filtro e na configuração de canal.
- [ ] Onboarding: criar empresa e exibir link de acesso.

Referência: [IMPLEMENTATION-PLAN.md](IMPLEMENTATION-PLAN.md), [TECHNICAL-SPEC.md](TECHNICAL-SPEC.md), [DESIGN-SYSTEM.md](DESIGN-SYSTEM.md), [ACCEPTANCE-CRITERIA.md](ACCEPTANCE-CRITERIA.md).
