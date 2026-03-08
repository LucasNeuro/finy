# Documentação do Projeto – Sistema de Atendimento Multi-Empresas

Esta pasta contém a documentação para construção do sistema por um agente ou equipe de desenvolvimento.

## Documentos

| Arquivo | Descrição |
|---------|-----------|
| **PRD.md** | Product Requirements Document: visão, objetivos, personas, escopo, funcionalidades, fluxos e critérios de sucesso. |
| **TECHNICAL-SPEC.md** | Especificação técnica: stack, multi-tenancy, modelo de dados, APIs, webhook, painel, segurança e onboarding. |
| **ACCEPTANCE-CRITERIA.md** | Critérios de aceite por feature (checklist para validação e handoff). |
| **DESIGN-SYSTEM.md** | Design system ClicVend: paleta, tipografia, layout, componentes, empty states e referências visuais. |
| **IMPLEMENTATION-PLAN.md** | Plano de implementação em fases (0–7): ordem de execução e checklist para o agente. |
| **IMPLEMENTATION-TASKS-FULL.md** | Tarefas e subtarefas detalhadas (Fases 0–7) com checkboxes para deixar o sistema rodando. |
| **redis-arquitetura-chat-tickets.md** | Uso do Redis em chat e tickets: cache lista/detalhe/counts, webhook UAZAPI, invalidação e por que fica mais rápido. |
| **planejamento-alta-escala-ia-bots.md** | Planejamento para alta escala, IA embutida e bots: eventos, filas, workers, schema e decisões antes de implementar. |
| **distribuicao-automatica-round-robin.md** | Distribuição automática de atendimentos por fila usando round-robin (Supabase + Redis), integrado ao webhook UAZAPI. |
| **chat-realtime-performance.md** | Otimizações do chat para desempenho excelente e atualizações em tempo real (Supabase Realtime, React.memo, scroll inteligente). |
| **fluxo-mensagens-automatico.md** | Como o sistema gerencia mensagens recebidas automaticamente (criação de conversas e contatos sem sincronização prévia). |
| **debug-webhook-mensagens.md** | Guia de diagnóstico para quando mensagens não chegam na aplicação (logs, problemas comuns e soluções). |
| **guia-verificacao-banco.md** | Guia passo a passo para verificar configuração no banco de dados (canal, filas, instance ID). |
| **queries-verificacao-webhook.sql** | Queries SQL prontas para executar no Supabase e diagnosticar problemas de configuração. |
| **diagnostico-canal-especifico.sql** | Diagnóstico completo para o canal específico (8f8280ff-b837-46f9-aedf-f76218eb3bb9) com todas as verificações. |
| **verificar-usuarios-filas.sql** | Queries para verificar usuários associados às filas, incluindo admin/owner (acesso total) e atendentes por fila. |
| **verificar-usuario-owner.sql** | Queries para verificar owner da empresa e explicar por que só aparece 1 usuário (owner não precisa estar em queue_assignments). |
| **webhook-local-vs-producao.md** | Explicação de por que mensagens não chegam localmente (webhook aponta para produção) e como configurar ngrok/localtunnel. |
| **webhook-desenvolvimento-industria.md** | Como plataformas como Zendesk, Intercom e Freshdesk lidam com webhooks em desenvolvimento (práticas da indústria). |
| **design/references/** | Pasta para imagens de referência de UI (ver README na pasta para nomes sugeridos). |
| **uazapi-openapi-spec (8).yaml** | OpenAPI da uazapi (WhatsApp): endpoints, webhook, envio de mensagens. |

## Ordem de leitura sugerida para o agente

1. **PRD.md** – entender o quê e por quê.
2. **TECHNICAL-SPEC.md** – como implementar (arquitetura, dados, rotas).
3. **DESIGN-SYSTEM.md** – direção visual e componentes de UI (ClicVend).
4. **IMPLEMENTATION-PLAN.md** – ordem de implementação e fases (por onde começar).
5. **ACCEPTANCE-CRITERIA.md** – o que considerar “pronto”.
6. **uazapi-openapi-spec (8).yaml** – consulta para webhook e chamadas à API uazapi.
7. **design/references/** – imagens de referência de telas (quando disponíveis).

## Brief para o agente

Construir um sistema de atendimento ao cliente **multi-empresa** (**ClicVend**), conectado ao **WhatsApp** via API uazapi, com **filas**, **canais** e **link próprio por empresa** (subdomínio ou path). Stack: **Next.js** (App Router) + **Supabase** (PostgreSQL, Auth). Seguir **IMPLEMENTATION-PLAN.md** (fases 0–7), PRD, Technical Spec e DESIGN-SYSTEM.md; validar contra Acceptance Criteria. Usar as imagens em `design/references/` como referência de UI quando disponíveis.
