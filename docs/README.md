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
