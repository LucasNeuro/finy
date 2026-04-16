-- Chamados encerrados antes do tombstone automático ainda ocupam UNIQUE(channel_id, external_id).
-- Libera o JID canônico para novas conversas quando o cliente voltar a falar.
UPDATE public.conversations c
SET external_id = 'closed:' || replace(c.id::text, '-', '') || ':legacy'
WHERE c.kind = 'ticket'
  AND COALESCE(c.is_group, false) = false
  AND c.external_id IS NOT NULL
  AND c.external_id NOT LIKE 'closed:%'
  AND (
    lower(trim(c.status)) = 'closed'
    OR EXISTS (
      SELECT 1
      FROM public.company_ticket_statuses s
      WHERE s.company_id = c.company_id
        AND lower(trim(s.slug)) = lower(trim(c.status))
        AND s.is_closed = true
    )
  );
