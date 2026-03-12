# Relatório de Design e Interface - ClicVend

Este documento apresenta uma análise técnica da interface, sistema de design e arquitetura de componentes do projeto **ClicVend**. A análise foi realizada através da leitura estática do código-fonte, focando nas tecnologias empregadas e padrões de implementação.

## 1. Visão Geral da Stack Tecnológica

A interface do usuário é construída sobre uma stack moderna baseada em React:

*   **Framework:** Next.js (App Router)
*   **Linguagem:** TypeScript
*   **Estilização:** Tailwind CSS
*   **Ícones:** Lucide React
*   **Fontes:** `Plus Jakarta Sans` (texto principal) e `Sora` (títulos/display), carregadas via `next/font/google`.
*   **Gerenciamento de Estado/Dados:** `SWR` (para data fetching e cache) e React Hooks padrão (`useState`, `useEffect`).
*   **Tabelas:** `@tanstack/react-table`

## 2. Sistema de Design (Design System)

O projeto não utiliza uma biblioteca de componentes de terceiros "pesada" (como Material UI ou AntD). Em vez disso, adota uma abordagem de **componentes customizados construídos com Tailwind CSS**.

### 2.1 Paleta de Cores
As cores são definidas através de variáveis CSS globais (`src/app/globals.css`) e estendidas na configuração do Tailwind (`tailwind.config.ts`):

*   **Verde (Primário):** Diversos tons de verde (`#5EF0C2` a `#006B35`), com destaque para o `--clicvend-green` (`#00A854`) e `--clicvend-green-lightest` (`#5EF0C2`). No Tailwind, mapeado como `clicvend.green`.
*   **Azul/Teal (Secundário):** Tons de azul e verde-azulado (`#00C4C4`, `#0066CC`).
*   **Destaque:** Cores vibrantes como `#00FFCC` (verde neon) e `#00CCFF` (azul vibrante).
*   **Backgrounds:** Fundos suaves como `#D4FFEC` (verde claro) e `#E6F2FF` (azul claro).

### 2.2 Tipografia
*   **Sans (Corpo):** `Plus Jakarta Sans`.
*   **Display (Títulos):** `Sora`.
*   A tipografia é aplicada via classes utilitárias do Tailwind (`font-sans`, `font-display`).

### 2.3 Layout e Estrutura Global
O layout da aplicação (`src/app/layout.tsx` e componentes relacionados) segue uma estrutura de dashboard:

1.  **Sidebar Lateral (`AppSidebar`):** Uma faixa lateral fixa à esquerda, estreita, com gradiente escuro (`from-black via-emerald-950 to-emerald-900`).
2.  **Cabeçalho (`AppHeader`):** Barra superior contendo informações do usuário, notificações e seletor de contexto (empresa).
3.  **Navegação (`AppNavTabs`):** Sistema de abas horizontais roláveis (`scroll-tabs`), exibindo links como "Conversas", "Tickets", "Conexões", baseados nas permissões do usuário.
4.  **Conteúdo Principal:** Renderizado abaixo do cabeçalho/abas.

## 3. Componentes de Interface

A arquitetura de componentes é "Flat" (plana), localizados principalmente em `src/components`. Não foi identificada a estrutura padrão do `shadcn/ui` (pasta `components/ui`), indicando que os componentes são proprietários.

### 3.1 Componentes Chave Identificados

*   **SideOver (`src/components/SideOver.tsx`):**
    *   Um painel deslizante (drawer) que entra pela direita.
    *   Usado extensivamente para detalhes de contatos, configurações e formulários secundários.
    *   Implementação customizada com transições CSS (`translate-x`).
    *   Possui backdrop escuro (`bg-black/30`) e gerenciamento de foco/teclado (ESC para fechar).

*   **ConfirmDialog (`src/components/ConfirmDialog.tsx`):**
    *   Modal centralizado para confirmações (ex: "Tem certeza?").
    *   Suporta variantes visualmente distintas: `primary` (laranja/amber) e `danger` (vermelho).
    *   Implementação customizada com acessibilidade básica (`role="dialog"`).

*   **Tabelas de Dados:**
    *   Implementadas nas páginas (ex: `src/app/[slug]/contatos/page.tsx`) utilizando `@tanstack/react-table`.
    *   Estilização manual das linhas e células com classes Tailwind (bordas, paddings, hovers).

*   **AppNavTabs (`src/components/AppNavTabs.tsx`):**
    *   Componente de navegação principal.
    *   Utiliza `useSWR` para verificar permissões e renderizar apenas as abas permitidas.
    *   Estilo visual: Botões com `bg-emerald-600/30` quando ativos e hover translúcido.

### 3.2 Ícones
O projeto utiliza a biblioteca `lucide-react` para toda a iconografia (ex: `MessageSquare`, `Users`, `Settings`, `Check`, `X`).

## 4. Observações de UX/UI

*   **Feedback Visual:** Uso consistente de estados de hover e active nos botões e links de navegação.
*   **Scrollbars Customizadas:** O arquivo `globals.css` define estilos específicos para barras de rolagem (`.scroll-area`, `.scroll-area-conversas`), garantindo uma aparência mais limpa e fina em containers de rolagem interna.
*   **Responsividade:** O layout utiliza classes responsivas do Tailwind (embora a Sidebar fixa sugira um foco forte em desktop/tablet). O componente `SideOver` tem `maxWidth: 100vw`, adaptando-se a telas menores.
*   **Consistência:** A aplicação mantém consistência visual através do reuso de variáveis CSS e classes utilitárias padronizadas para cores e espaçamentos.

## 5. Conclusão

O projeto ClicVend possui uma base de código de frontend bem estruturada, moderna e limpa. A decisão de não depender de bibliotecas de componentes pesadas resulta em um bundle possivelmente menor e maior controle sobre o design visual. O uso de Tailwind CSS com variáveis CSS permite fácil manutenção do tema visual (cores). A arquitetura favorece a criação de interfaces ricas (SPA-like) com navegação fluida e componentes interativos como o `SideOver`.
