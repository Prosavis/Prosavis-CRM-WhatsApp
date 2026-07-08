-- Backfill crm_directory entries whose full_name/display_name lack letters
-- (emoji-only, symbols, ellipsis, dots, phone-as-name, etc.).
-- Prefer a usable contact_name from the linked WhatsApp conversation; else phone.

WITH unusable AS (
  SELECT
    d.id,
    d.phone,
    d.full_name,
    d.display_name,
    wc.contact_name AS wa_contact_name
  FROM crm_directory d
  LEFT JOIN whatsapp_conversations wc ON (
    wc.contact_phone = d.phone
    OR wc.stable_key = regexp_replace(d.phone, '^\+', '')
    OR wc.phone = regexp_replace(d.phone, '^\+', '')
  )
  WHERE d.full_name IS NULL
    OR trim(d.full_name) = ''
    OR d.full_name !~ '[[:alpha:]]'
),
resolved AS (
  SELECT
    id,
    CASE
      WHEN wa_contact_name IS NOT NULL
        AND length(trim(wa_contact_name)) >= 2
        AND wa_contact_name ~ '[[:alpha:]]'
      THEN trim(wa_contact_name)
      ELSE phone
    END AS new_name
  FROM unusable
)
UPDATE crm_directory d
SET
  full_name = r.new_name,
  display_name = r.new_name,
  updated_at = now()
FROM resolved r
WHERE d.id = r.id;
