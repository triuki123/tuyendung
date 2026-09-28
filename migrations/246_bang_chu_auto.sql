-- Migration 246: Bằng chữ auto — thêm formula toWords(tong_cong) cho field bang_chu template WOKA.
UPDATE email_templates
SET schema = jsonb_set(
      schema,
      -- Tìm index của phần tử có key='bang_chu' trong mảng schema.
      ARRAY[(
        SELECT (idx - 1)::text
          FROM jsonb_array_elements(schema) WITH ORDINALITY AS s(elem, idx)
         WHERE elem->>'key' = 'bang_chu'
         LIMIT 1
      )],
      '{"key":"bang_chu","label":"Bằng chữ","type":"textarea","required":false,"formula":"toWords(tong_cong)"}'::jsonb,
      false
    ),
    updated_at = NOW()
WHERE key = 'payment_woka'
  AND schema::text LIKE '%"bang_chu"%';
