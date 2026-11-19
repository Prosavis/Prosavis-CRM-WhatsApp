-- Rúbrica medible del estudio. Cuenta los mensajes; no llama a un modelo y no envía nada.

create or replace function public.refresh_whatsapp_study_reviews()
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  written integer;
begin
  with stats as (
    select
      conversation_stable_key as stable_key,
      count(*) filter (where direction = 'inbound')::integer as inbound_count,
      count(*) filter (where direction = 'outbound')::integer as outbound_count,
      coalesce(round(avg(length(message_body)) filter (where direction = 'outbound')), 0)::integer as avg_chars,
      count(*) filter (where direction = 'outbound' and length(coalesce(message_body, '')) > 400)::integer as long_messages,
      count(*) filter (where direction = 'outbound' and message_body ~* '\yusted\y')::integer as usted,
      count(*) filter (where direction = 'outbound' and message_body ~* '\y(tú|tu)\y')::integer as tu,
      count(*) filter (where direction = 'outbound' and author_kind = 'persona')::integer as persona,
      count(*) filter (where direction = 'outbound' and author_kind = 'automatica')::integer as automatica,
      count(*) filter (where direction = 'outbound' and author_kind = 'hub')::integer as hub,
      count(*) filter (where direction = 'outbound' and author_kind = 'sugerencia_ia')::integer as sugerencia,
      mode() within group (order by template_name) filter (where template_name is not null) as template_name
    from public.whatsapp_message_log
    group by conversation_stable_key
  ),
  episodes as (
    select distinct on (stable_key)
      stable_key,
      round((extract(epoch from (first_auto_at - started_at)) / 60.0)::numeric, 1) as minutes_auto,
      round((extract(epoch from (first_real_at - started_at)) / 60.0)::numeric, 1) as minutes_real,
      started_hour,
      started_dow
    from public.whatsapp_response_episodes
    order by stable_key, started_at desc
  ),
  rows as (
    select
      stats.stable_key,
      app_private.study_phone(stats.stable_key) as phone,
      stats.inbound_count,
      jsonb_build_object(
        'entrantes', stats.inbound_count,
        'salientes', stats.outbound_count,
        'caracteres_promedio', stats.avg_chars,
        'mensajes_largos', stats.long_messages,
        'usted', stats.usted,
        'tu', stats.tu,
        'persona', stats.persona,
        'automatica', stats.automatica,
        'hub', stats.hub,
        'sugerencia_ia', stats.sugerencia,
        'plantilla', stats.template_name,
        'minutos_primera_automatica', episodes.minutes_auto,
        'minutos_primera_real', episodes.minutes_real,
        'hora_bogota', episodes.started_hour,
        'noche', episodes.started_hour is not null and (episodes.started_hour >= 19 or episodes.started_hour < 7),
        'fin_de_semana', episodes.started_dow in (0, 6)
      ) as rubric
    from stats
    left join episodes on episodes.stable_key = stats.stable_key
    where stats.inbound_count > 0
      and app_private.study_phone(stats.stable_key) is not null
  )
  insert into public.whatsapp_study_chat_reviews (
    stable_key, phone, model, rubric, version_estudio, updated_at
  )
  select stable_key, phone, 'reglas', rubric, '1', now()
  from rows
  on conflict (stable_key) do update set
    phone = excluded.phone,
    rubric = excluded.rubric,
    model = case
      when public.whatsapp_study_chat_reviews.model = 'sonnet' then public.whatsapp_study_chat_reviews.model
      else excluded.model
    end,
    updated_at = excluded.updated_at;

  get diagnostics written = row_count;
  return written;
end;
$$;

revoke all on function public.refresh_whatsapp_study_reviews() from public, anon, authenticated;
grant execute on function public.refresh_whatsapp_study_reviews() to service_role;
