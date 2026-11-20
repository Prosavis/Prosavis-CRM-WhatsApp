-- Panel «Sofía ahora». Devuelve nombre y texto, no el teléfono.
-- La clave del chat solo sirve para abrirlo. Vaciar la cola exige el modo apagado.

create or replace function public.sofia_monitor()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  allowed boolean;
begin
  select app_private.is_crm_admin() into allowed;
  if allowed is not true then
    raise exception 'sin permiso para ver a Sofía' using errcode = '42501';
  end if;

  return jsonb_build_object(
    'modo', (select mode from public.sofia_settings where id = 1),
    'cola', coalesce((
      select jsonb_agg(jsonb_build_object(
        'nombre', public.sofia_monitor_name(conversation.contact_name, conversation.whatsapp_profile_name),
        'hace_minutos', floor(extract(epoch from (now() - draft.created_at)) / 60)::int,
        'linea', left(regexp_replace(draft.suggestion, '\d{8,}', '[numero]', 'g'), 140),
        'veredicto', review.verdict,
        'chat', draft.stable_key
      ) order by draft.created_at desc)
      from public.sofia_pending_drafts as draft
      left join public.whatsapp_conversations as conversation
        on conversation.stable_key = draft.stable_key
      left join lateral (
        select item.verdict
        from public.sofia_draft_reviews as item
        where item.stable_key = draft.stable_key
          and item.created_at >= draft.created_at - interval '1 second'
        order by item.created_at desc
        limit 1
      ) as review on true
    ), '[]'::jsonb),
    'puentes', coalesce((
      select jsonb_agg(jsonb_build_object(
        'nombre', public.sofia_monitor_name(conversation.contact_name, conversation.whatsapp_profile_name),
        'enviado', bridge.sent_at,
        'chat', bridge.stable_key
      ) order by bridge.sent_at desc)
      from public.sofia_bridge_log as bridge
      left join public.whatsapp_conversations as conversation
        on conversation.stable_key = bridge.stable_key
      where bridge.window_date = (timezone('America/Bogota', now()))::date
    ), '[]'::jsonb)
  );
end;
$$;

create or replace function public.sofia_monitor_name(contact_name text, profile_name text)
returns text
language sql
immutable
as $$
  select case
    when btrim(coalesce(contact_name, '')) ~ '^[[:digit:][:space:]+().-]{8,}$' then 'Sin nombre'
    when btrim(coalesce(contact_name, '')) <> '' then btrim(contact_name)
    when btrim(coalesce(profile_name, '')) ~ '^[[:digit:][:space:]+().-]{8,}$' then 'Sin nombre'
    when btrim(coalesce(profile_name, '')) <> '' then btrim(profile_name)
    else 'Sin nombre'
  end;
$$;

create or replace function public.sofia_vaciar_cola()
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  caller_email text;
  removed integer;
begin
  select email into caller_email
  from public.admin_profiles
  where id = auth.uid() and is_active = true;

  if caller_email is null or caller_email not in (
    'admin@prosavis.com',
    'support@prosavis.com',
    'francyoliverab@gmail.com'
  ) then
    raise exception 'sin permiso para vaciar la cola' using errcode = '42501';
  end if;

  if (select mode from public.sofia_settings where id = 1) is distinct from 'apagada' then
    raise exception 'Sofía está encendida' using errcode = '22023';
  end if;

  delete from public.sofia_pending_drafts where stable_key is not null;
  get diagnostics removed = row_count;
  return removed;
end;
$$;

revoke all on function public.sofia_monitor() from public, anon;
revoke all on function public.sofia_monitor_name(text, text) from public, anon;
revoke all on function public.sofia_vaciar_cola() from public, anon;
grant execute on function public.sofia_monitor() to authenticated, service_role;
grant execute on function public.sofia_monitor_name(text, text) to authenticated, service_role;
grant execute on function public.sofia_vaciar_cola() to authenticated, service_role;

delete from public.sofia_pending_drafts
where stable_key is not null
  and (select mode from public.sofia_settings where id = 1) = 'apagada';
