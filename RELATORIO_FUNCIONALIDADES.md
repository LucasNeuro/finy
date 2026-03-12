# Relatório Detalhado de Telas e Funcionalidades - ClicVend

Este documento descreve minuciosamente todas as telas, rotas e funcionalidades operacionais do sistema **ClicVend**, mapeadas a partir da análise do código-fonte.

## 1. Módulo de Autenticação

### 1.1 Login (`/login`)
*   **Interface:** Layout de duas colunas (Desktop) com imagem/gradiente à direita e formulário à esquerda.
*   **Funcionalidades:**
    *   Autenticação via E-mail e Senha.
    *   Botão "Olho" para visualizar/ocultar senha.
    *   Feedback visual de carregamento (`Loader2`) e sucesso (redirecionamento automático).
    *   Validação de campos obrigatórios.

### 1.2 Controle de Permissões (ACL)
*   O sistema carrega permissões do usuário via API (`/api/auth/permissions`) ao entrar em uma empresa.
*   A exibição de abas e botões é condicional baseada nessas permissões (ex: `inbox.read`, `settings.view`, `users.manage`).

---

## 2. Módulo de Atendimento (Conversas)

Rota: `/conversas`

### 2.1 Lista de Conversas (Sidebar Lateral)
*   **Componente:** `ConversasSidebar`
*   **Visualização:** Lista de chats ativos, ordenados por recência.
*   **Filtros e Abas:**
    *   **Minhas:** Conversas atribuídas ao usuário logado.
    *   **Não Atribuídas:** Conversas na fila sem atendente.
    *   **Tudo/Fechados:** Histórico completo.
*   **Indicadores:**
    *   Contador de mensagens não lidas.
    *   Ícone do canal (WhatsApp) de origem.
    *   Status do ticket (Aberto, Pendente, Resolvido).

### 2.2 Tela de Chat (`/conversas/[id]`)
A interface principal de operação do atendente.
*   **Cabeçalho do Chat:**
    *   Nome e telefone do contato.
    *   Botões de ação rápida: Finalizar atendimento, Transferir (Reatribuir), Agendar retorno.
*   **Área de Mensagens:**
    *   Renderização em tempo real (`RealtimeMessages`).
    *   Diferenciação visual entre mensagens enviadas (direita) e recebidas (esquerda).
    *   Suporte a tipos de mídia: Texto, Imagem, Vídeo, Áudio (com player customizado `ChatAudioPlayer`), Documentos.
    *   **Reações:** Menu de reações com emojis (`EmojiReactionPicker`) ao passar o mouse na mensagem.
*   **Barra de Input (Composição):**
    *   Campo de texto com suporte a emojis.
    *   **Anexos:** Menu "Clips" para upload de arquivos (Câmera, Galeria, Documentos).
    *   **Áudio:** Gravador de voz integrado (`Mic`) com funções de Gravar, Pausar e Enviar.
    *   **Respostas Rápidas:** Integração para inserir mensagens predefinidas via atalho (`/`).

### 2.3 Painel Lateral de Detalhes (SideOver)
*   Acessível ao clicar no cabeçalho do contato.
*   Exibe dados completos do cliente (CRM).
*   Histórico de tickets anteriores.
*   Campos personalizados (Tags/Formulários).

---

## 3. Módulo de Tickets (Kanban)

Rota: `/tickets`

### 3.1 Visão Geral
*   Gerenciamento visual do fluxo de atendimento.
*   **Modos de Visualização:**
    *   **Kanban:** Colunas arrastáveis (drag-and-drop não explícito no código lido, mas estrutura de colunas presente).
    *   **Tabela:** Lista tradicional para alta densidade de dados.

### 3.2 Funcionalidades
*   **Colunas Configuráveis:** Botão para abrir `StatusConfigSideOver` e definir quais status aparecem no Kanban e suas cores.
*   **Filtros:**
    *   Por Fila (Queue).
    *   Por Atendente.
*   **Ações em Massa:** Seleção múltipla de tickets para "Reatribuir" (`ReassignSideOver`) ou mudar status.
*   **Cartão do Ticket:** Mostra nome do cliente, tempo de espera, fila atual e responsável.

---

## 4. Módulo de Conexões (Canais)

Rota: `/conexoes`

### 4.1 Gerenciamento de Canais
*   Lista as instâncias do WhatsApp conectadas (UAZAPI).
*   **Estados de Conexão:**
    *   *QR Code:* Exibe o código para pareamento.
    *   *Conectado:* Mostra foto de perfil e número conectado.
    *   *Desconectado/Erro:* Alertas visuais.
*   **Ações:**
    *   **Adicionar Canal:** Wizard para criar nova conexão.
    *   **Sincronizar:** Botões para importar contatos e histórico de mensagens antigas.
    *   **Configurar:** Definir filas padrão para o canal.
    *   **Excluir:** Remover conexão (com confirmação de segurança).

---

## 5. Módulo de Filas

Rota: `/filas`

### 5.1 Gestão de Filas de Atendimento
*   CRUD (Criar, Ler, Atualizar, Deletar) de filas (departamentos).
*   **Configuração (`QueueConfigSideOver`):**
    *   Nome e cor da fila.
    *   Associação com canais específicos.
    *   Definição de horário de funcionamento (se disponível na API).

---

## 6. Módulo de Contatos (CRM)

Rota: `/contatos`

### 6.1 Lista de Contatos
*   Tabela paginada (`@tanstack/react-table`) com todos os contatos da base.
*   **Colunas:** Nome, Telefone (formatado padrão Brasil), E-mail, Etiquetas (Tags).
*   **Busca:** Campo de pesquisa por nome ou telefone.

### 6.2 Detalhes do Contato (`ContactDetailSideOver`)
*   Painel deslizante para edição completa.
*   Editar dados cadastrais.
*   Adicionar/Remover Tags.
*   Ver histórico de conversas associadas.
*   Bloquear contato.

---

## 7. Módulo de Respostas Rápidas

Rota: `/respostas-rapidas`

### 7.1 Biblioteca de Mensagens
*   Cadastro de mensagens frequentes para agilizar o atendimento.
*   **Tipos Suportados:** Texto puro e Arquivos (Mídia/Docs).
*   **Atalhos:** Definição de gatilhos (ex: "ola" para "Olá, tudo bem?").

### 7.2 Funcionalidades Avançadas
*   **IA Generativa:** Botão para gerar sugestões de respostas com Inteligência Artificial.
*   **Importação:** Ferramenta para importar respostas em massa (CSV/Excel).
*   **Permissões:** Restringir respostas a filas ou canais específicos.

---

## 8. Módulo de Tags e Formulários

Rota: `/tags`

### 8.1 Etiquetas (Tags)
*   Sistema de categorização colorida.
*   Tipos: Tags de Contato (CRM) e Tags de Conversa (Atendimento).

### 8.2 Formulários Personalizados
*   Construtor de formulários (`FormBuilder`).
*   Permite criar campos extras que devem ser preenchidos durante o atendimento (ex: "Motivo do contato", "CPF", "Nº Pedido").

---

## 9. Módulo de Cargos e Usuários

Rota: `/cargos-usuarios`

### 9.1 Gestão de Equipe
*   **Usuários:**
    *   Convite/Cadastro de novos atendentes.
    *   Definição de credenciais (Email/Senha).
    *   Atribuição de Filas (quais departamentos o usuário atende).
*   **Cargos (Roles):**
    *   Criação de perfis de acesso (ex: "Administrador", "Atendente", "Supervisor").
    *   Seleção granular de permissões (checkboxes para cada função do sistema).

---

## 10. Módulo de Perfil

Rota: `/perfil`

### 10.1 Dados da Conta
*   Visualização dos dados da empresa atual (CNPJ, Endereço).
*   Edição do perfil do usuário logado (Avatar, Nome).
*   Upload de foto de perfil.

---

## Componentes Globais de Interface

*   **AppNavTabs:** Barra de navegação superior, exibe apenas os módulos permitidos ao usuário.
*   **SideOver:** Painéis laterais deslizantes usados para todos os formulários de criação/edição, mantendo o contexto da tela de fundo.
*   **ConfirmDialog:** Modais de segurança para ações destrutivas.
