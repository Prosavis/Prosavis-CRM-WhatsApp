-- RPC paginada para envío masivo: filtros avanzados con join a conversaciones WhatsApp (tags).

CREATE INDEX IF NOT EXISTS idx_crm_directory_tags_gin
  ON public.crm_directory USING GIN (tags);

CREATE INDEX IF NOT EXISTS idx_whatsapp_conversations_tag_ids_gin
  ON public.whatsapp_conversations USING GIN (tag_ids);

CREATE OR REPLACE FUNCTION public.get_crm_directory_bulk_filtered(
  p_search_term TEXT DEFAULT NULL,
  p_status TEXT DEFAULT NULL,
  p_source TEXT DEFAULT NULL,
  p_include_opt_out BOOLEAN DEFAULT FALSE,
  p_include_wa_tag_ids UUID[] DEFAULT NULL,
  p_exclude_wa_tag_ids UUID[] DEFAULT NULL,
  p_wa_tag_match_all BOOLEAN DEFAULT FALSE,
  p_include_directory_tags TEXT[] DEFAULT NULL,
  p_exclude_directory_tags TEXT[] DEFAULT NULL,
  p_directory_tag_match_all BOOLEAN DEFAULT FALSE,
  p_include_classifications TEXT[] DEFAULT NULL,
  p_exclude_classifications TEXT[] DEFAULT NULL,
  p_include_quality_tags TEXT[] DEFAULT NULL,
  p_exclude_quality_tags TEXT[] DEFAULT NULL,
  p_sort_field TEXT DEFAULT 'last_whatsapp_message_at',
  p_sort_direction TEXT DEFAULT 'asc',
  p_limit INT DEFAULT 50,
  p_offset INT DEFAULT 0
)
RETURNS TABLE (
  id UUID,
  full_name TEXT,
  display_name TEXT,
  email TEXT,
  phone TEXT,
  phone_key TEXT,
  photo_url TEXT,
  address TEXT,
  notes TEXT,
  app_user_id TEXT,
  is_app_user BOOLEAN,
  provider_id TEXT,
  service_id TEXT,
  classification TEXT,
  quality_tag TEXT,
  status TEXT,
  source TEXT,
  channels TEXT[],
  payment_status TEXT,
  pending_amount NUMERIC,
  pending_appointments_count INT,
  last_charged_amount NUMERIC,
  otp_required BOOLEAN,
  preferred_service_address_line TEXT,
  preferred_service_address_ref TEXT,
  first_contact_at TIMESTAMPTZ,
  last_contact_at TIMESTAMPTZ,
  messages_count INT,
  active_sequence TEXT,
  sequence_step INT,
  opt_out BOOLEAN,
  last_response_text TEXT,
  last_response_at TIMESTAMPTZ,
  last_whatsapp_message_at TIMESTAMPTZ,
  last_whatsapp_message_text TEXT,
  last_whatsapp_intent TEXT,
  unread_whatsapp_count INT,
  whatsapp_assigned_to TEXT,
  whatsapp_conversation_id TEXT,
  appointment_id TEXT,
  internal_notes TEXT,
  tags TEXT[],
  metadata JSONB,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ,
  last_synced_at TIMESTAMPTZ,
  total_count BIGINT
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_total BIGINT;
  v_search TEXT;
BEGIN
  v_search := NULLIF(trim(p_search_term), '');

  WITH base AS (
    SELECT d.*
    FROM crm_directory d
    LEFT JOIN whatsapp_conversations c ON (
      c.id::text = d.whatsapp_conversation_id
      OR c.stable_key = d.whatsapp_conversation_id
    )
    WHERE d.phone IS NOT NULL
      AND length(regexp_replace(d.phone, '[^0-9]', '', 'g')) BETWEEN 10 AND 15
      AND (
        p_include_opt_out
        OR (d.opt_out = FALSE AND COALESCE(d.status, '') <> 'opt_out')
      )
      AND (
        p_status IS NULL
        OR trim(p_status) = ''
        OR (
          p_status = 'active'
          AND (d.status = 'active' OR d.whatsapp_conversation_id IS NOT NULL)
          AND (p_include_opt_out OR d.opt_out = FALSE)
        )
        OR (
          p_status = 'inactive'
          AND d.status = 'inactive'
          AND d.whatsapp_conversation_id IS NULL
          AND (p_include_opt_out OR d.opt_out = FALSE)
        )
        OR (
          p_status = 'opt_out'
          AND (d.opt_out = TRUE OR d.status = 'opt_out')
        )
        OR (p_status NOT IN ('active', 'inactive', 'opt_out') AND d.status = p_status)
      )
      AND (p_source IS NULL OR trim(p_source) = '' OR d.source = p_source)
      AND (
        v_search IS NULL
        OR d.full_name ILIKE '%' || v_search || '%'
        OR d.phone ILIKE '%' || v_search || '%'
        OR d.email ILIKE '%' || v_search || '%'
        OR d.display_name ILIKE '%' || v_search || '%'
      )
      AND (
        p_include_wa_tag_ids IS NULL
        OR cardinality(p_include_wa_tag_ids) = 0
        OR (
          CASE
            WHEN p_wa_tag_match_all THEN
              COALESCE(c.tag_ids, '{}'::uuid[]) @> p_include_wa_tag_ids
            ELSE
              COALESCE(c.tag_ids, '{}'::uuid[]) && p_include_wa_tag_ids
          END
        )
      )
      AND (
        p_exclude_wa_tag_ids IS NULL
        OR cardinality(p_exclude_wa_tag_ids) = 0
        OR NOT (COALESCE(c.tag_ids, '{}'::uuid[]) && p_exclude_wa_tag_ids)
      )
      AND (
        p_include_directory_tags IS NULL
        OR cardinality(p_include_directory_tags) = 0
        OR (
          CASE
            WHEN p_directory_tag_match_all THEN
              COALESCE(d.tags, '{}'::text[]) @> p_include_directory_tags
            ELSE
              COALESCE(d.tags, '{}'::text[]) && p_include_directory_tags
          END
        )
      )
      AND (
        p_exclude_directory_tags IS NULL
        OR cardinality(p_exclude_directory_tags) = 0
        OR NOT (COALESCE(d.tags, '{}'::text[]) && p_exclude_directory_tags)
      )
      AND (
        p_include_classifications IS NULL
        OR cardinality(p_include_classifications) = 0
        OR d.classification = ANY(p_include_classifications)
      )
      AND (
        p_exclude_classifications IS NULL
        OR cardinality(p_exclude_classifications) = 0
        OR NOT (d.classification = ANY(p_exclude_classifications))
      )
      AND (
        p_include_quality_tags IS NULL
        OR cardinality(p_include_quality_tags) = 0
        OR d.quality_tag = ANY(p_include_quality_tags)
      )
      AND (
        p_exclude_quality_tags IS NULL
        OR cardinality(p_exclude_quality_tags) = 0
        OR NOT (d.quality_tag = ANY(p_exclude_quality_tags))
      )
  ),
  counted AS (
    SELECT COUNT(*)::BIGINT AS cnt FROM base
  )
  SELECT cnt INTO v_total FROM counted;

  RETURN QUERY
  WITH base AS (
    SELECT d.*
    FROM crm_directory d
    LEFT JOIN whatsapp_conversations c ON (
      c.id::text = d.whatsapp_conversation_id
      OR c.stable_key = d.whatsapp_conversation_id
    )
    WHERE d.phone IS NOT NULL
      AND length(regexp_replace(d.phone, '[^0-9]', '', 'g')) BETWEEN 10 AND 15
      AND (
        p_include_opt_out
        OR (d.opt_out = FALSE AND COALESCE(d.status, '') <> 'opt_out')
      )
      AND (
        p_status IS NULL
        OR trim(p_status) = ''
        OR (
          p_status = 'active'
          AND (d.status = 'active' OR d.whatsapp_conversation_id IS NOT NULL)
          AND (p_include_opt_out OR d.opt_out = FALSE)
        )
        OR (
          p_status = 'inactive'
          AND d.status = 'inactive'
          AND d.whatsapp_conversation_id IS NULL
          AND (p_include_opt_out OR d.opt_out = FALSE)
        )
        OR (
          p_status = 'opt_out'
          AND (d.opt_out = TRUE OR d.status = 'opt_out')
        )
        OR (p_status NOT IN ('active', 'inactive', 'opt_out') AND d.status = p_status)
      )
      AND (p_source IS NULL OR trim(p_source) = '' OR d.source = p_source)
      AND (
        v_search IS NULL
        OR d.full_name ILIKE '%' || v_search || '%'
        OR d.phone ILIKE '%' || v_search || '%'
        OR d.email ILIKE '%' || v_search || '%'
        OR d.display_name ILIKE '%' || v_search || '%'
      )
      AND (
        p_include_wa_tag_ids IS NULL
        OR cardinality(p_include_wa_tag_ids) = 0
        OR (
          CASE
            WHEN p_wa_tag_match_all THEN
              COALESCE(c.tag_ids, '{}'::uuid[]) @> p_include_wa_tag_ids
            ELSE
              COALESCE(c.tag_ids, '{}'::uuid[]) && p_include_wa_tag_ids
          END
        )
      )
      AND (
        p_exclude_wa_tag_ids IS NULL
        OR cardinality(p_exclude_wa_tag_ids) = 0
        OR NOT (COALESCE(c.tag_ids, '{}'::uuid[]) && p_exclude_wa_tag_ids)
      )
      AND (
        p_include_directory_tags IS NULL
        OR cardinality(p_include_directory_tags) = 0
        OR (
          CASE
            WHEN p_directory_tag_match_all THEN
              COALESCE(d.tags, '{}'::text[]) @> p_include_directory_tags
            ELSE
              COALESCE(d.tags, '{}'::text[]) && p_include_directory_tags
          END
        )
      )
      AND (
        p_exclude_directory_tags IS NULL
        OR cardinality(p_exclude_directory_tags) = 0
        OR NOT (COALESCE(d.tags, '{}'::text[]) && p_exclude_directory_tags)
      )
      AND (
        p_include_classifications IS NULL
        OR cardinality(p_include_classifications) = 0
        OR d.classification = ANY(p_include_classifications)
      )
      AND (
        p_exclude_classifications IS NULL
        OR cardinality(p_exclude_classifications) = 0
        OR NOT (d.classification = ANY(p_exclude_classifications))
      )
      AND (
        p_include_quality_tags IS NULL
        OR cardinality(p_include_quality_tags) = 0
        OR d.quality_tag = ANY(p_include_quality_tags)
      )
      AND (
        p_exclude_quality_tags IS NULL
        OR cardinality(p_exclude_quality_tags) = 0
        OR NOT (d.quality_tag = ANY(p_exclude_quality_tags))
      )
  )
  SELECT
    b.id,
    b.full_name,
    b.display_name,
    b.email,
    b.phone,
    b.phone_key,
    b.photo_url,
    b.address,
    b.notes,
    b.app_user_id,
    b.is_app_user,
    b.provider_id,
    b.service_id,
    b.classification,
    b.quality_tag,
    b.status,
    b.source,
    b.channels,
    b.payment_status,
    b.pending_amount,
    b.pending_appointments_count,
    b.last_charged_amount,
    b.otp_required,
    b.preferred_service_address_line,
    b.preferred_service_address_ref,
    b.first_contact_at,
    b.last_contact_at,
    b.messages_count,
    b.active_sequence,
    b.sequence_step,
    b.opt_out,
    b.last_response_text,
    b.last_response_at,
    b.last_whatsapp_message_at,
    b.last_whatsapp_message_text,
    b.last_whatsapp_intent,
    b.unread_whatsapp_count,
    b.whatsapp_assigned_to,
    b.whatsapp_conversation_id,
    b.appointment_id,
    b.internal_notes,
    b.tags,
    b.metadata,
    b.created_at,
    b.updated_at,
    b.last_synced_at,
    v_total AS total_count
  FROM base b
  ORDER BY
    CASE WHEN p_sort_field = 'last_whatsapp_message_at' AND lower(p_sort_direction) = 'asc'
      THEN b.last_whatsapp_message_at END ASC NULLS LAST,
    CASE WHEN p_sort_field = 'last_whatsapp_message_at' AND lower(p_sort_direction) = 'desc'
      THEN b.last_whatsapp_message_at END DESC NULLS LAST,
    CASE WHEN p_sort_field = 'full_name' AND lower(p_sort_direction) = 'asc'
      THEN b.full_name END ASC,
    CASE WHEN p_sort_field = 'full_name' AND lower(p_sort_direction) = 'desc'
      THEN b.full_name END DESC,
    CASE WHEN p_sort_field = 'created_at' AND lower(p_sort_direction) = 'asc'
      THEN b.created_at END ASC NULLS LAST,
    CASE WHEN p_sort_field = 'created_at' AND lower(p_sort_direction) = 'desc'
      THEN b.created_at END DESC NULLS LAST,
    b.id ASC
  LIMIT GREATEST(p_limit, 0)
  OFFSET GREATEST(p_offset, 0);
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_crm_directory_bulk_filtered(
  TEXT, TEXT, TEXT, BOOLEAN,
  UUID[], UUID[], BOOLEAN,
  TEXT[], TEXT[], BOOLEAN,
  TEXT[], TEXT[],
  TEXT[], TEXT[],
  TEXT, TEXT, INT, INT
) TO authenticated, service_role;
