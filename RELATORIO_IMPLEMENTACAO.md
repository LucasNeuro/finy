# Relatório de Implementação – ClicVend

Sistema de atendimento multi-empresas via WhatsApp. Resumo do que está implementado.

---

## 1. Autenticação e Acesso

| Recurso | Status | Descrição |
|---------|--------|-----------|
| **Login** | ✅ | Login por e-mail/senha (Supabase Auth) |
| **Cadastro** | ✅ | Página de cadastro |
| **Recuperar senha** | ✅ | Fluxo de recuperação de senha |
| **Auth callback** | ✅ | Callback OAuth do Supabase |
| **Middleware** | ✅ | Protege rotas `/{slug}`, redireciona não autenticados para `/login` |
| **Multi-tenant por slug** | ✅ | Cada empresa acessa via `/{slug}` (ex: `/onnze-tecnologia`) |
| **Cookies de contexto** | ✅ | `clicvend_company_id` e `clicvend_slug` definidos no middleware |

---

## 2. Landing Page e Onboarding

| Recurso | Status | Descrição |
|---------|--------|-----------|
| **Landing page** | ✅ | Hero, funcionalidades, como funciona, métricas |
| **Botão Cadastre-se** | ✅ | Redireciona para onboarding |
| **Botão Meu acesso** | ✅ | Modal para informar CNPJ e obter link do painel |
| **Lookup por CNPJ** | ✅ | API `/api/lookup-company` retorna slug e link se empresa cadastrada |
| **Onboarding em 5 etapas** | ✅ | Dados da empresa, acesso, endereço, configuração, revisão |
| **Busca CNPJ (OpenCNPJ)** | ✅ | Preenchimento automático de dados cadastrais |
| **Busca CEP** | ✅ | Preenchimento automático de endereço |
| **Criação de filas** | ✅ | Setores/equipes configurados no onboarding |
| **Sem empresa** | ✅ | Página quando usuário não tem empresa vinculada |

---

## 3. Layout e Interface

| Recurso | Status | Descrição |
|---------|--------|-----------|
| **Header fixo** | ✅ | Fixo no topo, não rola com a página |
| **Barra de ícones fixa** | ✅ | Sidebar preta com ícones (Conversas, Conexões, Contatos, etc.) |
| **Abas de navegação** | ✅ | Conversas, Conexões, Contatos, Respostas Rápidas, Tags, Perfil |
| **Paleta verde** | ✅ | Verde (#00A78F), verde escuro (#008F7A), preto, branco |
| **Logo e ícone** | ✅ | Gradiente verde, identidade ClicVend |
| **Fonte Plus Jakarta Sans** | ✅ | Tipografia moderna |

---

## 4. Conversas (WhatsApp)

| Recurso | Status | Descrição |
|---------|--------|-----------|
| **Lista de conversas** | ✅ | Sidebar com conversas por fila |
| **Filtro por fila** | ✅ | Dropdown "Todas as filas" |
| **Busca** | ✅ | Por nome ou número |
| **Thread de mensagens** | ✅ | Visualização e envio de mensagens |
| **API de conversas** | ✅ | GET/POST conversas e mensagens |
| **Webhook UAZ-API** | ✅ | Recebimento de mensagens via webhook |

---

## 5. Conexões (Canais WhatsApp)

| Recurso | Status | Descrição |
|---------|--------|-----------|
| **Lista de canais** | ✅ | Até 3 números por empresa |
| **Criar conexão** | ✅ | Cria instância UAZ-API + canal |
| **Status** | ✅ | Conectado, Conectando, Desconectado |
| **Estatísticas** | ✅ | Total de conversas, mensagens, abertas |
| **Config do canal** | ✅ | SideOver com abas: Conectar, Perfil, Privacidade, Chatbot, Presença |
| **QR Code / Pair Code** | ✅ | Conectar WhatsApp via UAZ-API |
| **Perfil do canal** | ✅ | Nome e foto do perfil |
| **Privacidade** | ✅ | Configurações de leitura, grupos, etc. |
| **Respostas automáticas** | ✅ | Chatbot com stop word, tempo, etc. |
| **Presença** | ✅ | Disponível / Indisponível |
| **Excluir canal** | ✅ | Remoção de conexão |

---

## 6. Contatos

| Recurso | Status | Descrição |
|---------|--------|-----------|
| **Lista de contatos** | ✅ | Extraídos das conversas (por telefone) |
| **Paginação** | ✅ | 15 por página |
| **Importar contatos** | ⚠️ | Botão presente, funcionalidade não implementada |
| **Novo contato** | ⚠️ | Botão presente, funcionalidade não implementada |

---

## 7. Respostas Rápidas

| Recurso | Status | Descrição |
|---------|--------|-----------|
| **Página** | ✅ | Estrutura com filtros e atualizar |
| **CRUD** | ⚠️ | Tabela `canned_responses` existe, UI não implementada |

---

## 8. Tags

| Recurso | Status | Descrição |
|---------|--------|-----------|
| **Página** | ✅ | Estrutura com busca |
| **CRUD** | ⚠️ | Tabelas `tags` e `conversation_tags` existem, UI não implementada |

---

## 9. Perfil da Empresa

| Recurso | Status | Descrição |
|---------|--------|-----------|
| **Visualização** | ✅ | Dados da empresa, endereço, link de acesso |
| **Link de acesso** | ✅ | URL completa + botões Copiar e Compartilhar |
| **Editar perfil** | ✅ | Formulário para atualizar dados e endereço |
| **Busca CEP** | ✅ | Preenchimento automático no editar |

---

## 10. APIs Implementadas

| API | Método | Descrição |
|-----|--------|-----------|
| `/api/company` | GET | Dados da empresa atual |
| `/api/company/links` | GET | Slug do link da empresa |
| `/api/channels` | GET, POST | Listar/criar canais |
| `/api/channels/[id]` | GET, PATCH, DELETE | Canal específico |
| `/api/channels/stats` | GET | Estatísticas por canal |
| `/api/queues` | GET | Filas da empresa |
| `/api/conversations` | GET | Lista de conversas |
| `/api/conversations/[id]` | GET | Detalhe da conversa |
| `/api/conversations/[id]/messages` | GET, POST | Mensagens |
| `/api/opencnpj/[cnpj]` | GET | Dados da Receita (OpenCNPJ) |
| `/api/lookup-company` | GET | Busca empresa por CNPJ (slug/link) |
| `/api/onboarding` | POST | Criação de empresa + usuário |
| `/api/upload/channel-profile-image` | POST | Upload de foto do canal |
| `/api/uazapi/instance` | POST | Criar instância UAZ-API |
| `/api/uazapi/instance/status` | GET | Status da conexão |
| `/api/uazapi/instance/connect` | POST | Iniciar conexão |
| `/api/uazapi/instance/disconnect` | POST | Desconectar |
| `/api/uazapi/instance/delete` | DELETE | Excluir instância |
| `/api/uazapi/instance/profile` | PATCH | Atualizar perfil |
| `/api/uazapi/instance/privacy` | PATCH | Privacidade |
| `/api/uazapi/instance/chatbot` | PATCH | Respostas automáticas |
| `/api/uazapi/instance/presence` | PATCH | Presença |
| `/api/uazapi/instance/delay` | PATCH | Delay de mensagens |
| `/api/uazapi/instance/proxy` | PATCH | Proxy |
| `/api/uazapi/instance/webhook` | PATCH | Webhook |
| `/api/uazapi/webhook` | POST | Webhook global UAZ-API |
| `/api/webhook/uazapi` | POST | Webhook alternativo |

---

## 11. Banco de Dados (Supabase)

### Tabelas principais
- **companies** – Empresas (CNPJ, razão social, endereço, etc.)
- **company_links** – Links por empresa (slug, is_active)
- **queues** – Filas/equipes
- **profiles** – Usuários por empresa (admin, supervisor, agent)
- **channels** – Canais WhatsApp (UAZ-API)
- **conversations** – Conversas
- **messages** – Mensagens

### Tabelas expandidas (Zendesk-like)
- **tags** – Tags por empresa
- **conversation_tags** – Tags em conversas
- **canned_responses** – Respostas rápidas
- **conversation_ratings** – Avaliação de atendimento
- **custom_field_definitions** – Campos personalizados
- **conversation_custom_fields** – Valores dos campos

### RLS
- Políticas por empresa (company_id)
- Acesso via profiles (user_id + company_id)

---

## 12. Integração UAZ-API

- Criação de instâncias
- Conexão via QR Code ou Pair Code
- Webhook para mensagens recebidas
- Perfil, privacidade, chatbot, presença
- Envio de mensagens via API

---

## 13. Pendências / Melhorias

| Item | Prioridade |
|------|------------|
| CRUD de Respostas Rápidas | Média |
| CRUD de Tags | Média |
| Importar contatos | Baixa |
| Novo contato manual | Baixa |
| Prioridade e tipo em conversas | Baixa |
| Avaliação de satisfação | Baixa |
| Campos personalizados | Baixa |

---

*Relatório gerado em março de 2026.*
