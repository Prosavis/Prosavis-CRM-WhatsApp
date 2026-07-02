-- Reconciliación de índice whatsapp_media_assets + lookup runtime por media_id

-- ── find_storage_path_by_media_id (runtime Edge / inbox) ─────────────────────

create or replace function public.find_storage_path_by_media_id(p_media_id text)
returns jsonb
language plpgsql
security definer
set search_path = public, storage, app_private
as $$
declare
  v_row record;
begin
  if coalesce(trim(p_media_id), '') = '' then
    return null;
  end if;

  select
    o.name as storage_path,
    app_private.storage_object_size(o.metadata) as size_bytes,
    app_private.storage_object_mimetype(o.metadata, o.name) as mime_type
  into v_row
  from storage.objects o
  where o.bucket_id = 'whatsapp-media'
    and o.name like '%/' || p_media_id || '.%'
  order by o.created_at desc
  limit 1;

  if not found then
    select
      o.name as storage_path,
      app_private.storage_object_size(o.metadata) as size_bytes,
      app_private.storage_object_mimetype(o.metadata, o.name) as mime_type
    into v_row
    from storage.objects o
    where o.bucket_id = 'whatsapp-media'
      and o.name like '%' || p_media_id || '%'
    order by o.created_at desc
    limit 1;
  end if;

  if not found then
    return null;
  end if;

  return jsonb_build_object(
    'storage_path', v_row.storage_path,
    'size_bytes', v_row.size_bytes,
    'mime_type', v_row.mime_type
  );
end;
$$;

grant execute on function public.find_storage_path_by_media_id(text) to authenticated, service_role;

-- ── reconcile_storage_index ───────────────────────────────────────────────────

create or replace function public.reconcile_storage_index(
  p_dry_run boolean default true,
  p_batch_limit int default 200
)
returns jsonb
language plpgsql
security definer
set search_path = public, storage, app_private
as $$
declare
  v_batch_limit int := greatest(coalesce(p_batch_limit, 200), 1);
  v_inserted_assets int := 0;
  v_updated_logs int := 0;
  v_remaining_orphans int := 0;
  v_row record;
  v_mime text;
  v_size bigint;
  v_row_count int;
begin
  if not app_private.can_access_storage_monitor() then
    raise exception 'permission denied';
  end if;

  -- Paso A: message_log con storage_path + objeto en Storage sin asset
  for v_row in
    select
      ml.id as message_log_id,
      ml.conversation_stable_key,
      ml.storage_path,
      ml.media_id,
      coalesce(
        nullif(trim(ml.mime_type), ''),
        app_private.storage_object_mimetype(o.metadata, o.name)
      ) as mime_type,
      app_private.storage_object_size(o.metadata) as size_bytes
    from public.whatsapp_message_log ml
    join storage.objects o
      on o.bucket_id = 'whatsapp-media'
     and o.name = ml.storage_path
    where ml.storage_path is not null
      and not exists (
        select 1
        from public.whatsapp_media_assets a
        where a.bucket_id = 'whatsapp-media'
          and a.storage_path = ml.storage_path
      )
    order by ml.created_at desc
    limit v_batch_limit
  loop
    if not p_dry_run then
      insert into public.whatsapp_media_assets (
        message_log_id,
        conversation_stable_key,
        bucket_id,
        storage_path,
        media_id,
        mime_type,
        size_bytes
      )
      values (
        v_row.message_log_id,
        v_row.conversation_stable_key,
        'whatsapp-media',
        v_row.storage_path,
        v_row.media_id,
        v_row.mime_type,
        v_row.size_bytes
      );
      v_inserted_assets := v_inserted_assets + 1;
    else
      v_inserted_assets := v_inserted_assets + 1;
    end if;
  end loop;

  -- Paso B: message_log con media_id sin storage_path, match por patrón en Storage
  if v_inserted_assets < v_batch_limit then
    for v_row in
      select
        ml.id as message_log_id,
        ml.conversation_stable_key,
        ml.media_id,
        coalesce(nullif(trim(ml.mime_type), ''), '') as log_mime_type,
        o.name as storage_path,
        app_private.storage_object_size(o.metadata) as size_bytes,
        app_private.storage_object_mimetype(o.metadata, o.name) as object_mime_type
      from public.whatsapp_message_log ml
      cross join lateral (
        select o2.name, o2.metadata
        from storage.objects o2
        where o2.bucket_id = 'whatsapp-media'
          and (
            o2.name like '%/' || ml.media_id || '.%'
            or o2.name like '%' || ml.media_id || '%'
          )
        order by
          case when o2.name like '%/' || ml.media_id || '.%' then 0 else 1 end,
          o2.created_at desc
        limit 1
      ) o
      where ml.media_id is not null
        and ml.storage_path is null
        and not exists (
          select 1
          from public.whatsapp_media_assets a
          where a.media_id = ml.media_id
        )
        and not exists (
          select 1
          from public.whatsapp_media_assets a
          where a.bucket_id = 'whatsapp-media'
            and a.storage_path = o.name
        )
      order by ml.created_at desc
      limit greatest(v_batch_limit - v_inserted_assets, 0)
    loop
      v_mime := coalesce(nullif(v_row.log_mime_type, ''), v_row.object_mime_type);
      v_size := v_row.size_bytes;

      if not p_dry_run then
        update public.whatsapp_message_log
        set
          storage_path = v_row.storage_path,
          mime_type = coalesce(nullif(trim(mime_type), ''), v_mime),
          size_bytes = coalesce(size_bytes, v_size)
        where id = v_row.message_log_id
          and storage_path is null;

        get diagnostics v_row_count = row_count;
        v_updated_logs := v_updated_logs + v_row_count;

        insert into public.whatsapp_media_assets (
          message_log_id,
          conversation_stable_key,
          bucket_id,
          storage_path,
          media_id,
          mime_type,
          size_bytes
        )
        values (
          v_row.message_log_id,
          v_row.conversation_stable_key,
          'whatsapp-media',
          v_row.storage_path,
          v_row.media_id,
          v_mime,
          v_size
        );

        v_inserted_assets := v_inserted_assets + 1;
      else
        v_inserted_assets := v_inserted_assets + 1;
        v_updated_logs := v_updated_logs + 1;
      end if;
    end loop;
  end if;

  select count(*)::int
  into v_remaining_orphans
  from storage.objects o
  where o.bucket_id = 'whatsapp-media'
    and not exists (
      select 1
      from public.whatsapp_media_assets a
      where a.bucket_id = 'whatsapp-media'
        and a.storage_path = o.name
    );

  return jsonb_build_object(
    'dry_run', p_dry_run,
    'inserted_assets', v_inserted_assets,
    'updated_logs', v_updated_logs,
    'remaining_orphans', v_remaining_orphans,
    'batch_limit', v_batch_limit,
    'has_more', v_inserted_assets >= v_batch_limit
  );
end;
$$;

grant execute on function public.reconcile_storage_index(boolean, int) to authenticated, service_role;

-- ── backfill_media_metadata con batch_limit ───────────────────────────────────

drop function if exists public.backfill_media_metadata(boolean);

create or replace function public.backfill_media_metadata(
  p_dry_run boolean default true,
  p_batch_limit int default 500
)
returns jsonb
language plpgsql
security definer
set search_path = public, storage, app_private
as $$
declare
  v_batch_limit int := greatest(coalesce(p_batch_limit, 500), 1);
  v_updated int := 0;
  v_candidates int := 0;
  v_remaining int := 0;
  v_row record;
begin
  if not app_private.can_access_storage_monitor() then
    raise exception 'permission denied';
  end if;

  select count(*)::int
  into v_remaining
  from public.whatsapp_media_assets a
  join storage.objects o
    on o.bucket_id = a.bucket_id
   and o.name = a.storage_path
  where a.size_bytes is null
     or a.size_bytes <> app_private.storage_object_size(o.metadata);

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
    order by a.created_at asc
    limit v_batch_limit
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
    'updated', case when p_dry_run then 0 else v_updated end,
    'remaining_candidates', greatest(v_remaining - v_candidates, 0),
    'batch_limit', v_batch_limit,
    'has_more', greatest(v_remaining - v_candidates, 0) > 0
  );
end;
$$;

grant execute on function public.backfill_media_metadata(boolean, int) to authenticated, service_role;
