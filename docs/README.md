# Documentação do Projeto

Bem-vindo à documentação do projeto. Para facilitar a navegação e o entendimento, organizamos os arquivos nas seguintes pastas:

## 📂 Estrutura de Pastas

### `specs/` (Especificações)
Documentos "core" que definem o produto e a tecnologia.
- **PRD_GERAL_SISTEMA.md**: Requisitos de produto (Product Requirements Document).
- **SPEC_TECNICA_GERAL.md**: Especificações técnicas de implementação.
- **SPEC_ARQUITETURA_DISTRIBUICAO_MENSAGENS.md**: Detalhes de arquitetura de mensagens e distribuição.
- **SPEC_SCHEMA_BANCO_DADOS.md**: Definições de banco de dados e schemas.

### `features/` (Funcionalidades em Desenvolvimento)
Detalhamento de funcionalidades específicas que estão sendo construídas ou já foram entregues.
- **PRD_REDESIGN_CLICVENDY.md**: Guia atual do redesign e rebranding (ClicVendy).
- **PRD_FUNCIONALIDADE_TICKETS_FILAS.md**: Especificação do novo sistema de tickets e filas.
- **DOC_FLUXO_...**: Diagramas e explicações de fluxos específicos.

### `roadmap/` (Implementações Futuras)
Planejamento de longo prazo, ideias, RFCs e funcionalidades que ainda não entraram na esteira de desenvolvimento.
- **PLAN_FUTURO_ESCALA_IA.md**: Planejamento para escala com IA e Bots.
- **RFC_FUTURO_JSONB_CONVERSA.md**: Proposta técnica para otimização de conversas.
- **PLAN_FUTURO_PARIDADE_WHATSAPP.md**: Roadmap para alcançar paridade com WhatsApp Web.

### `guides/` (Guias e Manuais)
Tutoriais, checklists de deploy e procedimentos operacionais.
- **GUIA_DEPLOY_RENDER.md**: Como fazer deploy na Render.
- **GUIA_CONFIGURACAO_WEBHOOK_ENV.md**: Guia de configuração de webhooks.
- **CHECKLIST_DEPLOY_PRODUCAO.md**: Passos para verificar antes de subir para produção.

### `planning/` (Gestão do Projeto Atual)
Gestão de tarefas, backlog e critérios de aceitação para o sprint atual.
- **PLAN_IMPLEMENTACAO_GERAL.md**: Plano geral de implementação.
- **QA_CRITERIOS_ACEITE.md**: Critérios de aceite para QA.
- **REGISTRO_DECISOES_TECNICAS.md**: Registro de decisões técnicas importantes (ADR simplificado).

### `legacy/` (Legado e Histórico)
Documentos antigos, relatórios de versões passadas e referências que não são mais a "verdade absoluta" mas servem de histórico.
- **LEGACY_...**: Relatórios e análises antigas.

### `scripts/` (Banco de Dados)
Scripts SQL utilitários e de migração manual.

---

## Como contribuir
Ao criar novos documentos, use o padrão `TIPO_NOME_DESCRITIVO.md` (em maiúsculas, separado por underscore).
Exemplos: `PRD_NOVA_FEATURE.md`, `GUIA_CONFIGURACAO_BANCO.md`.
