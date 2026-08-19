-- Plan activo: Supabase Pro ($25/mes) — File Storage incluido: 100 GB.
-- Antes: Free 1 GB (plan_free_bytes = 1073741824). Monitoreo usaba ese umbral.

-- ── Umbrales en platform_settings ────────────────────────────────────────────

update public.platform_settings
set value = coalesce(value, '{}'::jsonb)
  || jsonb_build_object(
    'plan_name', 'Pro',
    'plan_storage_bytes', 107374182400,
    'plan_storage_label', '100 GB',
    -- Mantener clave legacy para RPCs que aún leen plan_free_bytes
    'plan_free_bytes', 107374182400
  )
where key = 'storage_monitor_thresholds';

insert into public.platform_settings (key, value)
values (
  'storage_monitor_thresholds',
  '{
    "plan_name": "Pro",
    "plan_storage_bytes": 107374182400,
    "plan_storage_label": "100 GB",
    "plan_free_bytes": 107374182400,
    "warning_percent": 80,
    "critical_percent": 90,
    "heavy_chat_bytes": 20971520,
    "metadata_drift_percent": 10,
    "stale_catalog_days": 30,
    "duplicate_pdf_min_copies": 3,
    "duplicate_pdf_min_age_days": 14
  }'::jsonb
)
on conflict (key) do nothing;

-- ── Helper: cuota de plan (Pro 100 GB; fallback legacy plan_free_bytes) ──────

create or replace function app_private.storage_plan_bytes()
returns bigint
language sql
stable
set search_path = public, app_private
as $$
  select coalesce(
    nullif((app_private.storage_monitor_thresholds()->>'plan_storage_bytes')::bigint, 0),
    nullif((app_private.storage_monitor_thresholds()->>'plan_free_bytes')::bigint, 0),
    107374182400
  );
$$;

create or replace function app_private.storage_monitor_thresholds()
returns jsonb
language sql
stable
set search_path = public, app_private
as $$
  select coalesce(
    (select value from public.platform_settings where key = 'storage_monitor_thresholds'),
    '{
      "plan_name": "Pro",
      "plan_storage_bytes": 107374182400,
      "plan_storage_label": "100 GB",
      "plan_free_bytes": 107374182400,
      "warning_percent": 80,
      "critical_percent": 90,
      "heavy_chat_bytes": 20971520,
      "metadata_drift_percent": 10,
      "stale_catalog_days": 30,
      "duplicate_pdf_min_copies": 3,
      "duplicate_pdf_min_age_days": 14
    }'::jsonb
  );
$$;

-- ── Overview: usar helper de cuota Pro ───────────────────────────────────────

create or replace function public.get_storage_overview()
returns jsonb
language plpgsql
security definer
set search_path = public, storage, app_private
as $$
declare
  v_plan_bytes bigint;
  v_buckets text[] := array['whatsapp-media', 'whatsapp-stickers', 'crm-contact-photos'];
  v_bucket text;
  v_buckets_json jsonb := '[]'::jsonb;
  v_total_bytes bigint := 0;
  v_row record;
begin
  if not app_private.can_access_storage_monitor() then
    raise exception 'permission denied';
  end if;

  v_plan_bytes := app_private.storage_plan_bytes();

  foreach v_bucket in array v_buckets loop
    select
      count(*) as object_count,
      coalesce(sum(app_private.storage_object_size(metadata)), 0) as total_bytes
    into v_row
    from storage.objects
    where bucket_id = v_bucket;

    v_buckets_json := v_buckets_json || jsonb_build_array(jsonb_build_object(
      'bucket_id', v_bucket,
      'total_objects', coalesce(v_row.object_count, 0),
      'total_bytes', coalesce(v_row.total_bytes, 0),
      'used_percent', round(
        (coalesce(v_row.total_bytes, 0)::numeric / nullif(v_plan_bytes, 0)::numeric) * 100,
        1
      )
    ));
    v_total_bytes := v_total_bytes + coalesce(v_row.total_bytes, 0);
  end loop;

  return jsonb_build_object(
    'plan_limit_bytes', v_plan_bytes,
    'plan_name', coalesce(app_private.storage_monitor_thresholds()->>'plan_name', 'Pro'),
    'plan_storage_label', coalesce(app_private.storage_monitor_thresholds()->>'plan_storage_label', '100 GB'),
    'total_bytes', v_total_bytes,
    'used_percent', round((v_total_bytes::numeric / nullif(v_plan_bytes, 0)::numeric) * 100, 1),
    'free_bytes', greatest(v_plan_bytes - v_total_bytes, 0),
    'buckets', v_buckets_json
  );
end;
$$;

-- ── Suggestions: mensaje dinámico según plan (Pro 100 GB) ────────────────────

create or replace function public.get_storage_suggestions()
returns jsonb
language plpgsql
security definer
set search_path = public, storage, app_private
as $$
declare
  v_thresholds jsonb;
  v_plan_bytes bigint;
  v_plan_name text;
  v_plan_label text;
  v_total_bytes bigint;
  v_used_percent numeric;
  v_suggestions jsonb := '[]'::jsonb;
  v_dup_count int;
  v_stale_count int;
  v_heavy_count int;
  v_drift_percent numeric;
  v_orphan_count int;
begin
  if not app_private.can_access_storage_monitor() then
    raise exception 'permission denied';
  end if;

  v_thresholds := app_private.storage_monitor_thresholds();
  v_plan_bytes := app_private.storage_plan_bytes();
  v_plan_name := coalesce(v_thresholds->>'plan_name', 'Pro');
  v_plan_label := coalesce(v_thresholds->>'plan_storage_label', '100 GB');

  select coalesce(sum(app_private.storage_object_size(metadata)), 0)
  into v_total_bytes
  from storage.objects
  where bucket_id in ('whatsapp-media', 'whatsapp-stickers', 'crm-contact-photos');

  v_used_percent := round((v_total_bytes::numeric / nullif(v_plan_bytes, 0)::numeric) * 100, 1);

  if v_used_percent >= coalesce((v_thresholds->>'critical_percent')::numeric, 90) then
    v_suggestions := v_suggestions || jsonb_build_array(jsonb_build_object(
      'id', 'storage_critical',
      'severity', 'critical',
      'title', 'Almacenamiento crítico',
      'message', format('Uso al %s%% del plan %s (%s). Libera espacio urgentemente.', v_used_percent, v_plan_name, v_plan_label),
      'action', 'optimize_duplicate_pdfs'
    ));
  elsif v_used_percent >= coalesce((v_thresholds->>'warning_percent')::numeric, 80) then
    v_suggestions := v_suggestions || jsonb_build_array(jsonb_build_object(
      'id', 'storage_warning',
      'severity', 'warning',
      'title', 'Almacenamiento elevado',
      'message', format('Uso al %s%% del plan %s (%s). Revisa el ranking completo de chats.', v_used_percent, v_plan_name, v_plan_label),
      'action', 'ranking'
    ));
  end if;

  select count(*)::int into v_dup_count
  from (
    select sha256
    from public.whatsapp_media_assets
    where mime_type = 'application/pdf' and sha256 is not null
    group by sha256
    having count(*) >= coalesce((v_thresholds->>'duplicate_pdf_min_copies')::int, 3)
  ) d;

  if v_dup_count > 0 then
    v_suggestions := v_suggestions || jsonb_build_array(jsonb_build_object(
      'id', 'duplicate_pdfs',
      'severity', 'warning',
      'title', 'PDFs duplicados detectados',
      'message', format('%s grupos con 3+ copias idénticas por SHA-256.', v_dup_count),
      'action', 'optimize_duplicate_pdfs'
    ));
  end if;

  select count(*)::int into v_stale_count
  from public.whatsapp_media_assets a
  join public.whatsapp_message_log ml on ml.id = a.message_log_id
  where a.mime_type = 'application/pdf'
    and a.sha256 is not null
    and ml.direction = 'outbound'
    and a.created_at < now() - make_interval(days => coalesce((v_thresholds->>'stale_catalog_days')::int, 30))
    and exists (
      select 1 from public.whatsapp_media_assets a2
      where a2.sha256 = a.sha256 and a2.id <> a.id
    );

  if v_stale_count > 0 then
    v_suggestions := v_suggestions || jsonb_build_array(jsonb_build_object(
      'id', 'stale_catalog_pdfs',
      'severity', 'info',
      'title', 'Catálogos PDF antiguos',
      'message', format('%s PDFs outbound antiguos con hash duplicado.', v_stale_count),
      'action', 'optimize_stale_catalog_pdfs'
    ));
  end if;

  select count(*)::int into v_heavy_count
  from (
    select split_part(name, '/', 1) as stable_key,
           sum(app_private.storage_object_size(metadata)) as bytes
    from storage.objects
    where bucket_id = 'whatsapp-media'
    group by split_part(name, '/', 1)
    having sum(app_private.storage_object_size(metadata)) > coalesce((v_thresholds->>'heavy_chat_bytes')::bigint, 20971520)
  ) h;

  if v_heavy_count > 0 then
    v_suggestions := v_suggestions || jsonb_build_array(jsonb_build_object(
      'id', 'heavy_chat',
      'severity', 'info',
      'title', 'Chats muy pesados',
      'message', format('%s conversaciones superan 20 MB.', v_heavy_count),
      'action', 'ranking'
    ));
  end if;

  select round(
    (count(*) filter (where size_bytes is null)::numeric / nullif(count(*), 0)::numeric) * 100,
    1
  )
  into v_drift_percent
  from public.whatsapp_media_assets
  where bucket_id = 'whatsapp-media';

  if coalesce(v_drift_percent, 0) > coalesce((v_thresholds->>'metadata_drift_percent')::numeric, 10) then
    v_suggestions := v_suggestions || jsonb_build_array(jsonb_build_object(
      'id', 'metadata_drift',
      'severity', 'warning',
      'title', 'Metadata incompleta',
      'message', format('%s%% de assets sin size_bytes. Sincroniza metadata.', v_drift_percent),
      'action', 'backfill_metadata'
    ));
  end if;

  select (result->>'storage_orphan_count')::int
  into v_orphan_count
  from (select public.get_storage_orphans() as result) s;

  if coalesce(v_orphan_count, 0) > 0 then
    v_suggestions := v_suggestions || jsonb_build_array(jsonb_build_object(
      'id', 'orphan_objects',
      'severity', 'warning',
      'title', 'Objetos huérfanos',
      'message', format('%s objetos en Storage sin índice en DB.', v_orphan_count),
      'action', 'analyze'
    ));
  end if;

  return v_suggestions;
end;
$$;
