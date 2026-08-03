-- Repair cleaner/auxiliar names overwritten with clientName by
-- send-appointment-reminder (ensureConversation stamped clientName onto
-- professional recipient conversations).
-- Scope: ONLY crm_directory rows tagged Auxiliares (case-insensitive),
-- where contact_name/display_name differs from whatsapp_profile_name and
-- that wrong name also exists on another phone (the client chat).
-- Broader "profile ≠ contact_name" matches intentional CRM edits / emoji
-- profiles and must NOT be auto-repaired.

WITH crossed AS (
  SELECT c.id
  FROM public.whatsapp_conversations c
  INNER JOIN public.crm_directory d
    ON d.phone_key IS NOT NULL
   AND d.phone_key = c.phone_key
  WHERE EXISTS (
      SELECT 1
      FROM unnest(COALESCE(d.tags, ARRAY[]::text[])) AS t(tag)
      WHERE lower(trim(t.tag)) LIKE '%auxiliar%'
    )
    AND c.whatsapp_profile_name IS NOT NULL
    AND length(trim(c.whatsapp_profile_name)) >= 2
    AND trim(c.whatsapp_profile_name) ~ '[[:alpha:]]'
    AND c.contact_name IS NOT NULL
    AND length(trim(c.contact_name)) >= 2
    AND lower(trim(c.contact_name)) IS DISTINCT FROM lower(trim(c.whatsapp_profile_name))
    AND EXISTS (
      SELECT 1
      FROM public.whatsapp_conversations other
      WHERE other.phone_key IS DISTINCT FROM c.phone_key
        AND other.contact_name IS NOT NULL
        AND lower(trim(other.contact_name)) = lower(trim(c.contact_name))
    )
)
UPDATE public.whatsapp_conversations c
SET
  contact_name = trim(c.whatsapp_profile_name),
  contact_name_locked = false,
  updated_at = NOW()
FROM crossed x
WHERE c.id = x.id;

-- Align directory display_name for the same Auxiliares cohort.
WITH crossed_dir AS (
  SELECT d.id AS directory_id,
         trim(c.whatsapp_profile_name) AS restored_name
  FROM public.crm_directory d
  INNER JOIN public.whatsapp_conversations c
    ON c.phone_key IS NOT NULL
   AND c.phone_key = d.phone_key
  WHERE EXISTS (
      SELECT 1
      FROM unnest(COALESCE(d.tags, ARRAY[]::text[])) AS t(tag)
      WHERE lower(trim(t.tag)) LIKE '%auxiliar%'
    )
    AND c.whatsapp_profile_name IS NOT NULL
    AND length(trim(c.whatsapp_profile_name)) >= 2
    AND trim(c.whatsapp_profile_name) ~ '[[:alpha:]]'
    AND d.display_name IS NOT NULL
    AND lower(trim(d.display_name)) IS DISTINCT FROM lower(trim(c.whatsapp_profile_name))
    AND EXISTS (
      SELECT 1
      FROM public.whatsapp_conversations other
      WHERE other.phone_key IS DISTINCT FROM c.phone_key
        AND other.contact_name IS NOT NULL
        AND lower(trim(other.contact_name)) = lower(trim(d.display_name))
    )
)
UPDATE public.crm_directory d
SET
  display_name = x.restored_name,
  updated_at = NOW()
FROM crossed_dir x
WHERE d.id = x.directory_id
  AND x.restored_name IS NOT NULL;
