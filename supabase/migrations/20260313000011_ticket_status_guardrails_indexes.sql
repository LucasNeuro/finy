-- Guardrails de status por escopo (empresa/fila) + índices para listas/counts.
-- Escopo:
--   - queue_id IS NULL  -> status globais da empresa
--   - queue_id = <id>   -> status exclusivos da fila
--
-- Objetivo:
--   1) Impedir remover o último status aberto/fechado de um escopo.
--   2) Melhorar performance de consultas de conversas (chat/tickets/counts).

-- =========================================================
-- 1) ÍNDICES (conversations)
-- =========================================================

-- Consultas com filtros por company/status/queue/assigned e ordenação por last_message_at.
create index if not exists idx_conversations_company_status_queue_assigned_lastmsg
  on public.conversations (company_id, status, queue_id, assigned_to, last_message_at desc);

-- Consultas de "não atribuídos" (Novos).
create index if not exists idx_conversations_company_unassigned_status_lastmsg
  on public.conversations (company_id, status, last_message_at desc)
  where assigned_to is null;

-- Consultas de "meus atendimentos / meus encerrados".
create index if not exists idx_conversations_company_assigned_status_lastmsg
  on public.conversations (company_id, assigned_to, status, last_message_at desc)
  where assigned_to is not null;

-- =========================================================
-- 2) GUARDRAIL: NÃO REMOVER ÚLTIMO ABERTO/FECHADO
-- =========================================================

create or replace function public.fn_guard_company_ticket_statuses_min_open_closed()
returns trigger
language plpgsql
as $$
declare
  old_scope_company uuid;
  old_scope_queue uuid;
  old_scope_is_closed boolean;
  old_remaining int;
begin
  -- Escopo anterior da linha que está sendo removida/alterada
  old_scope_company := old.company_id;
  old_scope_queue := old.queue_id;
  old_scope_is_closed := coalesce(old.is_closed, false);

  -- Só valida quando a operação pode "tirar" a linha do escopo antigo:
  -- DELETE sempre tira.
  -- UPDATE tira quando muda company_id, queue_id ou is_closed.
  if tg_op = 'DELETE'
     or (tg_op = 'UPDATE' and (
          new.company_id is distinct from old.company_id
          or new.queue_id is distinct from old.queue_id
          or new.is_closed is distinct from old.is_closed
        )) then

    select count(*)
      into old_remaining
      from public.company_ticket_statuses s
     where s.company_id = old_scope_company
       and s.queue_id is not distinct from old_scope_queue
       and coalesce(s.is_closed, false) = old_scope_is_closed
       and s.id <> old.id;

    if old_remaining = 0 then
      if old_scope_is_closed then
        raise exception
          'Operação bloqueada: não é permitido remover o último status FECHADO deste escopo (company_id=%, queue_id=%).',
          old_scope_company, old_scope_queue;
      else
        raise exception
          'Operação bloqueada: não é permitido remover o último status ABERTO deste escopo (company_id=%, queue_id=%).',
          old_scope_company, old_scope_queue;
      end if;
    end if;
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_guard_company_ticket_statuses_min_open_closed on public.company_ticket_statuses;

create trigger trg_guard_company_ticket_statuses_min_open_closed
before update of company_id, queue_id, is_closed or delete
on public.company_ticket_statuses
for each row
execute function public.fn_guard_company_ticket_statuses_min_open_closed();

comment on function public.fn_guard_company_ticket_statuses_min_open_closed()
is 'Bloqueia DELETE/UPDATE que removam o último status aberto/fechado de um escopo (empresa + fila).';

