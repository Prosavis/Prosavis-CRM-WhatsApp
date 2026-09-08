-- Identidad única correo + WhatsApp: match NIT/outreach, merge en unique_violation,
-- auto-merge por NIT, rehidratar ficha cuando el pool gana un celular 3xxxxxxxxx.
-- phone / phone_key siguen siendo solo móvil WhatsApp (nunca fijo 606).

CREATE OR REPLACE FUNCTION public.directory_company_name_key(p_name text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT NULLIF(
    trim(both FROM regexp_replace(
      regexp_replace(lower(trim(COALESCE(p_name, ''))), '\s+', ' ', 'g'),
      '\s+(s\.?\s*a\.?\s*s\.?|s\.?a\.?s\.?|ltda\.?|s\.?\s*a\.?)$',
      '',
      'i'
    )),
    ''
  );
$$;

CREATE OR REPLACE FUNCTION public.directory_is_company_name(p_name text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT COALESCE(p_name, '') ~* '(s\.?\s*a\.?\s*s\.?|s\.?a\.?s\.?|\bltda\b)';
$$;

CREATE OR REPLACE FUNCTION public.directory_normalize_nit(p_nit text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN length(regexp_replace(COALESCE(p_nit, ''), '[^0-9]', '', 'g')) >= 6
      THEN regexp_replace(p_nit, '[^0-9]', '', 'g')
    ELSE NULL
  END;
$$;

CREATE OR REPLACE FUNCTION public.directory_pick_identity_keeper(p_a uuid, p_b uuid)
RETURNS uuid
LANGUAGE plpgsql
STABLE
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  a public.crm_directory%ROWTYPE;
  b public.crm_directory%ROWTYPE;
  score_a integer := 0;
  score_b integer := 0;
BEGIN
  SELECT * INTO a FROM public.crm_directory WHERE id = p_a;
  SELECT * INTO b FROM public.crm_directory WHERE id = p_b;
  IF a.id IS NULL THEN RETURN p_b; END IF;
  IF b.id IS NULL THEN RETURN p_a; END IF;

  IF a.email IS NOT NULL AND trim(a.email) <> '' THEN score_a := score_a + 8; END IF;
  IF b.email IS NOT NULL AND trim(b.email) <> '' THEN score_b := score_b + 8; END IF;
  IF COALESCE(a.source, '') ILIKE '%CRM_CLIENT%' THEN score_a := score_a + 6; END IF;
  IF COALESCE(b.source, '') ILIKE '%CRM_CLIENT%' THEN score_b := score_b + 6; END IF;
  IF COALESCE(a.source, '') ILIKE '%LEAD%' THEN score_a := score_a + 4; END IF;
  IF COALESCE(b.source, '') ILIKE '%LEAD%' THEN score_b := score_b + 4; END IF;
  IF a.app_user_id IS NOT NULL THEN score_a := score_a + 3; END IF;
  IF b.app_user_id IS NOT NULL THEN score_b := score_b + 3; END IF;
  IF public.directory_normalize_nit(a.metadata->'outreach'->>'nit') IS NOT NULL THEN
    score_a := score_a + 2;
  END IF;
  IF public.directory_normalize_nit(b.metadata->'outreach'->>'nit') IS NOT NULL THEN
    score_b := score_b + 2;
  END IF;

  IF score_a > score_b THEN RETURN p_a; END IF;
  IF score_b > score_a THEN RETURN p_b; END IF;
  IF a.created_at <= b.created_at THEN RETURN p_a; END IF;
  RETURN p_b;
END;
$$;

CREATE OR REPLACE FUNCTION public.directory_find_identity_match(
  p_phone_key text,
  p_email text,
  p_nit text,
  p_full_name text
)
RETURNS uuid
LANGUAGE plpgsql
STABLE
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_id uuid;
  v_count integer;
  v_lead public.outreach_leads%ROWTYPE;
  v_name_key text;
  v_lead_nit text;
BEGIN
  IF p_phone_key IS NOT NULL THEN
    SELECT * INTO v_lead
    FROM public.outreach_leads
    WHERE phone_key = p_phone_key
    LIMIT 1;
    IF FOUND THEN
      IF v_lead.crm_directory_id IS NOT NULL AND EXISTS (
        SELECT 1 FROM public.crm_directory WHERE id = v_lead.crm_directory_id
      ) THEN
        RETURN v_lead.crm_directory_id;
      END IF;
      IF v_lead.email IS NOT NULL AND trim(v_lead.email) <> '' THEN
        SELECT id INTO v_id
        FROM public.crm_directory
        WHERE lower(trim(email)) = lower(trim(v_lead.email))
        LIMIT 1;
        IF v_id IS NOT NULL THEN
          RETURN v_id;
        END IF;
      END IF;
      v_lead_nit := public.directory_normalize_nit(v_lead.nit);
      IF v_lead_nit IS NOT NULL THEN
        SELECT count(*) INTO v_count
        FROM public.crm_directory
        WHERE public.directory_normalize_nit(metadata->'outreach'->>'nit') = v_lead_nit
           OR public.directory_normalize_nit(document_number) = v_lead_nit;
        IF v_count = 1 THEN
          SELECT id INTO v_id
          FROM public.crm_directory
          WHERE public.directory_normalize_nit(metadata->'outreach'->>'nit') = v_lead_nit
             OR public.directory_normalize_nit(document_number) = v_lead_nit
          LIMIT 1;
          RETURN v_id;
        END IF;
      END IF;
    END IF;
  END IF;

  IF p_nit IS NOT NULL THEN
    SELECT count(*) INTO v_count
    FROM public.crm_directory
    WHERE public.directory_normalize_nit(metadata->'outreach'->>'nit') = p_nit
       OR public.directory_normalize_nit(document_number) = p_nit;
    IF v_count = 1 THEN
      SELECT id INTO v_id
      FROM public.crm_directory
      WHERE public.directory_normalize_nit(metadata->'outreach'->>'nit') = p_nit
         OR public.directory_normalize_nit(document_number) = p_nit
      LIMIT 1;
      RETURN v_id;
    END IF;
  END IF;

  IF p_email IS NOT NULL THEN
    SELECT id INTO v_id
    FROM public.crm_directory
    WHERE lower(trim(email)) = p_email
    LIMIT 1;
    IF v_id IS NOT NULL THEN
      RETURN v_id;
    END IF;
  END IF;

  v_name_key := public.directory_company_name_key(p_full_name);
  IF v_name_key IS NOT NULL AND public.directory_is_company_name(p_full_name) THEN
    SELECT count(*) INTO v_count
    FROM public.crm_directory
    WHERE public.directory_company_name_key(full_name) = v_name_key
      AND (phone_key IS NULL OR trim(phone_key) = '')
      AND COALESCE(source, '') ILIKE '%LEAD%'
      AND public.directory_is_company_name(full_name);
    IF v_count = 1 THEN
      SELECT id INTO v_id
      FROM public.crm_directory
      WHERE public.directory_company_name_key(full_name) = v_name_key
        AND (phone_key IS NULL OR trim(phone_key) = '')
        AND COALESCE(source, '') ILIKE '%LEAD%'
        AND public.directory_is_company_name(full_name)
      LIMIT 1;
      RETURN v_id;
    END IF;
  END IF;

  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.directory_resolve_unique_conflict(
  p_phone_key text,
  p_email text
)
RETURNS uuid
LANGUAGE plpgsql
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_by_phone uuid;
  v_by_email uuid;
  v_keeper uuid;
  v_loser uuid;
BEGIN
  IF p_phone_key IS NOT NULL THEN
    SELECT id INTO v_by_phone
    FROM public.crm_directory
    WHERE phone_key = p_phone_key
    ORDER BY created_at ASC
    LIMIT 1;
  END IF;
  IF p_email IS NOT NULL THEN
    SELECT id INTO v_by_email
    FROM public.crm_directory
    WHERE lower(trim(email)) = p_email
    ORDER BY created_at ASC
    LIMIT 1;
  END IF;

  IF v_by_phone IS NOT NULL AND v_by_email IS NOT NULL AND v_by_phone <> v_by_email THEN
    v_keeper := public.directory_pick_identity_keeper(v_by_email, v_by_phone);
    v_loser := CASE WHEN v_keeper = v_by_email THEN v_by_phone ELSE v_by_email END;
    PERFORM public.merge_directory_entries(v_keeper, v_loser);
    RETURN v_keeper;
  END IF;

  RETURN COALESCE(v_by_phone, v_by_email);
END;
$$;

CREATE INDEX IF NOT EXISTS idx_crm_directory_outreach_nit
  ON public.crm_directory (public.directory_normalize_nit(metadata->'outreach'->>'nit'))
  WHERE metadata->'outreach'->>'nit' IS NOT NULL;

CREATE OR REPLACE FUNCTION public.upsert_directory_entry(
  p_entry jsonb,
  p_overwrite_classification boolean DEFAULT false,
  p_replace_tags boolean DEFAULT false
)
RETURNS uuid
LANGUAGE plpgsql
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_existing_id UUID;
  v_id UUID;
  v_firebase_doc TEXT;
  v_phone TEXT;
  v_email TEXT;
  v_phone_key TEXT;
  v_nit TEXT;
  v_retry BOOLEAN;
  v_conflict UUID;
  v_classification TEXT;
  v_full_name TEXT;
  v_display_name TEXT;
  v_photo_url TEXT;
  v_address TEXT;
  v_notes TEXT;
  v_app_user_id TEXT;
  v_is_app_user BOOLEAN;
  v_provider_id TEXT;
  v_service_id TEXT;
  v_quality_tag TEXT;
  v_status TEXT;
  v_source TEXT;
  v_payment_status TEXT;
  v_pending_amount NUMERIC;
  v_pending_appointments_count INTEGER;
  v_last_charged_amount NUMERIC;
  v_otp_required BOOLEAN;
  v_preferred_service_address_line TEXT;
  v_preferred_service_address_ref TEXT;
  v_preferred_google_maps_url TEXT;
  v_preferred_waze_url TEXT;
  v_document_type TEXT;
  v_document_number TEXT;
  v_identity_verified_at TIMESTAMPTZ;
  v_identity_source TEXT;
  v_first_contact_at TIMESTAMPTZ;
  v_last_contact_at TIMESTAMPTZ;
  v_messages_count INTEGER;
  v_active_sequence TEXT;
  v_sequence_step INTEGER;
  v_opt_out BOOLEAN;
  v_last_response_text TEXT;
  v_last_response_at TIMESTAMPTZ;
  v_last_whatsapp_message_at TIMESTAMPTZ;
  v_last_whatsapp_message_text TEXT;
  v_last_whatsapp_intent TEXT;
  v_unread_whatsapp_count INTEGER;
  v_whatsapp_assigned_to TEXT;
  v_whatsapp_conversation_id TEXT;
  v_appointment_id TEXT;
  v_internal_notes TEXT;
  v_channels TEXT[];
  v_tags TEXT[];
  v_metadata JSONB;
  v_is_whatsapp BOOLEAN;
BEGIN
  v_id := NULLIF(trim(p_entry->>'id'), '')::uuid;
  v_retry := COALESCE(p_entry->>'_identity_retry', '') = '1';
  v_firebase_doc := NULLIF(trim(p_entry->'metadata'->'source_ids'->>'firebase_crmClient_docId'), '');
  v_phone := normalize_directory_phone_e164(p_entry->>'phone');
  v_email := NULLIF(lower(trim(p_entry->>'email')), '');
  v_phone_key := directory_phone_key(COALESCE(v_phone, p_entry->>'phone'));
  v_nit := COALESCE(
    public.directory_normalize_nit(p_entry->'metadata'->'outreach'->>'nit'),
    public.directory_normalize_nit(p_entry->>'document_number')
  );
  v_is_whatsapp := COALESCE(p_entry->>'source', '') ILIKE '%WHATSAPP%';
  v_classification := NULLIF(trim(p_entry->>'classification'), '');
  v_full_name := NULLIF(trim(p_entry->>'full_name'), '');
  v_display_name := NULLIF(trim(p_entry->>'display_name'), '');
  v_photo_url := NULLIF(trim(p_entry->>'photo_url'), '');
  v_address := NULLIF(trim(p_entry->>'address'), '');
  v_notes := NULLIF(trim(p_entry->>'notes'), '');
  v_app_user_id := NULLIF(trim(p_entry->>'app_user_id'), '');
  v_is_app_user := (p_entry->>'is_app_user')::boolean;
  v_provider_id := NULLIF(trim(p_entry->>'provider_id'), '');
  v_service_id := NULLIF(trim(p_entry->>'service_id'), '');
  v_quality_tag := NULLIF(trim(p_entry->>'quality_tag'), '');
  v_status := NULLIF(trim(p_entry->>'status'), '');
  v_source := NULLIF(trim(p_entry->>'source'), '');
  v_payment_status := NULLIF(trim(p_entry->>'payment_status'), '');
  v_pending_amount := (p_entry->>'pending_amount')::numeric;
  v_pending_appointments_count := (p_entry->>'pending_appointments_count')::integer;
  v_last_charged_amount := (p_entry->>'last_charged_amount')::numeric;
  v_otp_required := (p_entry->>'otp_required')::boolean;
  v_preferred_service_address_line := NULLIF(trim(p_entry->>'preferred_service_address_line'), '');
  v_preferred_service_address_ref := NULLIF(trim(p_entry->>'preferred_service_address_ref'), '');
  v_preferred_google_maps_url := NULLIF(trim(p_entry->>'preferred_google_maps_url'), '');
  v_preferred_waze_url := NULLIF(trim(p_entry->>'preferred_waze_url'), '');
  v_document_type := NULLIF(trim(p_entry->>'document_type'), '');
  v_document_number := NULLIF(trim(p_entry->>'document_number'), '');
  v_identity_verified_at := (p_entry->>'identity_verified_at')::timestamptz;
  v_identity_source := NULLIF(trim(p_entry->>'identity_source'), '');
  v_first_contact_at := (p_entry->>'first_contact_at')::timestamptz;
  v_last_contact_at := (p_entry->>'last_contact_at')::timestamptz;
  v_messages_count := (p_entry->>'messages_count')::integer;
  v_active_sequence := NULLIF(trim(p_entry->>'active_sequence'), '');
  v_sequence_step := (p_entry->>'sequence_step')::integer;
  v_opt_out := (p_entry->>'opt_out')::boolean;
  v_last_response_text := NULLIF(trim(p_entry->>'last_response_text'), '');
  v_last_response_at := (p_entry->>'last_response_at')::timestamptz;
  v_last_whatsapp_message_at := (p_entry->>'last_whatsapp_message_at')::timestamptz;
  v_last_whatsapp_message_text := NULLIF(trim(p_entry->>'last_whatsapp_message_text'), '');
  v_last_whatsapp_intent := NULLIF(trim(p_entry->>'last_whatsapp_intent'), '');
  v_unread_whatsapp_count := (p_entry->>'unread_whatsapp_count')::integer;
  v_whatsapp_assigned_to := NULLIF(trim(p_entry->>'whatsapp_assigned_to'), '');
  v_whatsapp_conversation_id := NULLIF(trim(p_entry->>'whatsapp_conversation_id'), '');
  v_appointment_id := NULLIF(trim(p_entry->>'appointment_id'), '');
  v_internal_notes := NULLIF(trim(p_entry->>'internal_notes'), '');
  v_channels := CASE
    WHEN p_entry->'channels' IS NOT NULL
      THEN ARRAY(SELECT jsonb_array_elements_text(p_entry->'channels'))
    ELSE NULL
  END;
  v_tags := CASE
    WHEN p_entry->'tags' IS NOT NULL
      THEN ARRAY(SELECT jsonb_array_elements_text(p_entry->'tags'))
    ELSE NULL
  END;
  v_metadata := COALESCE(p_entry->'metadata', '{}'::jsonb);

  IF v_id IS NOT NULL THEN
    SELECT id INTO v_existing_id FROM crm_directory WHERE id = v_id LIMIT 1;
  END IF;

  IF v_existing_id IS NULL AND v_app_user_id IS NOT NULL THEN
    SELECT id INTO v_existing_id
    FROM crm_directory
    WHERE app_user_id = v_app_user_id
    ORDER BY created_at ASC
    LIMIT 1;
  END IF;

  IF v_existing_id IS NULL AND v_phone_key IS NOT NULL AND v_email IS NOT NULL THEN
    SELECT id INTO v_existing_id FROM crm_directory WHERE phone_key = v_phone_key AND lower(trim(email)) = v_email LIMIT 1;
  END IF;

  IF v_existing_id IS NULL AND v_phone_key IS NOT NULL THEN
    SELECT id INTO v_existing_id FROM crm_directory WHERE phone_key = v_phone_key ORDER BY created_at ASC LIMIT 1;
  END IF;

  IF v_existing_id IS NULL AND v_email IS NOT NULL THEN
    SELECT id INTO v_existing_id FROM crm_directory WHERE lower(trim(email)) = v_email AND (phone IS NULL OR trim(phone) = '' OR phone_key IS NULL) LIMIT 1;
  END IF;

  IF v_existing_id IS NULL THEN
    v_existing_id := public.directory_find_identity_match(v_phone_key, v_email, v_nit, v_full_name);
  END IF;

  IF v_existing_id IS NULL AND v_firebase_doc IS NOT NULL THEN
    SELECT id INTO v_existing_id
    FROM crm_directory
    WHERE metadata->'source_ids'->>'firebase_crmClient_docId' = v_firebase_doc
    ORDER BY created_at ASC
    LIMIT 1;
  END IF;

  IF v_existing_id IS NULL AND v_whatsapp_conversation_id IS NOT NULL THEN
    SELECT id INTO v_existing_id FROM crm_directory WHERE whatsapp_conversation_id = v_whatsapp_conversation_id LIMIT 1;
  END IF;

  IF v_existing_id IS NULL AND v_is_whatsapp AND v_full_name IS NOT NULL THEN
    SELECT id INTO v_existing_id FROM crm_directory WHERE lower(trim(full_name)) = lower(trim(v_full_name)) AND (phone IS NULL OR trim(phone) = '' OR phone_key IS NULL) AND source ILIKE '%CRM_CLIENT%' LIMIT 1;
  END IF;

  IF v_existing_id IS NULL AND v_phone_key IS NULL AND v_email IS NULL THEN
    IF v_existing_id IS NULL AND v_provider_id IS NOT NULL AND v_service_id IS NOT NULL THEN
      SELECT id INTO v_existing_id FROM crm_directory WHERE provider_id = v_provider_id AND service_id = v_service_id AND source ILIKE '%CRM_CLIENT%' AND (phone IS NULL OR trim(phone) = '' OR phone_key IS NULL) AND (email IS NULL OR trim(email) = '') ORDER BY created_at ASC LIMIT 1;
    END IF;
  END IF;

  IF v_existing_id IS NOT NULL THEN
    UPDATE crm_directory
    SET
      full_name = CASE
        WHEN public.directory_is_company_name(full_name)
          AND NOT public.directory_is_company_name(v_full_name)
          THEN full_name
        ELSE COALESCE(v_full_name, full_name)
      END,
      display_name = CASE
        WHEN public.directory_is_company_name(display_name)
          AND NOT public.directory_is_company_name(v_display_name)
          THEN display_name
        ELSE COALESCE(v_display_name, display_name)
      END,
      email = COALESCE(v_email, email),
      phone = COALESCE(v_phone, phone),
      photo_url = COALESCE(v_photo_url, photo_url),
      address = COALESCE(v_address, address),
      notes = COALESCE(v_notes, notes),
      app_user_id = COALESCE(v_app_user_id, app_user_id),
      is_app_user = COALESCE(v_is_app_user, is_app_user),
      provider_id = COALESCE(v_provider_id, provider_id),
      service_id = COALESCE(v_service_id, service_id),
      classification = CASE WHEN p_overwrite_classification THEN CASE WHEN v_classification IS NOT NULL THEN v_classification ELSE 'unknown' END ELSE COALESCE(classification, v_classification) END,
      quality_tag = COALESCE(v_quality_tag, quality_tag),
      status = COALESCE(v_status, status),
      source = CASE WHEN source IS NULL OR trim(source) = '' THEN v_source WHEN v_source IS NOT NULL AND position(v_source in source) = 0 THEN source || ', ' || v_source ELSE source END,
      channels = CASE WHEN v_channels IS NOT NULL THEN ARRAY(SELECT DISTINCT unnest(COALESCE(channels, '{}'::text[]) || v_channels)) ELSE channels END,
      payment_status = COALESCE(v_payment_status, payment_status),
      pending_amount = COALESCE(v_pending_amount, pending_amount),
      pending_appointments_count = COALESCE(v_pending_appointments_count, pending_appointments_count),
      last_charged_amount = COALESCE(v_last_charged_amount, last_charged_amount),
      otp_required = COALESCE(v_otp_required, otp_required),
      preferred_service_address_line = COALESCE(v_preferred_service_address_line, preferred_service_address_line),
      preferred_service_address_ref = COALESCE(v_preferred_service_address_ref, preferred_service_address_ref),
      preferred_google_maps_url = COALESCE(v_preferred_google_maps_url, preferred_google_maps_url),
      preferred_waze_url = COALESCE(v_preferred_waze_url, preferred_waze_url),
      document_type = COALESCE(v_document_type, document_type),
      document_number = COALESCE(v_document_number, document_number),
      identity_verified_at = COALESCE(v_identity_verified_at, identity_verified_at),
      identity_source = COALESCE(v_identity_source, identity_source),
      first_contact_at = LEAST(COALESCE(v_first_contact_at, 'infinity'::timestamptz), COALESCE(first_contact_at, 'infinity'::timestamptz)),
      last_contact_at = GREATEST(COALESCE(v_last_contact_at, '1970-01-01'::timestamptz), COALESCE(last_contact_at, '1970-01-01'::timestamptz)),
      messages_count = GREATEST(COALESCE(v_messages_count, 0), COALESCE(messages_count, 0)),
      active_sequence = COALESCE(v_active_sequence, active_sequence),
      sequence_step = COALESCE(v_sequence_step, sequence_step),
      opt_out = COALESCE(v_opt_out, opt_out),
      last_response_text = COALESCE(v_last_response_text, last_response_text),
      last_response_at = GREATEST(COALESCE(v_last_response_at, '1970-01-01'::timestamptz), COALESCE(last_response_at, '1970-01-01'::timestamptz)),
      last_whatsapp_message_at = GREATEST(COALESCE(v_last_whatsapp_message_at, '1970-01-01'::timestamptz), COALESCE(last_whatsapp_message_at, '1970-01-01'::timestamptz)),
      last_whatsapp_message_text = COALESCE(v_last_whatsapp_message_text, last_whatsapp_message_text),
      last_whatsapp_intent = COALESCE(v_last_whatsapp_intent, last_whatsapp_intent),
      unread_whatsapp_count = COALESCE(v_unread_whatsapp_count, unread_whatsapp_count),
      whatsapp_assigned_to = COALESCE(v_whatsapp_assigned_to, whatsapp_assigned_to),
      whatsapp_conversation_id = COALESCE(v_whatsapp_conversation_id, whatsapp_conversation_id),
      appointment_id = COALESCE(v_appointment_id, appointment_id),
      internal_notes = COALESCE(v_internal_notes, internal_notes),
      tags = CASE
        WHEN v_tags IS NOT NULL AND p_replace_tags THEN v_tags
        WHEN v_tags IS NOT NULL THEN ARRAY(SELECT DISTINCT unnest(COALESCE(tags, '{}'::text[]) || v_tags))
        ELSE tags
      END,
      metadata = metadata || v_metadata,
      updated_at = NOW(),
      last_synced_at = NOW()
    WHERE id = v_existing_id;
    RETURN v_existing_id;
  ELSE
    INSERT INTO crm_directory (
      full_name, display_name, email, phone, photo_url, address, notes,
      app_user_id, is_app_user, provider_id, service_id,
      classification, quality_tag, status, source, channels,
      payment_status, pending_amount, pending_appointments_count, last_charged_amount,
      otp_required, preferred_service_address_line, preferred_service_address_ref,
      preferred_google_maps_url, preferred_waze_url,
      document_type, document_number, identity_verified_at, identity_source,
      first_contact_at, last_contact_at, messages_count,
      active_sequence, sequence_step, opt_out,
      last_response_text, last_response_at,
      last_whatsapp_message_at, last_whatsapp_message_text, last_whatsapp_intent,
      unread_whatsapp_count, whatsapp_assigned_to, whatsapp_conversation_id,
      appointment_id, internal_notes, tags, metadata
    ) VALUES (
      COALESCE(v_full_name, v_display_name, v_phone, 'WhatsApp'),
      v_display_name, v_email, v_phone, v_photo_url, v_address, v_notes,
      v_app_user_id, COALESCE(v_is_app_user, false), v_provider_id, v_service_id,
      COALESCE(v_classification, 'unknown'),
      COALESCE(v_quality_tag, 'standard'),
      COALESCE(v_status, 'active'), v_source,
      COALESCE(v_channels, '{}'::text[]),
      v_payment_status, v_pending_amount, v_pending_appointments_count, v_last_charged_amount,
      v_otp_required, v_preferred_service_address_line, v_preferred_service_address_ref,
      v_preferred_google_maps_url, v_preferred_waze_url,
      v_document_type, v_document_number, v_identity_verified_at, v_identity_source,
      v_first_contact_at, v_last_contact_at, COALESCE(v_messages_count, 0),
      COALESCE(v_active_sequence, 'NINGUNA'), COALESCE(v_sequence_step, 0),
      COALESCE(v_opt_out, false),
      v_last_response_text, v_last_response_at,
      v_last_whatsapp_message_at, v_last_whatsapp_message_text, v_last_whatsapp_intent,
      COALESCE(v_unread_whatsapp_count, 0), v_whatsapp_assigned_to, v_whatsapp_conversation_id,
      v_appointment_id, v_internal_notes,
      COALESCE(v_tags, '{}'::text[]), v_metadata
    )
    RETURNING id INTO v_existing_id;
    RETURN v_existing_id;
  END IF;
EXCEPTION
  WHEN unique_violation THEN
    v_conflict := public.directory_resolve_unique_conflict(v_phone_key, v_email);
    IF v_conflict IS NOT NULL THEN
      IF v_retry THEN
        RETURN v_conflict;
      END IF;
      RETURN public.upsert_directory_entry(
        (p_entry - '_identity_retry') || jsonb_build_object(
          'id', v_conflict::text,
          '_identity_retry', '1'
        ),
        p_overwrite_classification,
        p_replace_tags
      );
    END IF;
    IF v_firebase_doc IS NOT NULL THEN
      SELECT id INTO v_existing_id
      FROM crm_directory
      WHERE metadata->'source_ids'->>'firebase_crmClient_docId' = v_firebase_doc
      ORDER BY created_at ASC
      LIMIT 1;
      IF v_existing_id IS NOT NULL THEN
        RETURN v_existing_id;
      END IF;
    END IF;
    RAISE;
END;
$function$;

CREATE OR REPLACE FUNCTION public.auto_merge_directory_by_identity()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_group RECORD;
  v_dup UUID;
  v_merged INTEGER := 0;
BEGIN
  FOR v_group IN
    SELECT
      array_agg(id ORDER BY
        CASE
          WHEN COALESCE(source, '') ILIKE '%CRM_CLIENT%' THEN 0
          WHEN COALESCE(source, '') ILIKE '%APP_USER%' THEN 1
          WHEN COALESCE(source, '') ILIKE '%LEAD%' THEN 2
          WHEN COALESCE(source, '') ILIKE '%WHATSAPP%' THEN 3
          ELSE 4
        END,
        created_at ASC
      ) AS ids
    FROM crm_directory
    WHERE NULLIF(trim(metadata->'source_ids'->>'firebase_crmClient_docId'), '') IS NOT NULL
    GROUP BY (metadata->'source_ids'->>'firebase_crmClient_docId')
    HAVING count(*) > 1
  LOOP
    FOREACH v_dup IN ARRAY v_group.ids[2:array_length(v_group.ids, 1)]
    LOOP
      PERFORM merge_directory_entries(v_group.ids[1], v_dup);
      v_merged := v_merged + 1;
    END LOOP;
  END LOOP;

  FOR v_group IN
    SELECT
      array_agg(id ORDER BY
        CASE
          WHEN COALESCE(source, '') ILIKE '%CRM_CLIENT%' THEN 0
          WHEN COALESCE(source, '') ILIKE '%APP_USER%' THEN 1
          WHEN COALESCE(source, '') ILIKE '%LEAD%' THEN 2
          WHEN COALESCE(source, '') ILIKE '%WHATSAPP%' THEN 3
          ELSE 4
        END,
        created_at ASC
      ) AS ids
    FROM crm_directory
    WHERE provider_id IS NOT NULL
      AND service_id IS NOT NULL
      AND source ILIKE '%CRM_CLIENT%'
      AND (phone IS NULL OR trim(phone) = '' OR phone_key IS NULL)
      AND (email IS NULL OR trim(email) = '')
    GROUP BY provider_id, service_id
    HAVING count(*) > 1
  LOOP
    FOREACH v_dup IN ARRAY v_group.ids[2:array_length(v_group.ids, 1)]
    LOOP
      PERFORM merge_directory_entries(v_group.ids[1], v_dup);
      v_merged := v_merged + 1;
    END LOOP;
  END LOOP;

  FOR v_group IN
    SELECT
      array_agg(id ORDER BY
        CASE
          WHEN email IS NOT NULL AND trim(email) <> '' THEN 0
          WHEN COALESCE(source, '') ILIKE '%LEAD%' THEN 1
          WHEN COALESCE(source, '') ILIKE '%CRM_CLIENT%' THEN 2
          WHEN COALESCE(source, '') ILIKE '%WHATSAPP%' THEN 3
          ELSE 4
        END,
        created_at ASC
      ) AS ids
    FROM crm_directory
    WHERE public.directory_normalize_nit(metadata->'outreach'->>'nit') IS NOT NULL
    GROUP BY public.directory_normalize_nit(metadata->'outreach'->>'nit')
    HAVING count(*) > 1
  LOOP
    FOREACH v_dup IN ARRAY v_group.ids[2:array_length(v_group.ids, 1)]
    LOOP
      PERFORM merge_directory_entries(v_group.ids[1], v_dup);
      v_merged := v_merged + 1;
    END LOOP;
  END LOOP;

  RETURN v_merged;
END;
$$;

CREATE OR REPLACE FUNCTION public.outreach_leads_rehydrate_directory()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_id uuid;
  v_entry jsonb;
BEGIN
  IF TG_OP <> 'UPDATE' THEN
    RETURN NEW;
  END IF;
  IF NEW.phone_key IS NULL OR length(NEW.phone_key) <> 10 OR left(NEW.phone_key, 1) <> '3' THEN
    RETURN NEW;
  END IF;
  IF OLD.phone_key IS NOT NULL THEN
    RETURN NEW;
  END IF;

  v_entry := jsonb_strip_nulls(jsonb_build_object(
    'status', 'active',
    'source', 'LEAD',
    'channels', jsonb_build_array('WHATSAPP'),
    'full_name', NULLIF(trim(NEW.name), ''),
    'display_name', NULLIF(trim(NEW.name), ''),
    'phone', '+57' || NEW.phone_key,
    'email', NULLIF(lower(trim(NEW.email)), ''),
    'address', NULLIF(trim(NEW.address), ''),
    'id', NEW.crm_directory_id,
    'metadata', jsonb_build_object(
      'outreach', jsonb_build_object(
        'nit', NEW.nit,
        'ciiu', NEW.ciiu,
        'municipio', NEW.municipio,
        'leadId', NEW.id
      )
    )
  ));

  v_id := public.upsert_directory_entry(v_entry, false, false);
  IF v_id IS NOT NULL THEN
    NEW.crm_directory_id := v_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS outreach_leads_rehydrate_directory ON public.outreach_leads;
CREATE TRIGGER outreach_leads_rehydrate_directory
BEFORE UPDATE OF phone_key ON public.outreach_leads
FOR EACH ROW
EXECUTE FUNCTION public.outreach_leads_rehydrate_directory();

GRANT EXECUTE ON FUNCTION public.directory_company_name_key(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.directory_is_company_name(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.directory_normalize_nit(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.directory_pick_identity_keeper(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.directory_find_identity_match(text, text, text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.directory_resolve_unique_conflict(text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.upsert_directory_entry(jsonb, boolean, boolean) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.auto_merge_directory_by_identity() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.outreach_leads_rehydrate_directory() TO authenticated, service_role;
