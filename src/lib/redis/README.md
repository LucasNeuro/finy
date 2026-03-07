# Redis no projeto

## Regra: Redis só para atendimento (chat e tickets)

**Tudo que não é chat e tickets fica FORA do Redis** — chamada direta ao banco (Supabase) e à API UAZAPI, como antes. O Redis serve apenas para deixar **veloz** a operação de **atendimento** e o **gerenciamento de tickets** (lista de conversas, detalhe do chat, contagens/badges), sem quebrar o resto da aplicação.

### Onde usamos Redis (apenas isso)

| API | Uso |
|-----|-----|
| `GET /api/conversations` | Lista de conversas (inbox e tickets) |
| `GET /api/conversations/[id]` | Detalhe do chat (mensagens + metadados) |
| `GET /api/conversations/counts` | Contagens para badges (Filas, Meus, etc.) |

Invalidação do cache (lista/detalhe/counts) em: PATCH conversa, claim, archive, delete, webhook UAZAPI, sync-contacts, sync-history, reset-to-open, unassign-my-tickets, chat-details. No webhook, o Redis também guarda um cache curto do canal por instância só para processar mensagens (fluxo de chat), não para telas de gestão.

### Onde NÃO usamos Redis (sempre banco / UAZAPI)

| Tela / API | Fonte dos dados |
|------------|-----------------|
| Contatos, Grupos | `GET /api/contacts`, grupos → sempre Supabase (e UAZAPI no sync) |
| Cargos e usuários | `GET /api/roles` → sempre Supabase |
| Filas, Conexões | `GET /api/queues`, canais → sempre Supabase |

Assim, Contatos, Grupos, Filas e Cargos continuam com dados completos e atualizados, sem cache que atrase ou esconda alterações.

### Fluxo (Supabase ↔ Redis ↔ UAZAPI)

- **Supabase**: fonte da verdade (conversations, channel_contacts, channel_groups, queues, etc.).
- **Redis**: cache “quente” **somente** para lista de conversas, detalhe da conversa e contagens. Nada mais.
- **UAZAPI**: chamada sob demanda (sync de contatos, chat-details ao abrir painel, etc.).

Cada rota decide: se for de **atendimento/tickets** → pode usar Redis; caso contrário → sempre direto ao Supabase/UAZAPI.

### Arquivos

- `client.ts`: conexão Redis (opcional; sem Redis a app funciona só com Supabase).
- `inbox-state.ts`: get/set/invalidação para lista de conversas, detalhe e contagens.
- `cache-helpers.ts`: helpers genéricos; atualmente **não** usados pelas rotas (reservado para uso futuro, se quiser cache em outro ponto controlado).
