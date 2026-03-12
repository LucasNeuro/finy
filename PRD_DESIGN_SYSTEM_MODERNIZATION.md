# PRD - Modernização do Design System ClicVend

**Título do Projeto:** Implementação do Novo Design System e Modernização de Interface
**Data:** 12/03/2026
**Status:** Rascunho Inicial
**Versão:** 1.0

---

## 1. Introdução e Contexto

O ClicVend possui uma base de código funcional em Next.js e Tailwind CSS, mas carece de uma padronização visual rigorosa. A interface atual utiliza muitas classes utilitárias repetidas ("hardcoded") e cores literais, dificultando a manutenção, a escalabilidade e a implementação de novos temas (como Dark Mode).

Este documento define os requisitos para a criação de um **Novo Design System** focado em produtividade, consistência e estética moderna ("Enterprise UI"), mantendo a stack tecnológica atual (Tailwind CSS).

## 2. Objetivos do Projeto

1.  **Padronização Visual:** Eliminar inconsistências de design (botões com tamanhos diferentes, cores levemente distintas).
2.  **Aceleração do Desenvolvimento:** Reduzir o tempo de criação de novas telas através de componentes reutilizáveis (`<Button>`, `<Input>`) em vez de classes CSS repetitivas.
3.  **Preparação para Temas:** Estruturar tokens semânticos (ex: `--primary`) para permitir fácil implementação de Dark Mode ou White Labeling no futuro.
4.  **Melhoria de UX:** Introduzir feedbacks visuais mais refinados (estados de loading, hover, focus) e acessibilidade nativa.

## 3. Escopo

### 3.1 O que ESTÁ no escopo
*   Definição da nova arquitetura de **Design Tokens** (Cores, Tipografia, Espaçamentos).
*   Criação da biblioteca de componentes base (`src/components/ui`) inspirada no padrão shadcn/ui.
*   Documentação dos componentes e guias de uso.
*   Plano de migração gradual das telas existentes.

### 3.2 O que NÃO ESTÁ no escopo (nesta fase)
*   Reescrita completa da aplicação ("Big Bang"). A migração será gradual.
*   Alteração das regras de negócio ou lógica de backend.
*   Adoção de pré-processadores como SASS/SCSS (decisão técnica: manter Tailwind puro).

## 4. Requisitos Funcionais (Design System)

### 4.1 Design Tokens (Fundação)
O sistema deve utilizar variáveis CSS nativas gerenciadas pelo Tailwind.

*   **Paleta Semântica:**
    *   `Background` / `Foreground`: Cores de fundo e texto base.
    *   `Primary` / `Primary-Foreground`: Ação principal (Verde ClicVend).
    *   `Secondary` / `Secondary-Foreground`: Ações secundárias.
    *   `Destructive`: Ações de perigo/erro.
    *   `Muted`: Elementos desabilitados ou de menor hierarquia.
    *   `Accent`: Elementos de destaque sutil.
    *   `Border` / `Input` / `Ring`: Bordas e anéis de foco.
*   **Tipografia:**
    *   Manter `Plus Jakarta Sans` e `Sora`.
    *   Definir escalas de tamanho (`text-sm`, `text-base`, `text-lg`) padronizadas para cada contexto (títulos, corpo, legendas).
*   **Espaçamento e Raios:**
    *   `--radius`: Variável global para arredondamento de bordas (consistência entre botões, cards e inputs).

### 4.2 Biblioteca de Componentes (UI Kit)
Os componentes devem ser construídos em React + Tailwind, utilizando `class-variance-authority` (CVA) para gerenciar variantes.

**Componentes Prioritários (Fase 1):**
1.  **Button:** Variantes (`default`, `secondary`, `destructive`, `outline`, `ghost`, `link`) e tamanhos (`sm`, `default`, `lg`, `icon`).
2.  **Input / Textarea:** Campos de texto com estados de foco, erro e desabilitado padronizados.
3.  **Label:** Rótulos de formulário acessíveis.
4.  **Card:** Container padrão com cabeçalho, conteúdo e rodapé (`CardHeader`, `CardContent`, `CardFooter`).
5.  **Dialog (Modal):** Substituir implementações manuais por um componente acessível (foco preso, esc para fechar).
6.  **Select:** Dropdowns estilizados.
7.  **Avatar:** Componente para fotos de perfil com fallback (iniciais).
8.  **Badge:** Etiquetas para status (ex: "Aberto", "Fechado").
9.  **Skeleton:** Placeholder de carregamento animado.
10. **Toast:** Sistema de notificações flutuantes (feedback de ações).

## 5. Requisitos Não-Funcionais

*   **Acessibilidade (a11y):** Todos os componentes interativos devem ser navegáveis via teclado e possuir atributos ARIA corretos (baseado em Radix UI ou similar).
*   **Performance:** O uso de componentes não deve impactar negativamente o Core Web Vitals. Utilizar *Tree Shaking* do Tailwind.
*   **Manutenibilidade:** Código limpo, tipado em TypeScript e sem dependências desnecessárias.

## 6. Estratégia de Migração

A migração não deve paralisar o desenvolvimento de novas features.

1.  **Fase 0 (Setup):** Configurar `globals.css` com novos tokens e instalar dependências utilitárias (`clsx`, `tailwind-merge`, `cva`).
2.  **Fase 1 (Coexistência):** Novos componentes são criados em `src/components/ui`. Telas novas DEVEM usar os novos componentes.
3.  **Fase 2 (Refatoração Oportunista):** Ao dar manutenção em uma tela antiga (ex: `/login`), substituir os elementos legados pelos novos componentes.
4.  **Fase 3 (Limpeza):** Remover definições de cores antigas (`--clicvend-green`) quando não houver mais uso.

## 7. Métricas de Sucesso

*   **Redução de CSS:** Diminuição da repetição de classes utilitárias no código.
*   **Consistência:** 100% dos botões da aplicação seguem o mesmo padrão visual.
*   **Velocidade:** Desenvolvedores reportam maior facilidade em criar novas interfaces.
*   **Lighthouse:** Manter pontuação de Acessibilidade acima de 90.

---

**Aprovado por:** [Nome do Stakeholder]
**Data de Aprovação:** __/__/____
