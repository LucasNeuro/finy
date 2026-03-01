# Design System – ClicVend

**Versão:** 2.0  
**Data:** 2025-02-28  
**Marca:** ClicVend – Sistema de atendimento multi-empresas (WhatsApp)  
**Referência de interface:** Baseado na estrutura e componentes da plataforma digisac; aplicamos identidade ClicVend (logo e paleta própria).

Este documento define a direção visual e os padrões de UI do painel ClicVend. A interface segue o **layout e os componentes da digisac**, com **nossa marca (ClicVend), nosso logo e nossa paleta de cores**. As imagens de referência ficam em `docs/design/references/` (ver README da pasta).

---

## 1. Identidade e marca

- **Nome do produto:** ClicVend  
- **Referência estrutural:** Interface digisac (layout, componentes, fluxos) — copiar estrutura; trocar apenas cores e logo.  
- **Tom:** Profissional, limpo, focado em atendimento e vendas.  
- **Uso:** Painel web para atendentes, admins e supervisores; multi-empresa com link próprio por tenant.

---

## 2. Paleta de cores (ClicVend)

Substituir as cores da referência (digisac) pela paleta abaixo. O layout e os componentes permanecem iguais.

| Uso | Descrição | Hex (ClicVend) | Onde usar |
|-----|-----------|----------------|-----------|
| **Header / barra superior** | Fundo da barra top (onde fica logo e ícones) | `#1E293B` ou `#312E81` (azul escuro / índigo escuro) | Toda a largura do topo; ícones e logo em branco |
| **Primário (botões principais)** | Botão “Entrar”, “Novo contato”, “Exibir Filtros”, paginação ativa | `#6366F1` ou `#7C3AED` (índigo / roxo) | Botões de ação primária, círculo da página ativa na paginação |
| **Primário hover** | Estado hover dos botões primários | `#4F46E5` ou `#6D28D9` | Hover em botões e itens ativos |
| **Fundo principal** | Área de conteúdo, cards, tabelas | `#FFFFFF` | Corpo da página, cards, inputs |
| **Fundo secundário** | Lista de conversas, fundo do chat | `#F8FAFC` / `#F1F5F9` | Sidebar de conversas, área de mensagens |
| **WhatsApp / Conectado** | Ícone WhatsApp, status “Conectado”, bolinha online | `#22C55E` (verde) | Ícone do canal, status de conexão, indicador online no avatar |
| **Badge notificação / NOVO** | Badge de notificações (ex.: 15), tag “NOVO” | `#EF4444` (vermelho) | Sino com número, etiqueta “NOVO” em ícones |
| **Texto primário** | Títulos de página, nomes, conteúdo | `#0F172A` / `#1E293B` | Título “Conexões”, “Contatos”, nomes na lista |
| **Texto secundário** | Legendas, timestamps, “Esqueci minha senha” | `#64748B` / `#94A3B8` | “Ontem”, “Mostrando 1-2 de 2 resultados”, links secundários |
| **Borda / divisor** | Bordas de inputs, linhas de tabela | `#E2E8F0` / `#CBD5E1` | Inputs de login, linhas da tabela |
| **Botão login (estado normal)** | Botão “Entrar” na tela de login (antes de preencher) | `#94A3B8` (cinza) | Login: botão até campos válidos |
| **Item selecionado (lista)** | Fundo do item selecionado na lista de conversas | `#EEF2FF` ou `#EDE9FE` (roxo muito claro) | Linha da conversa ativa na sidebar |
| **Mensagem atendente (chat)** | Fundo do balão da mensagem enviada pelo atendente | `#DCFCE7` ou `#D1FAE5` (verde claro) | Bolhas à direita no chat |
| **Mensagem contato (chat)** | Fundo do balão da mensagem do contato | `#FFFFFF` | Bolhas à esquerda; borda sutil |

---

## 3. Tipografia

- **Família:** Sans-serif (ex.: Inter, system-ui, “Segoe UI”, ou equivalente).  
- **Hierarquia:**
  - **Título de página (main):** 24–28px, bold (ex.: “Conexões”, “Contatos”, “Tags”, “Respostas rápidas”).
  - **Título de seção (sidebar):** 16–18px, semibold (ex.: “Conversas”).
  - **Corpo / lista:** 14px, regular (nomes, números, texto de tabela).
  - **Labels / placeholders:** 14px, cor secundária (ex.: “Pesquisar por nome ou número…”, “Digite a senha”).
  - **Pagination / “Mostrando…”:** 12–14px, cor secundária.
  - **Login – logo:** tamanho maior, peso médio ou bold, cor primária escura.

---

## 4. Layout geral (estrutura digisac)

### 4.1 Tela de login (fora do app)

- **Layout:** Conteúdo centralizado vertical e horizontalmente; fundo branco ou cinza muito claro.
- **Ordem de cima para baixo:**
  1. Logo ClicVend (centrado).
  2. Dois inputs empilhados (e-mail/usuário; senha com ícone de olho para mostrar/ocultar).
  3. Link “Esqueci minha senha” alinhado à direita.
  4. Botão “Entrar” (largura total do bloco, cantos arredondados).
  5. Seletor de idioma (ícone de globo + “Português” + seta).
  6. Rodapé: “ClicVend © 2026” | “Termos de uso” | “Política de Privacidade”.
- **Inputs:** Cantos arredondados, borda fina cinza; placeholder em cinza.
- **Botão:** Primário na cor ClicVend; texto branco; desabilitado em cinza até preenchimento válido.

### 4.2 Barra superior (header) – dentro do app

- **Largura total;** fundo na cor do header (azul escuro / índigo).
- **Esquerda:** Logo ClicVend (texto ou imagem, branco).
- **Direita (horizontal):** Ícones brancos, em linha:
  - Documentos, Chat, item com tag “NOVO” (badge vermelha), Contatos/People, outros módulos, Ajuda (?), seta dropdown, Sino (com badge “15” em vermelho), Menu (três linhas), Bandeira (idioma), Avatar do usuário (inicial “C” ou foto) com bolinha verde (online) e seta.
- **Consistência:** Mesmos ícones e posição da referência digisac; apenas cor de fundo e logo trocados.

### 4.3 Páginas com sidebar “Conversas”

- **Sidebar esquerda (conversas/contatos):**
  - Título “Conversas” + ícone de três pontos (menu).
  - Campo de busca: “Pesquisar por nome ou número…” + ícone de funil à direita.
  - Abas: “Chats” | “Fila” | “Contatos” — aba ativa com sublinhado na cor primária.
  - Botão/link “Criar novo” com ícone “+”.
  - Lista rolável: cada item com avatar, ícone verde WhatsApp (canto do avatar), nome, mensagem/status (ex.: “Você não tem permissão…”), data (“Ontem”), badge vermelha com número quando houver não lidas. Item selecionado com fundo roxo claro (ver paleta).
- **Área principal à direita:** Conteúdo da conversa (chat) ou empty state (ver seção 7).

### 4.4 Páginas só com área principal (sem sidebar de conversas)

- **Topo:** Título da página à esquerda (ex.: “Conexões”, “Contatos”, “Tags”, “Respostas rápidas”).
- **Ações à direita:** Botões secundários (ex.: “Importar contatos”, “Exibir Filtros”) + botão primário (ex.: “Novo contato”) + botão circular de atualizar (refresh).
- **Conteúdo:** Cards (Conexões) ou tabela (Contatos, Tags, Respostas rápidas); ao final, paginação e “Mostrando X-Y de Z resultados” + “15 por página”.

---

## 5. Componentes principais (espelho digisac)

### 5.1 Login

- **Logo:** ClicVend no topo, cor primária escura ou preto.
- **Inputs:** Altura ~40–44px; borda `1px` cinza; radius ~8px; placeholder cinza.
- **Senha:** Ícone de olho à direita dentro do campo para alternar visibilidade.
- **“Esqueci minha senha”:** Link em cor secundária, alinhado à direita.
- **Botão “Entrar”:** Largura 100% do bloco; cor primária ClicVend; texto branco; radius ~8px. Estado desabilitado: cinza.
- **Idioma:** Globo + “Português” + chevron; estilo de dropdown discreto.
- **Rodapé:** Texto pequeno; links “Termos de uso” e “Política de Privacidade” separados por pipe.

### 5.2 Header (app)

- Altura fixa (~56–64px). Logo e ícones alinhados verticalmente ao centro.
- Ícones: outline, brancos, tamanho consistente. Badge “NOVO” em retângulo vermelho; badge do sino com número em círculo vermelho.
- Avatar: círculo com inicial ou foto; bolinha verde (online) no canto.

### 5.3 Cards de conexão (ex.: Conexões)

- Card branco; sombra leve; cantos arredondados (~8–12px).
- Conteúdo: ícone WhatsApp (verde) à esquerda; nome do canal (ex.: “Canal de Atendimento A”); status “Conectado” em verde; ícone de telefone + número; menu de três pontos no canto superior direito.
- Grid: 2 cards lado a lado (ou responsivo 1 coluna em mobile).

### 5.4 Tabelas (Contatos, Tags, Respostas rápidas)

- **Cabeçalho:** Linha com checkbox (seleção em massa), depois colunas: Nome, Pessoa/Número, Conexão, Tags, Ações (ícone de três pontos). Ou conforme colunas da tela (ex.: Cor, Nome, Contatos com a tag; Título, Texto, Departamentos, Ações).
- **Linhas:** Altura confortável (~48px); borda inferior sutil; checkbox, avatar/ícone, texto; ícone de ações (três pontos) no fim.
- **Empty state:** “Nenhum resultado encontrado” centralizado, cor secundária.
- **Pagination (rodapé):** “«” “<” “1” “>” “»”; página atual em círculo com fundo primário e texto branco; texto “Mostrando X-Y de Z resultados” à direita; dropdown “15 por página”.

### 5.5 Botões

- **Primário:** Fundo cor primária ClicVend; texto branco; padding horizontal e vertical consistente; radius ~6–8px. Ex.: “Entrar”, “Novo contato”, “Exibir Filtros”.
- **Secundário:** Borda cinza ou fundo cinza claro; texto escuro. Ex.: “Importar contatos”, “Exibir Filtros” (quando não for o único CTA).
- **Circular (refresh):** Ícone de atualizar; fundo cinza claro; sem texto.
- **Tag “NOVO”:** Pequeno retângulo vermelho com texto “NOVO” branco sobre ícone.

### 5.6 Campo de busca

- Input com ícone de lupa (esquerda ou direita); placeholder “Pesquisar por nome ou número…” ou “Pesquisar por nome”; borda cinza; radius ~6–8px. Opcional: ícone de funil ao lado para filtros.

### 5.7 Chat (área de conversa)

- **Cabeçalho do chat:** Seta voltar; avatar; nome completo do contato; tags em pills (ex.: “Canal de Atendimento B” em verde, “Comercial” e nome do atendente em cinza); ícones de busca, atualizar e menu (três pontos).
- **Mensagens:** Balões com cantos arredondados. Mensagens do **contato** à esquerda: fundo branco, borda sutil. Mensagens do **atendente** à direita: fundo verde claro (paleta); ícone de duplo check ao lado. Nome e horário em texto pequeno acima ou dentro do balão.
- **Rodapé do chat:** Mensagem de contexto (ex.: “Chamado pertence a outro atendente.”) e link “Transferir chamado” em azul/primário.

### 5.8 Empty states

- **Lista de conversas (nenhuma selecionada):** Ícone centralizado (ex.: dois balões de chat em cinza claro); texto “Selecione um contato para iniciar uma conversa”.
- **Tabela vazia:** “Nenhum resultado encontrado” centralizado, cor secundária.
- Manter padrão: ícone ou ilustração simples + uma linha de texto clara.

---

## 6. Ícones e recursos

- **Header e navegação:** Ícones outline, brancos no header; estilo consistente (documento, chat, pessoa, sino, bandeira, avatar, seta, menu).
- **Canais:** Ícone oficial WhatsApp (verde) onde fizer sentido (card de conexão, lista de conversas).
- **Status:** Bolinha verde (online/conectado); badge vermelha para contagem (notificações, não lidas).
- **Ações:** Três pontos verticais para menu de contexto; lupa para busca; funil para filtros; seta circular para refresh.

---

## 7. Referências visuais (imagens)

As telas de referência (base digisac, a serem replicadas com ClicVend) ficam em `docs/design/references/`. Nomes sugeridos e conteúdo de cada tela estão em `docs/design/references/README.md`. Ao implementar:

- Use as imagens para **layout exato** (posição do header, sidebar, tabelas, cards, paginação).
- Substitua **sempre** logo e texto “digisac” por **ClicVend** e nosso logo.
- Aplique **apenas** a paleta da seção 2 (ClicVend); o resto da estrutura permanece igual à referência.

---

## 8. Acessibilidade e consistência

- Contraste entre texto e fundo conforme WCAG 2.1 AA quando possível.
- Áreas clicáveis com tamanho mínimo (~44px) para ícones e botões.
- Foco visível em links, botões e inputs (outline ou borda).
- Espaçamento consistente (ex.: 8px ou 12px como base) entre seções, cards e linhas de tabela.
- Manter a mesma ordem de elementos e nomes de rótulos da referência (ex.: “Exibir Filtros”, “Mostrando X-Y de Z resultados”, “por página”) para facilitar uso e documentação.

---

## 9. Resumo para implementação

1. **Copiar** a estrutura e os componentes da interface digisac (login, header, sidebar Conversas, cards de conexão, tabelas, chat, paginação, empty states).
2. **Substituir** todas as ocorrências de logo e nome “digisac” por **ClicVend** e nosso logo.
3. **Aplicar** somente a paleta de cores da seção 2 (header escuro ClicVend, primário roxo/índigo, verde para WhatsApp/online, vermelho para badges).
4. **Manter** textos em português, placeholders e rótulos iguais ou muito próximos aos da referência (ex.: “Pesquisar por nome ou número…”, “Exibir Filtros”, “Novo contato”, “Nenhum resultado encontrado”).

---

*Este design system complementa o PRD e o Technical Spec. O agente deve replicar a interface da digisac com identidade ClicVend (logo e cores) e usar as imagens em `design/references/` para fidelidade de layout.*
