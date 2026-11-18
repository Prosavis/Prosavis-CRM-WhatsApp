-- T3. Motivo de pérdida de un chat de venta. No envía mensajes.

alter table public.whatsapp_conversations
  add column if not exists loss_reason text,
  add column if not exists loss_reason_note text,
  add column if not exists loss_reason_at timestamptz,
  add column if not exists loss_reason_by text,
  add column if not exists loss_reason_source text;

alter table public.whatsapp_conversations
  drop constraint if exists whatsapp_conversations_loss_reason_check;

alter table public.whatsapp_conversations
  add constraint whatsapp_conversations_loss_reason_check
  check (
    loss_reason is null
    or loss_reason in (
      'precio',
      'sin_cupo',
      'fuera_de_cobertura',
      'dejo_de_responder',
      'buscaba_empleo',
      'no_se_ofrece',
      'cerro_por_fuera',
      'solo_informandose',
      'otro'
    )
  );

alter table public.whatsapp_conversations
  drop constraint if exists whatsapp_conversations_loss_reason_source_check;

alter table public.whatsapp_conversations
  add constraint whatsapp_conversations_loss_reason_source_check
  check (
    loss_reason_source is null
    or loss_reason_source in ('persona', 'sofia_propuesta')
  );

comment on column public.whatsapp_conversations.loss_reason is
  'Por qué se perdió el chat de venta. sofia_propuesta queda reservado.';

create table if not exists public.whatsapp_loss_reason_events (
  id bigint generated always as identity primary key,
  stable_key text not null,
  loss_reason text,
  loss_reason_note text,
  loss_reason_source text,
  loss_reason_by text,
  recorded_at timestamptz not null default now()
);

alter table public.whatsapp_loss_reason_events enable row level security;

revoke all on table public.whatsapp_loss_reason_events from public, anon, authenticated;
grant select, insert on table public.whatsapp_loss_reason_events to service_role;

drop policy if exists whatsapp_loss_reason_events_no_client
  on public.whatsapp_loss_reason_events;
create policy whatsapp_loss_reason_events_no_client
  on public.whatsapp_loss_reason_events
  for select
  to service_role
  using (true);

create or replace function app_private.log_whatsapp_loss_reason()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.loss_reason is not distinct from old.loss_reason
     and new.loss_reason_note is not distinct from old.loss_reason_note
     and new.loss_reason_source is not distinct from old.loss_reason_source then
    return new;
  end if;
  insert into public.whatsapp_loss_reason_events (
    stable_key,
    loss_reason,
    loss_reason_note,
    loss_reason_source,
    loss_reason_by,
    recorded_at
  ) values (
    new.stable_key,
    new.loss_reason,
    new.loss_reason_note,
    new.loss_reason_source,
    new.loss_reason_by,
    coalesce(new.loss_reason_at, now())
  );
  return new;
end;
$$;

drop trigger if exists whatsapp_conversations_loss_reason
  on public.whatsapp_conversations;
create trigger whatsapp_conversations_loss_reason
  after update of loss_reason, loss_reason_note, loss_reason_source
  on public.whatsapp_conversations
  for each row
  execute function app_private.log_whatsapp_loss_reason();

create or replace function public.metrics_loss_reasons(
  p_from date,
  p_to date
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  result jsonb;
begin
  if p_from is null or p_to is null or p_to < p_from or p_to > p_from + 400 then
    raise exception 'rango invalido';
  end if;

  with grouped as (
    select
      to_char(date_trunc('week', loss_reason_at at time zone 'America/Bogota'), 'YYYY-MM-DD') as semana,
      coalesce(nullif(btrim(ctwa_source_id), ''), 'sin_anuncio') as anuncio,
      loss_reason,
      count(*)::integer as chats
    from public.whatsapp_conversations
    where loss_reason is not null
      and loss_reason_at is not null
      and (loss_reason_at at time zone 'America/Bogota')::date between p_from and p_to
    group by 1, 2, 3
  )
  select jsonb_build_object(
    'desde', p_from,
    'hasta', p_to,
    'filas', coalesce(jsonb_agg(jsonb_build_object(
      'semana', semana,
      'anuncio', anuncio,
      'motivo', loss_reason,
      'chats', chats
    ) order by semana, anuncio, loss_reason), '[]'::jsonb)
  )
  into result
  from grouped;

  return coalesce(result, jsonb_build_object(
    'desde', p_from,
    'hasta', p_to,
    'filas', '[]'::jsonb
  ));
end;
$$;

revoke all on function public.metrics_loss_reasons(date, date)
  from public, anon, authenticated;
grant execute on function public.metrics_loss_reasons(date, date)
  to service_role;
