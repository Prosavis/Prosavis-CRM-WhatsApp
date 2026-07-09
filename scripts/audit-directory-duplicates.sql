-- Auditoría de duplicados en crm_directory (Prosavis Limpieza / CDM Client)
-- Uso: npx supabase db query --linked -f scripts/audit-directory-duplicates.sql

-- 1) Duplicados por phone_key (requiere columna aplicada por migración 20260610120000)
SELECT
  phone_key,
  count(*) AS cnt,
  array_agg(id ORDER BY updated_at DESC NULLS LAST) AS ids,
  array_agg(full_name ORDER BY updated_at DESC NULLS LAST) AS names,
  array_agg(phone ORDER BY updated_at DESC NULLS LAST) AS phones,
  array_agg(source ORDER BY updated_at DESC NULLS LAST) AS sources
FROM public.crm_directory
WHERE phone_key IS NOT NULL
GROUP BY phone_key
HAVING count(*) > 1
ORDER BY cnt DESC, phone_key;

-- 2) Duplicados por email (sin teléfono)
SELECT
  lower(trim(email)) AS email_norm,
  count(*) AS cnt,
  array_agg(id) AS ids,
  array_agg(full_name) AS names
FROM public.crm_directory
WHERE email IS NOT NULL AND trim(email) <> ''
GROUP BY 1
HAVING count(*) > 1
ORDER BY cnt DESC;

-- 3) Caso específico: Cuidados De La Piel / +573146283332
SELECT
  id,
  full_name,
  display_name,
  phone,
  phone_key,
  source,
  provider_id,
  service_id,
  whatsapp_conversation_id,
  created_at,
  updated_at
FROM public.crm_directory
WHERE full_name ILIKE '%Cuidados De La Piel%'
   OR phone LIKE '%3146283332%'
   OR phone_key = '3146283332'
ORDER BY created_at;

-- 4) Resumen
SELECT
  count(*) AS total_rows,
  count(DISTINCT phone_key) FILTER (WHERE phone_key IS NOT NULL) AS distinct_phone_keys,
  count(*) FILTER (WHERE phone_key IS NOT NULL) AS rows_with_phone_key
FROM public.crm_directory;
