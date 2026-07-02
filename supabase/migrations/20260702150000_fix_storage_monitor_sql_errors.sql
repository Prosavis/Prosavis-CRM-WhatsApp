-- Fix SQL bugs in storage monitor RPCs:
-- 1) get_conversation_storage_ranking: CTE "ranked" out of scope in second query
-- 2) get_storage_suggestions: format() does not support %.1f (use %s)

create or replace function public.get_conversation_storage_ranking(
  p_limit int default 20,
  p_offset int default 0,
  p_sort text default 'bytes'
)
returns jsonb
language plpgsql
security definer
set search_path = public, storage, app_private
as $$
declare
  v_sort text := lower(coalesce(p_sort, 'bytes'));
  v_rows jsonb;
  v_total int;
begin
  if not app_private.can_access_storage_monitor() then
    raise exception 'permission denied';
  end if;

  if v_sort not in ('bytes', 'messages', 'date', 'media') then
    v_sort := 'bytes';
  end if;

  with storage_by_chat as (
    select
      split_part(name, '/', 1) as stable_key,
      count(*)::int as media_count,
      coalesce(sum(app_private.storage_object_size(metadata)), 0)::bigint as total_bytes
    from storage.objects
    where bucket_id = 'whatsapp-media'
      and position('/' in name) > 0
    group by split_part(name, '/', 1)
  ),
  message_counts as (
    select conversation_stable_key as stable_key, count(*)::int as message_count
    from public.whatsapp_message_log
    group by conversation_stable_key
  ),
  ranked as (
    select
      s.stable_key,
      c.contact_name,
      c.contact_phone,
      coalesce(m.message_count, 0) as message_count,
      s.media_count,
      s.total_bytes,
      c.last_message_at
    from storage_by_chat s
    left join public.whatsapp_conversations c on c.stable_key = s.stable_key
    left join message_counts m on m.stable_key = s.stable_key
  )
  select
    (select count(*)::int from ranked),
    (
      select coalesce(jsonb_agg(row_to_json(x)), '[]'::jsonb)
      from (
        select
          stable_key,
          contact_name,
          contact_phone,
          message_count,
          media_count,
          total_bytes,
          last_message_at
        from ranked
        order by
          case when v_sort = 'bytes' then total_bytes end desc nulls last,
          case when v_sort = 'messages' then message_count end desc nulls last,
          case when v_sort = 'media' then media_count end desc nulls last,
          case when v_sort = 'date' then extract(epoch from last_message_at) end desc nulls last,
          stable_key asc
        limit greatest(p_limit, 1)
        offset greatest(p_offset, 0)
      ) x
    )
  into v_total, v_rows;

  return jsonb_build_object('rows', v_rows, 'total_count', v_total);
end;
$$;

create or replace function public.get_storage_suggestions()
returns jsonb
language plpgsql
security definer
set search_path = public, storage, app_private
as $$
declare
  v_thresholds jsonb;
  v_plan_bytes bigint;
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
  v_plan_bytes := coalesce((v_thresholds->>'plan_free_bytes')::bigint, 1073741824);

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
      'message', format('Uso al %s%% del plan Free (1 GB). Libera espacio urgentemente.', v_used_percent),
      'action', 'optimize_duplicate_pdfs'
    ));
  elsif v_used_percent >= coalesce((v_thresholds->>'warning_percent')::numeric, 80) then
    v_suggestions := v_suggestions || jsonb_build_array(jsonb_build_object(
      'id', 'storage_warning',
      'severity', 'warning',
      'title', 'Almacenamiento elevado',
      'message', format('Uso al %s%% del plan. Revisa el ranking completo de chats.', v_used_percent),
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
