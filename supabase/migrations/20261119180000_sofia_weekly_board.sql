-- Tablero semanal de Sofía, por cohorte. Solo agregados: no devuelve teléfonos.

create or replace function public.metrics_sofia_weekly(p_from date, p_to date)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  result jsonb;
begin
  if p_from is null or p_to is null or p_to < p_from or p_to - p_from > 84 then
    raise exception 'rango inválido' using errcode = '22023';
  end if;

  with conv as (
    select
      stable_key,
      coalesce(sofia_cohort, 'sin_cohorte') as cohorte,
      right(regexp_replace(coalesce(phone, ''), '\D', '', 'g'), 10) as phone_key,
      ctwa_source_id,
      intake_intent_label,
      review_intent_mark,
      (created_at at time zone 'America/Bogota')::date as created_day,
      (updated_at at time zone 'America/Bogota')::date as updated_day
    from public.whatsapp_conversations
    where phone_number_id = '1035566289641219'
  ),
  chats as (
    select
      date_trunc('week', created_day)::date as semana,
      cohorte,
      count(*) filter (
        where nullif(btrim(coalesce(ctwa_source_id, '')), '') is not null
      )::int as chats_anuncio,
      count(*) filter (
        where intake_intent_label in ('hogar', 'empresas')
      )::int as calificados
    from conv
    where created_day between p_from and p_to
    group by 1, 2
  ),
  quejas as (
    select
      date_trunc('week', updated_day)::date as semana,
      cohorte,
      count(*)::int as quejas
    from conv
    where review_intent_mark = 'queja'
      and updated_day between p_from and p_to
    group by 1, 2
  ),
  respuesta as (
    select
      date_trunc('week', (e.started_at at time zone 'America/Bogota'))::date as semana,
      c.cohorte,
      case
        when e.started_hour between 8 and 11 then 'manana'
        when e.started_hour between 12 and 17 then 'tarde'
        else 'noche'
      end as franja,
      round(percentile_cont(0.5) within group (
        order by extract(epoch from (e.first_real_at - e.started_at)) / 60.0
      )::numeric, 1) as mediana_min
    from public.whatsapp_response_episodes e
    join conv c on c.stable_key = e.stable_key
    where e.line = '312'
      and e.first_real_at is not null
      and (e.started_at at time zone 'America/Bogota')::date between p_from and p_to
    group by 1, 2, 3
  ),
  citas as (
    select
      date_trunc('week', (b.created_at at time zone 'America/Bogota'))::date as semana,
      c.cohorte,
      count(distinct b.id)::int as citas,
      count(distinct b.id) filter (where b.payment_status = 'PAGO_ACEPTADO')::int as pagos
    from public.bookings b
    join conv c
      on c.phone_key = right(regexp_replace(coalesce(b.client_phone, ''), '\D', '', 'g'), 10)
     and c.phone_key <> ''
    where (b.created_at at time zone 'America/Bogota')::date between p_from and p_to
    group by 1, 2
  ),
  cancelaciones as (
    select
      date_trunc('week', (ev.created_at at time zone 'America/Bogota'))::date as semana,
      c.cohorte,
      count(*)::int as cancelaciones
    from public.booking_events ev
    join public.bookings b
      on b.id = ev.booking_id and b.service_id = ev.service_id
    join conv c
      on c.phone_key = right(regexp_replace(coalesce(b.client_phone, ''), '\D', '', 'g'), 10)
     and c.phone_key <> ''
    where ev.event in ('cancelado_cliente', 'cancelado_operaria')
      and (ev.created_at at time zone 'America/Bogota')::date between p_from and p_to
    group by 1, 2
  ),
  borradores as (
    select
      date_trunc('week', (l.created_at at time zone 'America/Bogota'))::date as semana,
      c.cohorte,
      count(*)::int as borradores,
      count(*) filter (
        where l.action_taken = 'send_text' and coalesce(l.edit_ratio, 1) = 0
      )::int as sin_editar
    from public.whatsapp_ai_suggestion_log l
    join conv c on c.stable_key = l.stable_key
    where (l.created_at at time zone 'America/Bogota')::date between p_from and p_to
    group by 1, 2
  ),
  motivos as (
    select
      date_trunc('week', (l.created_at at time zone 'America/Bogota'))::date as semana,
      c.cohorte,
      coalesce(l.discard_reason, 'sin_motivo') as motivo,
      count(*)::int as n
    from public.whatsapp_ai_suggestion_log l
    join conv c on c.stable_key = l.stable_key
    where l.discard_reason is not null
      and (l.created_at at time zone 'America/Bogota')::date between p_from and p_to
    group by 1, 2, 3
  ),
  claves as (
    select semana, cohorte from chats
    union
    select semana, cohorte from quejas
    union
    select semana, cohorte from respuesta
    union
    select semana, cohorte from citas
    union
    select semana, cohorte from cancelaciones
    union
    select semana, cohorte from borradores
  )
  select coalesce(jsonb_agg(to_jsonb(fila) order by fila.semana, fila.cohorte), '[]'::jsonb)
  into result
  from (
    select
      k.semana,
      k.cohorte,
      coalesce(ch.chats_anuncio, 0) as chats_anuncio,
      coalesce(ch.calificados, 0) as calificados,
      coalesce(q.quejas, 0) as quejas,
      coalesce(ci.citas, 0) as citas,
      coalesce(ci.pagos, 0) as pagos,
      coalesce(ca.cancelaciones, 0) as cancelaciones,
      coalesce(b.borradores, 0) as borradores,
      coalesce(b.sin_editar, 0) as enviados_sin_editar,
      (
        select coalesce(jsonb_object_agg(r.franja, r.mediana_min), '{}'::jsonb)
        from respuesta r
        where r.semana = k.semana and r.cohorte = k.cohorte
      ) as mediana_real_min,
      (
        select coalesce(jsonb_object_agg(m.motivo, m.n), '{}'::jsonb)
        from motivos m
        where m.semana = k.semana and m.cohorte = k.cohorte
      ) as motivos
    from claves k
    left join chats ch on ch.semana = k.semana and ch.cohorte = k.cohorte
    left join quejas q on q.semana = k.semana and q.cohorte = k.cohorte
    left join citas ci on ci.semana = k.semana and ci.cohorte = k.cohorte
    left join cancelaciones ca on ca.semana = k.semana and ca.cohorte = k.cohorte
    left join borradores b on b.semana = k.semana and b.cohorte = k.cohorte
  ) fila;

  return jsonb_build_object('desde', p_from, 'hasta', p_to, 'filas', result);
end;
$$;

revoke all on function public.metrics_sofia_weekly(date, date) from public, anon, authenticated;
grant execute on function public.metrics_sofia_weekly(date, date) to service_role;
