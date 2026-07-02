-- Storage Monitor Intelligence: RPCs versionadas, optimization log, índices.
-- Fuente de verdad de bytes: storage.objects.metadata->>'size'

-- ── Audit trail ──────────────────────────────────────────────────────────────

create table if not exists public.whatsapp_storage_optimization_log (
  id uuid primary key default gen_random_uuid(),
  action text not null,
  dry_run boolean not null default true,
  bytes_freed bigint not null default 0,
  objects_affected integer not null default 0,
  details jsonb not null default '{}',
  executed_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

create index if not exists whatsapp_storage_optimization_log_created_at_idx
  on public.whatsapp_storage_optimization_log (created_at desc);

alter table public.whatsapp_storage_optimization_log enable row level security;

drop policy if exists "CRM admins read storage optimization log" on public.whatsapp_storage_optimization_log;
create policy "CRM admins read storage optimization log"
on public.whatsapp_storage_optimization_log for select to authenticated
using (app_private.is_crm_admin());

-- ── Índices whatsapp_media_assets ────────────────────────────────────────────

create index if not exists whatsapp_media_assets_sha256_mime_idx
  on public.whatsapp_media_assets (sha256, mime_type)
  where sha256 is not null;

create index if not exists whatsapp_media_assets_stable_key_size_idx
  on public.whatsapp_media_assets (conversation_stable_key, size_bytes);

-- ── Umbrales configurables (sin redeploy) ────────────────────────────────────

insert into public.platform_settings (key, value)
values (
  'storage_monitor_thresholds',
  '{
    "plan_free_bytes": 1073741824,
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

-- ── Helpers internos ─────────────────────────────────────────────────────────

create or replace function app_private.storage_object_size(p_metadata jsonb)
returns bigint
language sql
immutable
as $$
  select coalesce(nullif(trim(p_metadata->>'size'), '')::bigint, 0);
$$;

create or replace function app_private.storage_object_mimetype(p_metadata jsonb, p_name text)
returns text
language sql
immutable
as $$
  select lower(coalesce(
    nullif(trim(p_metadata->>'mimetype'), ''),
    nullif(trim(p_metadata->>'contentType'), ''),
    case
      when p_name ~* '\.(jpe?g|png|webp|gif)$' then 'image/unknown'
      when p_name ~* '\.(mp4|3gp)$' then 'video/unknown'
      when p_name ~* '\.(ogg|mp3|aac|m4a|amr)$' then 'audio/unknown'
      when p_name ~* '\.pdf$' then 'application/pdf'
      else 'application/octet-stream'
    end
  ));
$$;

create or replace function app_private.storage_mime_category(p_mime text)
returns text
language sql
immutable
as $$
  select case
    when p_mime like 'image/%' then 'image'
    when p_mime like 'video/%' then 'video'
    when p_mime like 'audio/%' then 'audio'
    when p_mime like 'text/%' or p_mime = 'application/pdf' then
      case when p_mime like 'text/%' then 'text' else 'document' end
    when p_mime like 'application/%' then 'document'
    else 'other'
  end;
$$;

create or replace function app_private.storage_monitor_thresholds()
returns jsonb
language sql
stable
as $$
  select coalesce(
    (select value from public.platform_settings where key = 'storage_monitor_thresholds'),
    '{
      "plan_free_bytes": 1073741824,
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

-- ── get_storage_stats ────────────────────────────────────────────────────────

create or replace function public.get_storage_stats(p_bucket text default 'whatsapp-media')
returns jsonb
language plpgsql
security definer
set search_path = public, storage, app_private
as $$
declare
  v_result jsonb;
begin
  if not app_private.is_crm_admin() then
    raise exception 'permission denied';
  end if;

  select jsonb_build_object(
    'total_objects', count(*),
    'total_bytes', coalesce(sum(app_private.storage_object_size(metadata)), 0),
    'breakdown', jsonb_build_object(
      'image', jsonb_build_object(
        'count', count(*) filter (where app_private.storage_mime_category(app_private.storage_object_mimetype(metadata, name)) = 'image'),
        'bytes', coalesce(sum(app_private.storage_object_size(metadata)) filter (where app_private.storage_mime_category(app_private.storage_object_mimetype(metadata, name)) = 'image'), 0)
      ),
      'video', jsonb_build_object(
        'count', count(*) filter (where app_private.storage_mime_category(app_private.storage_object_mimetype(metadata, name)) = 'video'),
        'bytes', coalesce(sum(app_private.storage_object_size(metadata)) filter (where app_private.storage_mime_category(app_private.storage_object_mimetype(metadata, name)) = 'video'), 0)
      ),
      'audio', jsonb_build_object(
        'count', count(*) filter (where app_private.storage_mime_category(app_private.storage_object_mimetype(metadata, name)) = 'audio'),
        'bytes', coalesce(sum(app_private.storage_object_size(metadata)) filter (where app_private.storage_mime_category(app_private.storage_object_mimetype(metadata, name)) = 'audio'), 0)
      ),
      'document', jsonb_build_object(
        'count', count(*) filter (where app_private.storage_mime_category(app_private.storage_object_mimetype(metadata, name)) = 'document'),
        'bytes', coalesce(sum(app_private.storage_object_size(metadata)) filter (where app_private.storage_mime_category(app_private.storage_object_mimetype(metadata, name)) = 'document'), 0)
      ),
      'text', jsonb_build_object(
        'count', count(*) filter (where app_private.storage_mime_category(app_private.storage_object_mimetype(metadata, name)) = 'text'),
        'bytes', coalesce(sum(app_private.storage_object_size(metadata)) filter (where app_private.storage_mime_category(app_private.storage_object_mimetype(metadata, name)) = 'text'), 0)
      ),
      'other', jsonb_build_object(
        'count', count(*) filter (where app_private.storage_mime_category(app_private.storage_object_mimetype(metadata, name)) = 'other'),
        'bytes', coalesce(sum(app_private.storage_object_size(metadata)) filter (where app_private.storage_mime_category(app_private.storage_object_mimetype(metadata, name)) = 'other'), 0)
      )
    )
  )
  into v_result
  from storage.objects
  where bucket_id = p_bucket;

  return coalesce(v_result, jsonb_build_object(
    'total_objects', 0,
    'total_bytes', 0,
    'breakdown', jsonb_build_object(
      'image', jsonb_build_object('count', 0, 'bytes', 0),
      'video', jsonb_build_object('count', 0, 'bytes', 0),
      'audio', jsonb_build_object('count', 0, 'bytes', 0),
      'document', jsonb_build_object('count', 0, 'bytes', 0),
      'text', jsonb_build_object('count', 0, 'bytes', 0),
      'other', jsonb_build_object('count', 0, 'bytes', 0)
    )
  ));
end;
$$;

-- ── get_storage_overview (multi-bucket) ──────────────────────────────────────

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
  if not app_private.is_crm_admin() then
    raise exception 'permission denied';
  end if;

  v_plan_bytes := coalesce((app_private.storage_monitor_thresholds()->>'plan_free_bytes')::bigint, 1073741824);

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
    'total_bytes', v_total_bytes,
    'used_percent', round((v_total_bytes::numeric / nullif(v_plan_bytes, 0)::numeric) * 100, 1),
    'free_bytes', greatest(v_plan_bytes - v_total_bytes, 0),
    'buckets', v_buckets_json
  );
end;
$$;

-- ── get_conversation_storage_ranking ───────────────────────────────────────

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
  if not app_private.is_crm_admin() then
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
  select count(*)::int into v_total from ranked;

  select coalesce(jsonb_agg(row_to_json(t)), '[]'::jsonb)
  into v_rows
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
  ) t;

  return jsonb_build_object('rows', v_rows, 'total_count', v_total);
end;
$$;

-- ── get_duplicate_pdf_groups ─────────────────────────────────────────────────

create or replace function public.get_duplicate_pdf_groups(p_min_age_days int default 14)
returns jsonb
language plpgsql
security definer
set search_path = public, storage, app_private
as $$
declare
  v_groups jsonb;
begin
  if not app_private.is_crm_admin() then
    raise exception 'permission denied';
  end if;

  with sha_groups as (
    select
      a.sha256,
      count(*)::int as copy_count,
      coalesce(sum(a.size_bytes), 0)::bigint as total_bytes,
      jsonb_agg(jsonb_build_object(
        'asset_id', a.id,
        'storage_path', a.storage_path,
        'conversation_stable_key', a.conversation_stable_key,
        'size_bytes', a.size_bytes,
        'created_at', a.created_at,
        'message_log_id', a.message_log_id
      ) order by a.created_at desc) as copies
    from public.whatsapp_media_assets a
    where a.mime_type = 'application/pdf'
      and a.sha256 is not null
      and a.created_at < now() - make_interval(days => greatest(p_min_age_days, 0))
    group by a.sha256
    having count(*) >= 2
  ),
  heuristic_groups as (
    select
      md5(concat_ws('|', a.size_bytes::text, a.storage_path)) as group_key,
      count(*)::int as copy_count,
      coalesce(sum(a.size_bytes), 0)::bigint as total_bytes,
      jsonb_agg(jsonb_build_object(
        'asset_id', a.id,
        'storage_path', a.storage_path,
        'conversation_stable_key', a.conversation_stable_key,
        'size_bytes', a.size_bytes,
        'created_at', a.created_at,
        'message_log_id', a.message_log_id,
        'heuristic', true
      ) order by a.created_at desc) as copies
    from public.whatsapp_media_assets a
    join public.whatsapp_message_log ml on ml.id = a.message_log_id
    where a.sha256 is null
      and a.mime_type = 'application/pdf'
      and a.storage_path ~* '\.pdf$'
      and ml.direction = 'outbound'
      and a.created_at < now() - make_interval(days => greatest(p_min_age_days, 0))
    group by a.size_bytes, regexp_replace(a.storage_path, '.*/', '')
    having count(*) >= 2
  )
  select coalesce(
    (
      select jsonb_agg(g) from (
        select
          coalesce(sha256, group_key) as group_id,
          case when sha256 is not null then 'sha256' else 'heuristic' end as detection_method,
          copy_count,
          total_bytes,
          copies,
          greatest(copy_count - 1, 0) as redundant_copies,
          greatest(total_bytes - coalesce((copies->0->>'size_bytes')::bigint, 0), 0) as bytes_reclaimable
        from (
          select sha256, null::text as group_key, copy_count, total_bytes, copies from sha_groups
          union all
          select null::text as sha256, group_key, copy_count, total_bytes, copies from heuristic_groups
        ) combined
      ) g
    ),
    '[]'::jsonb
  ) into v_groups;

  return coalesce(v_groups, '[]'::jsonb);
end;
$$;

-- ── get_storage_orphans ──────────────────────────────────────────────────────

create or replace function public.get_storage_orphans()
returns jsonb
language plpgsql
security definer
set search_path = public, storage, app_private
as $$
declare
  v_storage_without_db jsonb;
  v_db_without_storage jsonb;
begin
  if not app_private.is_crm_admin() then
    raise exception 'permission denied';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'storage_path', o.name,
    'size_bytes', app_private.storage_object_size(o.metadata),
    'created_at', o.created_at
  )), '[]'::jsonb)
  into v_storage_without_db
  from storage.objects o
  where o.bucket_id = 'whatsapp-media'
    and not exists (
      select 1 from public.whatsapp_media_assets a
      where a.storage_path = o.name and a.bucket_id = 'whatsapp-media'
    );

  select coalesce(jsonb_agg(jsonb_build_object(
    'asset_id', a.id,
    'storage_path', a.storage_path,
    'conversation_stable_key', a.conversation_stable_key,
    'size_bytes', a.size_bytes
  )), '[]'::jsonb)
  into v_db_without_storage
  from public.whatsapp_media_assets a
  where a.bucket_id = 'whatsapp-media'
    and not exists (
      select 1 from storage.objects o
      where o.bucket_id = 'whatsapp-media' and o.name = a.storage_path
    );

  return jsonb_build_object(
    'storage_without_db', v_storage_without_db,
    'db_without_storage', v_db_without_storage,
    'storage_orphan_count', jsonb_array_length(v_storage_without_db),
    'db_orphan_count', jsonb_array_length(v_db_without_storage)
  );
end;
$$;

-- ── backfill_media_metadata (size_bytes desde storage.objects) ───────────────

create or replace function public.backfill_media_metadata(p_dry_run boolean default true)
returns jsonb
language plpgsql
security definer
set search_path = public, storage, app_private
as $$
declare
  v_updated int := 0;
  v_candidates int := 0;
  v_row record;
begin
  if not app_private.is_crm_admin() then
    raise exception 'permission denied';
  end if;

  for v_row in
    select
      a.id,
      a.storage_path,
      app_private.storage_object_size(o.metadata) as object_size
    from public.whatsapp_media_assets a
    join storage.objects o
      on o.bucket_id = a.bucket_id
     and o.name = a.storage_path
    where a.size_bytes is null
       or a.size_bytes <> app_private.storage_object_size(o.metadata)
  loop
    v_candidates := v_candidates + 1;
    if not p_dry_run then
      update public.whatsapp_media_assets
      set size_bytes = v_row.object_size
      where id = v_row.id;
      update public.whatsapp_message_log ml
      set size_bytes = v_row.object_size
      from public.whatsapp_media_assets a2
      where a2.id = v_row.id
        and ml.id = a2.message_log_id
        and (ml.size_bytes is null or ml.size_bytes <> v_row.object_size);
      v_updated := v_updated + 1;
    end if;
  end loop;

  return jsonb_build_object(
    'dry_run', p_dry_run,
    'candidates', v_candidates,
    'updated', case when p_dry_run then 0 else v_updated end
  );
end;
$$;

-- ── get_storage_suggestions ──────────────────────────────────────────────────

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
  if not app_private.is_crm_admin() then
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
      'message', format('Uso al %.1f%% del plan Free (1 GB). Libera espacio urgentemente.', v_used_percent),
      'action', 'optimize_duplicate_pdfs'
    ));
  elsif v_used_percent >= coalesce((v_thresholds->>'warning_percent')::numeric, 80) then
    v_suggestions := v_suggestions || jsonb_build_array(jsonb_build_object(
      'id', 'storage_warning',
      'severity', 'warning',
      'title', 'Almacenamiento elevado',
      'message', format('Uso al %.1f%% del plan. Revisa el ranking completo de chats.', v_used_percent),
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
      'message', format('%.1f%% de assets sin size_bytes. Sincroniza metadata.', v_drift_percent),
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

-- ── Grants ───────────────────────────────────────────────────────────────────

grant execute on function public.get_storage_stats(text) to authenticated, service_role;
grant execute on function public.get_storage_overview() to authenticated, service_role;
grant execute on function public.get_conversation_storage_ranking(int, int, text) to authenticated, service_role;
grant execute on function public.get_duplicate_pdf_groups(int) to authenticated, service_role;
grant execute on function public.get_storage_orphans() to authenticated, service_role;
grant execute on function public.backfill_media_metadata(boolean) to authenticated, service_role;
grant execute on function public.get_storage_suggestions() to authenticated, service_role;
