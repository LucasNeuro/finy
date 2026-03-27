-- Evita categorias duplicadas (company_id, kind, name) que causam erro
-- "JSON object requested, multiple (or no) rows returned" ao criar tags.
-- Remove duplicatas mantendo a primeira por (company_id, kind, lower(name)).

-- 1. Consolida tags que apontam para categorias duplicadas na que será mantida
WITH duplicates AS (
  SELECT id, company_id, kind, name,
    first_value(id) OVER (
      PARTITION BY company_id, kind, lower(name)
      ORDER BY id
    ) AS keep_id
  FROM tag_categories
),
to_update AS (
  SELECT id, keep_id FROM duplicates WHERE id != keep_id
)
UPDATE tags t
SET category_id = d.keep_id
FROM to_update d
WHERE t.category_id = d.id;

-- 2. Remove categorias duplicadas (mantém a de menor id)
DELETE FROM tag_categories
WHERE id IN (
  SELECT id FROM (
    SELECT id,
      row_number() OVER (
        PARTITION BY company_id, kind, lower(name)
        ORDER BY id
      ) AS rn
    FROM tag_categories
  ) sub
  WHERE rn > 1
);

-- 3. Adiciona índice único (lower(name) para case-insensitive)
CREATE UNIQUE INDEX IF NOT EXISTS tag_categories_company_kind_name_unique
ON tag_categories (company_id, kind, lower(name));
