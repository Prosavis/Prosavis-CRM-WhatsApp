-- Contact-days compactos (jsonb) para armar ventanas en Deno.
-- jsonb evita el tope de 1000 filas de PostgREST en RETURNS TABLE.
-- Sustituye metrics_outbound_window_totals en el bootstrap.

drop function if exists public.metrics_outbound_contact_days(text);
drop function if exists public.metrics_inbound_contact_days(text);

create function public.metrics_outbound_contact_days(
  p_phone_number_id text default null
)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    jsonb_agg(jsonb_build_object(
      'bucket_day', s.bucket_day,
      'stable_key', s.stable_key
    ) order by s.bucket_day),
    '[]'::jsonb
  )
  from (
    select
      (created_at at time zone 'America/Bogota')::date as bucket_day,
      conversation_stable_key as stable_key
    from public.whatsapp_message_log
    where hidden_from_panel = false
      and direction = 'outbound'
      and status in ('sent', 'delivered', 'read')
      and conversation_stable_key is not null
      and (p_phone_number_id is null or phone_number_id = p_phone_number_id)
    group by 1, 2
  ) s;
$$;

create function public.metrics_inbound_contact_days(
  p_phone_number_id text default null
)
returns jsonb
language sql
stable
security definer
set search_path = public, app_private
as $$
  select coalesce(
    jsonb_agg(jsonb_build_object(
      'bucket_day', s.bucket_day,
      'stable_key', s.stable_key,
      'first_contact_day', s.first_contact_day,
      'messages', s.messages
    ) order by s.bucket_day),
    '[]'::jsonb
  )
  from (
    select
      (l.created_at at time zone 'America/Bogota')::date as bucket_day,
      l.conversation_stable_key as stable_key,
      (
        coalesce(d.first_contact_at, d.created_at) at time zone 'America/Bogota'
      )::date as first_contact_day,
      count(*)::bigint as messages
    from public.whatsapp_message_log l
    left join public.crm_directory d
      on d.phone_key = l.conversation_stable_key
      or d.phone_key = app_private.metrics_phone_digits(l.conversation_stable_key)
    where l.hidden_from_panel = false
      and l.direction = 'inbound'
      and (p_phone_number_id is null or l.phone_number_id = p_phone_number_id)
      and not app_private.metrics_is_test_contact(d.classification, d.tags)
    group by 1, 2, 3
  ) s;
$$;

revoke all on function public.metrics_outbound_contact_days(text) from public, anon, authenticated;
revoke all on function public.metrics_inbound_contact_days(text) from public, anon, authenticated;
grant execute on function public.metrics_outbound_contact_days(text) to service_role;
grant execute on function public.metrics_inbound_contact_days(text) to service_role;
