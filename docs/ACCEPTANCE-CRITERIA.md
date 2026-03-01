# Critérios de Aceite  
## Sistema de Atendimento Multi-Empresas (WhatsApp)

**Versão:** 1.0  
**Data:** 2025-02-28  
**Uso:** checklist para validação e handoff ao agente; referência em `PRD.md` e `TECHNICAL-SPEC.md`.

---

## 1. Multi-tenant e link próprio

| ID | Critério | Como validar |
|----|----------|--------------|
| MT-1 | Cada empresa acessa apenas pelo seu link (subdomínio ou path). | Acessar `acme.app.com` (ou `/acme`) exibe apenas dados da empresa "acme"; não há dados de outras empresas. |
| MT-2 | Usuário sem vínculo com a empresa não acessa. | Usuário da empresa A não consegue acessar URL da empresa B (403 ou redirect para login/empresa permitida). |
| MT-3 | Sessão e APIs respeitam a empresa atual. | Após login pelo link da empresa X, todas as chamadas de API retornam apenas dados com `company_id = X`. |
| MT-4 | Onboarding gera link único por empresa. | Ao criar nova empresa (tenant) com slug `novaempresa`, o link de acesso é gerado e exibido (ex.: `https://novaempresa.app.com` ou `https://app.com/novaempresa`). |

---

## 2. Autenticação e usuários

| ID | Critério | Como validar |
|----|----------|--------------|
| AUTH-1 | Login com e-mail e senha (Supabase Auth). | Usuário consegue fazer login e é redirecionado para o painel da empresa (ou escolher empresa se tiver mais de uma). |
| AUTH-2 | Perfil vinculado à(s) empresa(s) e role. | Admin vê opções de configuração (canais, filas, usuários); atendente vê apenas inbox e conversas. |
| AUTH-3 | Logout encerra sessão. | Após logout, rotas protegidas redirecionam para login. |

---

## 3. Canais e filas

| ID | Critério | Como validar |
|----|----------|--------------|
| CF-1 | Admin pode criar e listar filas. | Em configurações, criar fila "Suporte" e ver na lista de filas da empresa. |
| CF-2 | Admin pode criar canal vinculado a instância uazapi. | Cadastrar canal com nome, instance_id (e token) e fila padrão; canal aparece na lista e pode ser usado para conversas. |
| CF-3 | Dados de canais e filas são por empresa. | Empresa A não vê filas/canais da empresa B. |

---

## 4. Recebimento de mensagens (webhook)

| ID | Critério | Como validar |
|----|----------|--------------|
| WH-1 | Evento de mensagem recebida no webhook gera/atualiza conversa e mensagem. | Enviar mensagem do WhatsApp para número conectado; em até 1 minuto a conversa aparece na fila correta com a mensagem na thread. |
| WH-2 | Conversa é identificada de forma estável (mesmo cliente, mesmo canal). | Novas mensagens do mesmo número no mesmo canal atualizam a mesma conversa (não criam conversa duplicada). |
| WH-3 | Webhook responde 200 para evento processado. | Log/ferramenta de webhook mostra resposta 200; uazapi não repete indevidamente. |

---

## 5. Inbox e conversas

| ID | Critério | Como validar |
|----|----------|--------------|
| IN-1 | Atendente vê lista de conversas da fila. | Selecionar fila "Suporte" e ver apenas conversas dessa fila, ordenadas por última mensagem. |
| IN-2 | Abrir conversa exibe thread de mensagens. | Clicar em uma conversa mostra histórico de mensagens (entrada e saída) em ordem cronológica. |
| IN-3 | Apenas conversas da empresa atual. | Em nenhuma tela aparecem conversas de outra empresa. |

---

## 6. Envio de mensagens

| ID | Critério | Como validar |
|----|----------|--------------|
| MSG-1 | Atendente envia mensagem pela thread. | Digitar texto e enviar; mensagem aparece na thread como "enviada" e o cliente recebe no WhatsApp no número correto. |
| MSG-2 | Mensagem enviada é gravada no histórico. | Após enviar, a mensagem permanece na thread ao recarregar a página. |
| MSG-3 | Envio usa canal/uazapi correto. | A mensagem sai pelo número WhatsApp associado à conversa (canal da empresa). |

---

## 7. Onboarding nova empresa

| ID | Critério | Como validar |
|----|----------|--------------|
| ONB-1 | Criação de empresa (tenant) com nome e slug. | Fluxo ou admin cria empresa "Acme" com slug `acme`; registro existe em `companies`. |
| ONB-2 | Primeiro usuário admin criado e vinculado. | Após onboarding, existe um usuário em Auth e em `profiles`/`company_users` com `role = 'admin'` para essa empresa. |
| ONB-3 | Link de acesso exibido/entregue. | O link (subdomínio ou path) é mostrado e funciona para login e acesso ao painel da nova empresa. |

---

## 8. Segurança e RLS

| ID | Critério | Como validar |
|----|----------|--------------|
| SEC-1 | RLS ativo nas tabelas com company_id. | Tentativa de query direta no Supabase (como outro user) não retorna linhas de outras empresas. |
| SEC-2 | APIs rejeitam company_id incompatível com sessão. | Alterar manualmente company_id em uma chamada não deve retornar dados de outra empresa (403 ou vazio). |

---

## Resumo por prioridade (v1)

- **P0 (obrigatório):** MT-1 a MT-3, AUTH-1, AUTH-2, CF-1, CF-2, CF-3, WH-1, WH-2, IN-1, IN-2, IN-3, MSG-1, MSG-2, MSG-3.
- **P1:** MT-4, ONB-1 a ONB-3, SEC-1, SEC-2, WH-3, AUTH-3.

Use este documento como checklist ao validar o sistema ou ao passar o escopo para o agente que vai construir.
