-- Seeds de tags e formulários (empresa específica)
-- company_id: ec8f190b-a8d0-4d04-b201-3b7b793a4268
-- queue_id:   28e6cff5-55a0-4a50-b524-ba580eeaab67
-- Cria:
--   - 40 tags (20 contato, 20 atendimento)
--   - 18 formulários de tabulação (15 vinculados à fila)

DO $$
DECLARE
  v_company_id uuid := 'ec8f190b-a8d0-4d04-b201-3b7b793a4268';
  v_queue_id   uuid := '28e6cff5-55a0-4a50-b524-ba580eeaab67';

  v_contact_cat_id uuid;
  v_conv_cat_id    uuid;

  v_new_id uuid;
  i integer;
BEGIN
  -- Categorias de tags (se ainda não existirem)
  INSERT INTO public.tag_categories (company_id, name, kind, description)
  VALUES
    (v_company_id, 'Perfil do contato', 'contact', 'Tags para classificar o tipo/perfil do contato'),
    (v_company_id, 'Motivo do atendimento', 'conversation', 'Tags para tabular o motivo do atendimento')
  ON CONFLICT DO NOTHING;

  SELECT id INTO v_contact_cat_id
  FROM public.tag_categories
  WHERE company_id = v_company_id AND kind = 'contact' AND name = 'Perfil do contato'
  LIMIT 1;

  SELECT id INTO v_conv_cat_id
  FROM public.tag_categories
  WHERE company_id = v_company_id AND kind = 'conversation' AND name = 'Motivo do atendimento'
  LIMIT 1;

  -- 20 tags de contato
  FOR i IN 1..20 LOOP
    INSERT INTO public.tags (company_id, category_id, name, color_hex, is_active)
    VALUES (
      v_company_id,
      v_contact_cat_id,
      format('Contato_T%02s', i),
      '#0EA5E9',
      true
    )
    RETURNING id INTO v_new_id;

    INSERT INTO public.tag_queues (company_id, tag_id, queue_id)
    VALUES (v_company_id, v_new_id, v_queue_id)
    ON CONFLICT DO NOTHING;
  END LOOP;

  -- 20 tags de atendimento
  FOR i IN 1..20 LOOP
    INSERT INTO public.tags (company_id, category_id, name, color_hex, is_active)
    VALUES (
      v_company_id,
      v_conv_cat_id,
      format('Atendimento_T%02s', i),
      '#F97316',
      true
    )
    RETURNING id INTO v_new_id;

    INSERT INTO public.tag_queues (company_id, tag_id, queue_id)
    VALUES (v_company_id, v_new_id, v_queue_id)
    ON CONFLICT DO NOTHING;
  END LOOP;

  -- 18 formulários de tabulação
  FOR i IN 1..18 LOOP
    INSERT INTO public.tag_forms (company_id, name, description, is_active)
    VALUES (
      v_company_id,
      format('Formulário de tabulação %02s', i),
      format('Formulário padrão de tabulação %s para fila comercial.', i),
      true
    )
    RETURNING id INTO v_new_id;

    -- Campos padrão
    INSERT INTO public.tag_form_fields (tag_form_id, label, field_type, required, sort_order, config)
    VALUES
      (v_new_id, 'Tipo de contato', 'select', true, 1, jsonb_build_object('options', ARRAY['Novo', 'Recorrente', 'Ex-cliente'])),
      (v_new_id, 'Interesse principal', 'select', true, 2, jsonb_build_object('options', ARRAY['Produto', 'Serviço', 'Suporte', 'Financeiro'])),
      (v_new_id, 'Probabilidade de fechamento', 'select', false, 3, jsonb_build_object('options', ARRAY['Baixa', 'Média', 'Alta'])),
      (v_new_id, 'Observações', 'text', false, 4, '{}'::jsonb);

    -- Vincula à fila apenas para os 15 primeiros, respeitando limite por fila
    IF i <= 15 THEN
      INSERT INTO public.tag_form_queues (company_id, tag_form_id, queue_id)
      VALUES (v_company_id, v_new_id, v_queue_id)
      ON CONFLICT DO NOTHING;
    END IF;
  END LOOP;
END
$$;

