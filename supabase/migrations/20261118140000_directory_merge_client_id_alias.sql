-- Al fusionar fichas, el UUID borrado sigue en appointments.clientId.
-- Guardamos old_id → clientId canónico para reescribir Firestore después.

create table if not exists public.crm_directory_client_id_alias (
  old_id text primary key,
  canonical_client_id text not null,
  app_user_id text,
  created_at timestamptz not null default now(),
  applied_at timestamptz
);

alter table public.crm_directory_client_id_alias enable row level security;

revoke all on public.crm_directory_client_id_alias from public, anon, authenticated;
grant select, update on public.crm_directory_client_id_alias to service_role;

create or replace function public.merge_directory_entries(p_primary uuid, p_duplicate uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_dup crm_directory%rowtype;
  v_app_user text;
  v_canonical text;
begin
  if p_primary = p_duplicate then
    raise exception 'No se puede fusionar una entrada consigo misma';
  end if;

  select * into v_dup from crm_directory where id = p_duplicate;
  if not found then
    raise exception 'Entrada duplicada no encontrada: %', p_duplicate;
  end if;

  if not exists (select 1 from crm_directory where id = p_primary) then
    raise exception 'Entrada primaria no encontrada: %', p_primary;
  end if;

  update crm_directory
  set phone = null, email = null, updated_at = now()
  where id = p_duplicate;

  update crm_directory k set
    full_name = coalesce(nullif(trim(k.full_name), ''), v_dup.full_name),
    display_name = coalesce(k.display_name, v_dup.display_name),
    email = coalesce(k.email, v_dup.email),
    phone = case
      when k.phone like '+%' then k.phone
      when v_dup.phone like '+%' then v_dup.phone
      else coalesce(k.phone, v_dup.phone)
    end,
    photo_url = coalesce(k.photo_url, v_dup.photo_url),
    address = coalesce(k.address, v_dup.address),
    notes = coalesce(k.notes, v_dup.notes),
    app_user_id = coalesce(k.app_user_id, v_dup.app_user_id),
    is_app_user = (coalesce(k.is_app_user, false) or coalesce(v_dup.is_app_user, false)),
    provider_id = coalesce(k.provider_id, v_dup.provider_id),
    service_id = coalesce(k.service_id, v_dup.service_id),
    whatsapp_conversation_id = coalesce(k.whatsapp_conversation_id, v_dup.whatsapp_conversation_id),
    whatsapp_assigned_to = coalesce(k.whatsapp_assigned_to, v_dup.whatsapp_assigned_to),
    last_whatsapp_message_at = greatest(
      coalesce(k.last_whatsapp_message_at, '1970-01-01'::timestamptz),
      coalesce(v_dup.last_whatsapp_message_at, '1970-01-01'::timestamptz)
    ),
    last_whatsapp_message_text = coalesce(k.last_whatsapp_message_text, v_dup.last_whatsapp_message_text),
    last_whatsapp_intent = coalesce(k.last_whatsapp_intent, v_dup.last_whatsapp_intent),
    unread_whatsapp_count = coalesce(k.unread_whatsapp_count, 0) + coalesce(v_dup.unread_whatsapp_count, 0),
    messages_count = coalesce(k.messages_count, 0) + coalesce(v_dup.messages_count, 0),
    source = case
      when k.source is null or k.source = '' then v_dup.source
      when v_dup.source is null or v_dup.source = '' then k.source
      when position(v_dup.source in k.source) = 0 then k.source || ', ' || v_dup.source
      else k.source
    end,
    channels = array(select distinct unnest(coalesce(k.channels, '{}'::text[]) || coalesce(v_dup.channels, '{}'::text[]))),
    tags = array(select distinct unnest(coalesce(k.tags, '{}'::text[]) || coalesce(v_dup.tags, '{}'::text[]))),
    metadata = coalesce(k.metadata, '{}'::jsonb) || coalesce(v_dup.metadata, '{}'::jsonb),
    updated_at = now()
  where k.id = p_primary;

  select nullif(btrim(app_user_id), '') into v_app_user
  from crm_directory
  where id = p_primary;

  v_canonical := coalesce(v_app_user, p_primary::text);

  insert into public.crm_directory_client_id_alias (
    old_id, canonical_client_id, app_user_id, applied_at
  ) values (
    p_duplicate::text, v_canonical, v_app_user, null
  )
  on conflict (old_id) do update set
    canonical_client_id = excluded.canonical_client_id,
    app_user_id = excluded.app_user_id,
    applied_at = null,
    created_at = now();

  delete from crm_directory where id = p_duplicate;

  perform detect_directory_issues_for_entry(p_primary);

  return p_primary;
end;
$$;
