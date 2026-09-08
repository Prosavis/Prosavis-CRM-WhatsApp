-- Libreta de direcciones de servicio en crm_directory.
-- preferred_* sigue siendo el espejo de la entrada isDefault (App, Grok, Inbox).
-- No se toca upsert_directory_entry: los upserts de WhatsApp no deben vaciar la libreta.

ALTER TABLE public.crm_directory
  ADD COLUMN IF NOT EXISTS service_addresses jsonb NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN public.crm_directory.service_addresses IS
  'Libreta de direcciones de servicio (JSONB). preferred_* es el espejo de isDefault.';

UPDATE public.crm_directory
SET service_addresses = jsonb_build_array(
  jsonb_strip_nulls(
    jsonb_build_object(
      'id', gen_random_uuid()::text,
      'addressLine', trim(preferred_service_address_line),
      'reference', nullif(trim(preferred_service_address_ref), ''),
      'googleMapsUrl', nullif(trim(preferred_google_maps_url), ''),
      'wazeUrl', nullif(trim(preferred_waze_url), ''),
      'isDefault', true,
      'lastUsedAt', coalesce(preferred_address_updated_at, updated_at)::text
    )
  )
)
WHERE nullif(trim(preferred_service_address_line), '') IS NOT NULL
  AND service_addresses = '[]'::jsonb;
