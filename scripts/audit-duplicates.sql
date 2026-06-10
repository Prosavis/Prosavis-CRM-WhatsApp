-- Caso reportado
SELECT id, full_name, display_name, phone, email, source, channels,
       provider_id, service_id, whatsapp_conversation_id, created_at, updated_at
FROM crm_directory
WHERE phone ILIKE '%3146283332%'
   OR full_name ILIKE '%Cuidados De La Piel%'
   OR display_name ILIKE '%Cuidados De La Piel%'
ORDER BY created_at;

-- Duplicados por teléfono normalizado (últimos 10 dígitos)
WITH normalized AS (
  SELECT id, full_name, phone, email, source, created_at,
         regexp_replace(COALESCE(phone, ''), '[^0-9]', '', 'g') AS digits
  FROM crm_directory
  WHERE phone IS NOT NULL AND trim(phone) <> ''
),
groups AS (
  SELECT CASE WHEN length(digits) >= 10 THEN right(digits, 10) ELSE digits END AS phone_key,
         count(*) AS cnt
  FROM normalized
  GROUP BY 1
  HAVING count(*) > 1
)
SELECT n.phone_key, n.cnt, d.id, d.full_name, d.phone, d.email, d.source, d.created_at
FROM groups n
JOIN normalized d ON (CASE WHEN length(d.digits) >= 10 THEN right(d.digits, 10) ELSE d.digits END) = n.phone_key
ORDER BY n.cnt DESC, n.phone_key, d.created_at
LIMIT 100;
