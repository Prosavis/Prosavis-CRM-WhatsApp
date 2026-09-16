-- Snapshot y page sin puntuar las ~6755 filas del directorio.
-- Empieza por bookings del service + tags; el contrato JSON/RPC no cambia.
-- No modificar 20260916120000_metrics_historical_aggregates.sql.

create index if not exists bookings_directory_workspace_service_idx
  on public.bookings (service_id)
  where source_deleted_at is null;

create or replace function app_private.directory_workspace_booking_matches(p_service_id text)
returns table (
  directory_id uuid,
  appointment_id text,
  status text,
  scheduled_start timestamptz,
  updated_at timestamptz,
  payment_status text,
  pending_cop bigint,
  cancellation_reason text,
  cancellation_reason_other text
)
language sql
stable
security definer
set search_path = public, app_private
as $$
  with bookings_f as (
    select
      b.appointment_id,
      b.status,
      b.scheduled_start,
      b.updated_at,
      b.payment_status,
      b.pending_cop,
      b.cancellation_reason,
      b.cancellation_reason_other,
      app_private.metrics_phone_digits(b.client_phone) as phone_digits,
      nullif(btrim(coalesce(b.client_id, '')), '') as client_id_key,
      nullif(btrim(coalesce(b.client_app_user_id, '')), '') as app_user_key
    from public.bookings b
    where b.service_id = p_service_id
      and b.source_deleted_at is null
  )
  select
    matched.directory_id,
    matched.appointment_id,
    matched.status,
    matched.scheduled_start,
    matched.updated_at,
    matched.payment_status,
    matched.pending_cop,
    matched.cancellation_reason,
    matched.cancellation_reason_other
  from (
    select
      d.id as directory_id,
      b.appointment_id,
      b.status,
      b.scheduled_start,
      b.updated_at,
      b.payment_status,
      b.pending_cop::bigint,
      b.cancellation_reason,
      b.cancellation_reason_other
    from bookings_f b
    join public.crm_directory d
      on b.phone_digits is not null
     and d.phone_key = b.phone_digits
    union
    select
      d.id,
      b.appointment_id,
      b.status,
      b.scheduled_start,
      b.updated_at,
      b.payment_status,
      b.pending_cop::bigint,
      b.cancellation_reason,
      b.cancellation_reason_other
    from bookings_f b
    join public.crm_directory d
      on b.client_id_key is not null
     and d.id::text = b.client_id_key
    union
    select
      d.id,
      b.appointment_id,
      b.status,
      b.scheduled_start,
      b.updated_at,
      b.payment_status,
      b.pending_cop::bigint,
      b.cancellation_reason,
      b.cancellation_reason_other
    from bookings_f b
    join public.crm_directory d
      on b.app_user_key is not null
     and nullif(btrim(coalesce(d.app_user_id, '')), '') = b.app_user_key
    union
    select
      d.id,
      b.appointment_id,
      b.status,
      b.scheduled_start,
      b.updated_at,
      b.payment_status,
      b.pending_cop::bigint,
      b.cancellation_reason,
      b.cancellation_reason_other
    from bookings_f b
    join public.crm_directory d
      on b.phone_digits is not null
     and d.phone_key is null
     and app_private.metrics_phone_digits(d.phone) = b.phone_digits
  ) matched;
$$;

create or replace function app_private.directory_workspace_booking_stats(p_service_id text)
returns table (
  directory_id uuid,
  appointment_count bigint,
  last_appointment_at timestamptz,
  next_appointment_at timestamptz,
  last_completed_payment_status text,
  computed_debt bigint,
  cancellation_count bigint,
  latest_cancellation_appointment_id text,
  latest_cancellation_at timestamptz,
  latest_cancellation_status text,
  latest_cancellation_reason text,
  latest_cancellation_reason_other text
)
language sql
stable
security definer
set search_path = public, app_private
as $$
  select
    mb.directory_id,
    count(*)::bigint as appointment_count,
    max(mb.scheduled_start) as last_appointment_at,
    min(mb.scheduled_start) filter (
      where mb.status not in ('COMPLETED', 'CANCELED', 'REJECTED')
        and mb.scheduled_start >= now()
    ) as next_appointment_at,
    (
      array_agg(mb.payment_status order by mb.scheduled_start desc nulls last)
      filter (where mb.status = 'COMPLETED')
    )[1] as last_completed_payment_status,
    coalesce(sum(mb.pending_cop) filter (where mb.status = 'COMPLETED'), 0)::bigint as computed_debt,
    count(*) filter (where mb.status in ('CANCELED', 'REJECTED'))::bigint as cancellation_count,
    (
      array_agg(mb.appointment_id order by coalesce(mb.updated_at, mb.scheduled_start) desc nulls last)
      filter (where mb.status in ('CANCELED', 'REJECTED'))
    )[1] as latest_cancellation_appointment_id,
    max(coalesce(mb.updated_at, mb.scheduled_start)) filter (
      where mb.status in ('CANCELED', 'REJECTED')
    ) as latest_cancellation_at,
    (
      array_agg(mb.status order by coalesce(mb.updated_at, mb.scheduled_start) desc nulls last)
      filter (where mb.status in ('CANCELED', 'REJECTED'))
    )[1] as latest_cancellation_status,
    (
      array_agg(mb.cancellation_reason order by coalesce(mb.updated_at, mb.scheduled_start) desc nulls last)
      filter (where mb.status in ('CANCELED', 'REJECTED'))
    )[1] as latest_cancellation_reason,
    (
      array_agg(mb.cancellation_reason_other order by coalesce(mb.updated_at, mb.scheduled_start) desc nulls last)
      filter (where mb.status in ('CANCELED', 'REJECTED'))
    )[1] as latest_cancellation_reason_other
  from app_private.directory_workspace_booking_matches(p_service_id) mb
  group by mb.directory_id;
$$;

create or replace function app_private.directory_workspace_scored(p_service_id text)
returns table (
  directory_id uuid,
  full_name text,
  display_name text,
  email text,
  phone text,
  photo_url text,
  app_user_id text,
  is_app_user boolean,
  provider_id text,
  service_id text,
  classification text,
  quality_tag text,
  status text,
  source text,
  channels text[],
  tags text[],
  messages_count integer,
  unread_whatsapp_count integer,
  last_whatsapp_message_at timestamptz,
  last_contact_at timestamptz,
  created_at timestamptz,
  updated_at timestamptz,
  appointment_count bigint,
  last_appointment_at timestamptz,
  next_appointment_at timestamptz,
  last_completed_payment_status text,
  computed_debt bigint,
  cancellation_count bigint,
  latest_cancellation_appointment_id text,
  latest_cancellation_at timestamptz,
  latest_cancellation_status text,
  latest_cancellation_reason text,
  latest_cancellation_reason_other text,
  is_scheduled boolean,
  is_canceled boolean,
  is_recurring boolean,
  is_reactivation boolean,
  is_blacklisted boolean
)
language sql
stable
security definer
set search_path = public, app_private
as $$
  select
    d.id,
    d.full_name,
    d.display_name,
    d.email,
    d.phone,
    d.photo_url,
    d.app_user_id,
    d.is_app_user,
    d.provider_id,
    d.service_id,
    d.classification,
    d.quality_tag,
    d.status,
    d.source,
    d.channels,
    d.tags,
    d.messages_count,
    d.unread_whatsapp_count,
    d.last_whatsapp_message_at,
    d.last_contact_at,
    d.created_at,
    d.updated_at,
    coalesce(bs.appointment_count, 0),
    bs.last_appointment_at,
    bs.next_appointment_at,
    bs.last_completed_payment_status,
    coalesce(bs.computed_debt, 0),
    coalesce(bs.cancellation_count, 0),
    bs.latest_cancellation_appointment_id,
    bs.latest_cancellation_at,
    bs.latest_cancellation_status,
    bs.latest_cancellation_reason,
    bs.latest_cancellation_reason_other,
    (
      coalesce(bs.appointment_count, 0) > 0
      or app_private.metrics_has_any_token(
        d.classification,
        d.tags,
        array['agendado', 'agendada']
      )
    ),
    coalesce(bs.cancellation_count, 0) > 0,
    coalesce(bs.appointment_count, 0) > 0
      and app_private.metrics_has_any_token(
        d.classification,
        d.tags,
        array['cliente recurrente', 'recurrente']
      ),
    coalesce(bs.appointment_count, 0) > 0
      and not app_private.metrics_has_any_token(
        d.classification,
        d.tags,
        array['decline', 'bloqueado', '🚫']
      )
      and bs.last_appointment_at is not null
      and bs.last_appointment_at < (now() - interval '30 days'),
    app_private.metrics_has_any_token(
      d.classification,
      d.tags,
      array['decline', 'bloqueado', '🚫']
    )
  from public.crm_directory d
  left join app_private.directory_workspace_booking_stats(p_service_id) bs
    on bs.directory_id = d.id
  where lower(coalesce(d.status, 'active')) = 'active'
    and coalesce(d.opt_out, false) = false
    and not app_private.metrics_is_test_contact(d.classification, d.tags);
$$;

create or replace function public.directory_workspace_snapshot(p_service_id text)
returns jsonb
language sql
stable
security definer
set search_path = public, app_private
as $$
  with audience as materialized (
    select d.id, d.classification, d.tags
    from public.crm_directory d
    where lower(coalesce(d.status, 'active')) = 'active'
      and coalesce(d.opt_out, false) = false
      and not app_private.metrics_is_test_contact(d.classification, d.tags)
  ),
  stats as materialized (
    select s.*
    from app_private.directory_workspace_booking_stats(p_service_id) s
    join audience a on a.id = s.directory_id
  )
  select jsonb_build_object(
    'total', (select count(*)::bigint from audience),
    'scheduled', (
      select count(*)::bigint
      from (
        select s.directory_id
        from stats s
        union
        select a.id
        from audience a
        where app_private.metrics_has_any_token(
          a.classification,
          a.tags,
          array['agendado', 'agendada']
        )
      ) scheduled_ids
    ),
    'canceledOrRejected', (
      select count(*)::bigint
      from stats s
      where s.cancellation_count > 0
    ),
    'recurring', (
      select count(*)::bigint
      from stats s
      join audience a on a.id = s.directory_id
      where s.appointment_count > 0
        and app_private.metrics_has_any_token(
          a.classification,
          a.tags,
          array['cliente recurrente', 'recurrente']
        )
    ),
    'reactivation', (
      select count(*)::bigint
      from stats s
      join audience a on a.id = s.directory_id
      where s.appointment_count > 0
        and not app_private.metrics_has_any_token(
          a.classification,
          a.tags,
          array['decline', 'bloqueado', '🚫']
        )
        and s.last_appointment_at is not null
        and s.last_appointment_at < (now() - interval '30 days')
    )
  );
$$;

create or replace function public.directory_workspace_page(
  p_service_id text,
  p_view text default 'all',
  p_search text default null,
  p_segment text default null,
  p_limit integer default 50,
  p_offset integer default 0
)
returns table (
  id uuid,
  full_name text,
  display_name text,
  email text,
  phone text,
  photo_url text,
  app_user_id text,
  is_app_user boolean,
  provider_id text,
  service_id text,
  classification text,
  quality_tag text,
  status text,
  source text,
  channels text[],
  tags text[],
  messages_count integer,
  unread_whatsapp_count integer,
  last_whatsapp_message_at timestamptz,
  last_contact_at timestamptz,
  created_at timestamptz,
  updated_at timestamptz,
  appointment_count bigint,
  last_appointment_at timestamptz,
  next_appointment_at timestamptz,
  last_completed_payment_status text,
  computed_debt bigint,
  cancellation_count bigint,
  latest_cancellation_appointment_id text,
  latest_cancellation_at timestamptz,
  latest_cancellation_status text,
  latest_cancellation_reason text,
  latest_cancellation_reason_other text,
  is_scheduled boolean,
  is_canceled boolean,
  is_recurring boolean,
  is_reactivation boolean,
  is_blacklisted boolean,
  matched_count bigint
)
language sql
stable
security definer
set search_path = public, app_private
as $$
  with stats as materialized (
    select *
    from app_private.directory_workspace_booking_stats(p_service_id)
  ),
  audience as (
    select d.*
    from public.crm_directory d
    where lower(coalesce(d.status, 'active')) = 'active'
      and coalesce(d.opt_out, false) = false
      and not app_private.metrics_is_test_contact(d.classification, d.tags)
  ),
  candidate_ids as (
    select s.directory_id as id
    from stats s
    join audience a on a.id = s.directory_id
    where
      case lower(coalesce(p_view, 'all'))
        when 'scheduled' then true
        when 'canceled' then s.cancellation_count > 0
        else
          case lower(coalesce(nullif(btrim(p_segment), ''), ''))
            when 'recurring' then
              s.appointment_count > 0
              and app_private.metrics_has_any_token(
                a.classification,
                a.tags,
                array['cliente recurrente', 'recurrente']
              )
            when 'reactivation' then
              s.appointment_count > 0
              and not app_private.metrics_has_any_token(
                a.classification,
                a.tags,
                array['decline', 'bloqueado', '🚫']
              )
              and s.last_appointment_at is not null
              and s.last_appointment_at < (now() - interval '30 days')
            else false
          end
      end
    union
    select a.id
    from audience a
    where lower(coalesce(p_view, 'all')) = 'scheduled'
      and app_private.metrics_has_any_token(
        a.classification,
        a.tags,
        array['agendado', 'agendada']
      )
    union
    select a.id
    from audience a
    where lower(coalesce(p_view, 'all')) = 'all'
      and coalesce(nullif(btrim(p_segment), ''), '') = ''
  ),
  filtered as (
    select
      a.*,
      coalesce(s.appointment_count, 0) as appointment_count,
      s.last_appointment_at,
      s.next_appointment_at,
      s.last_completed_payment_status,
      coalesce(s.computed_debt, 0) as computed_debt,
      coalesce(s.cancellation_count, 0) as cancellation_count,
      s.latest_cancellation_appointment_id,
      s.latest_cancellation_at,
      s.latest_cancellation_status,
      s.latest_cancellation_reason,
      s.latest_cancellation_reason_other,
      (
        coalesce(s.appointment_count, 0) > 0
        or app_private.metrics_has_any_token(
          a.classification,
          a.tags,
          array['agendado', 'agendada']
        )
      ) as is_scheduled,
      coalesce(s.cancellation_count, 0) > 0 as is_canceled,
      coalesce(s.appointment_count, 0) > 0
        and app_private.metrics_has_any_token(
          a.classification,
          a.tags,
          array['cliente recurrente', 'recurrente']
        ) as is_recurring,
      coalesce(s.appointment_count, 0) > 0
        and not app_private.metrics_has_any_token(
          a.classification,
          a.tags,
          array['decline', 'bloqueado', '🚫']
        )
        and s.last_appointment_at is not null
        and s.last_appointment_at < (now() - interval '30 days') as is_reactivation,
      app_private.metrics_has_any_token(
        a.classification,
        a.tags,
        array['decline', 'bloqueado', '🚫']
      ) as is_blacklisted
    from candidate_ids c
    join audience a on a.id = c.id
    left join stats s on s.directory_id = a.id
    where
      nullif(btrim(p_search), '') is null
      or coalesce(a.display_name, '') ilike '%' || btrim(p_search) || '%'
      or coalesce(a.full_name, '') ilike '%' || btrim(p_search) || '%'
      or coalesce(a.email, '') ilike '%' || btrim(p_search) || '%'
      or coalesce(a.phone, '') ilike '%' || btrim(p_search) || '%'
      or coalesce(s.latest_cancellation_reason, '') ilike '%' || btrim(p_search) || '%'
      or coalesce(s.latest_cancellation_reason_other, '') ilike '%' || btrim(p_search) || '%'
  ),
  counted as (
    select f.*, count(*) over() as matched_count
    from filtered f
  )
  select
    c.id,
    c.full_name,
    c.display_name,
    c.email,
    c.phone,
    c.photo_url,
    c.app_user_id,
    c.is_app_user,
    c.provider_id,
    c.service_id,
    c.classification,
    c.quality_tag,
    c.status,
    c.source,
    c.channels,
    c.tags,
    c.messages_count,
    c.unread_whatsapp_count,
    c.last_whatsapp_message_at,
    c.last_contact_at,
    c.created_at,
    c.updated_at,
    c.appointment_count,
    c.last_appointment_at,
    c.next_appointment_at,
    c.last_completed_payment_status,
    c.computed_debt,
    c.cancellation_count,
    c.latest_cancellation_appointment_id,
    c.latest_cancellation_at,
    c.latest_cancellation_status,
    c.latest_cancellation_reason,
    c.latest_cancellation_reason_other,
    c.is_scheduled,
    c.is_canceled,
    c.is_recurring,
    c.is_reactivation,
    c.is_blacklisted,
    c.matched_count
  from counted c
  order by
    case
      when lower(coalesce(p_view, 'all')) = 'canceled' then c.latest_cancellation_at
    end desc nulls last,
    case
      when lower(coalesce(p_view, 'all')) = 'scheduled' then c.last_appointment_at
    end desc nulls last,
    coalesce(c.display_name, c.full_name, c.phone, '')
  limit greatest(1, least(coalesce(p_limit, 50), 100))
  offset greatest(0, coalesce(p_offset, 0));
$$;

do $$
declare
  fn record;
begin
  for fn in
    select p.oid::regprocedure as sig
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where (n.nspname = 'public' and p.proname in (
        'directory_workspace_snapshot',
        'directory_workspace_page',
        'directory_workspace_cancellations',
        'directory_workspace_cancellations_ordered'
      ))
      or (n.nspname = 'app_private' and p.proname in (
        'directory_workspace_scored',
        'directory_workspace_booking_matches',
        'directory_workspace_booking_stats'
      ))
  loop
    execute format('revoke all on function %s from public, anon, authenticated', fn.sig);
    execute format('grant execute on function %s to service_role', fn.sig);
  end loop;
end
$$;
