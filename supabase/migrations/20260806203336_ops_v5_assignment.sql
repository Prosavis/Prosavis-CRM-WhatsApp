-- V5 Phase 1A: auditable assignment decisions, lost-request recovery,
-- local travel-time learning, and the cross-database assignment saga.

create table public.assignment_decisions (
  id uuid primary key default gen_random_uuid(),
  service_id text not null,
  request_id uuid not null,
  request_hash text not null,
  request_context jsonb not null default '{}'::jsonb,
  candidates jsonb not null default '[]'::jsonb,
  suggested_option_id text,
  chosen_option_id text,
  chosen_by text,
  override_reason text,
  override_notes text,
  supersedes_decision_id uuid,
  spec_version text not null,
  engine_weights jsonb not null,
  automation_level integer not null default 1,
  feature_vector_stamp jsonb not null default '{}'::jsonb,
  saga_status text not null default 'proposed',
  saga_attempt_count integer not null default 0,
  saga_error_code text,
  saga_started_at timestamptz,
  saga_committed_at timestamptz,
  applied_appointment_id text,
  outcome text,
  outcome_rating numeric(3, 2),
  outcome_recorded_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint assignment_decisions_service_request_key unique (
    service_id,
    request_id
  ),
  constraint assignment_decisions_service_id_id_key unique (service_id, id),
  constraint assignment_decisions_request_hash_check check (
    request_hash ~ '^[0-9a-f]{64}$'
  ),
  constraint assignment_decisions_supersedes_fkey foreign key (
    service_id,
    supersedes_decision_id
  ) references public.assignment_decisions (service_id, id),
  constraint assignment_decisions_candidates_array_check check (
    jsonb_typeof(candidates) = 'array'
  ),
  constraint assignment_decisions_request_context_object_check check (
    jsonb_typeof(request_context) = 'object'
  ),
  constraint assignment_decisions_engine_weights_object_check check (
    jsonb_typeof(engine_weights) = 'object'
  ),
  constraint assignment_decisions_feature_stamp_object_check check (
    jsonb_typeof(feature_vector_stamp) = 'object'
  ),
  constraint assignment_decisions_chosen_by_check check (
    chosen_by is null
    or chosen_by in ('francy', 'marian', 'auto', 'client_app')
  ),
  constraint assignment_decisions_automation_level_check check (
    automation_level between 0 and 3
  ),
  constraint assignment_decisions_saga_status_check check (
    saga_status in (
      'proposed',
      'committing',
      'committed',
      'failed',
      'superseded'
    )
  ),
  constraint assignment_decisions_saga_attempt_count_check check (
    saga_attempt_count >= 0
  ),
  constraint assignment_decisions_outcome_check check (
    outcome is null
    or outcome in (
      'completado',
      'cancelado_cliente',
      'cancelado_operaria',
      'no_pudo_ingresar',
      'queja',
      'reagendado_por_cliente',
      'pendiente'
    )
  ),
  constraint assignment_decisions_outcome_rating_check check (
    outcome_rating is null or outcome_rating between 1 and 5
  ),
  constraint assignment_decisions_not_self_superseding_check check (
    supersedes_decision_id is null or supersedes_decision_id <> id
  )
);

create table public.lost_requests (
  id uuid primary key default gen_random_uuid(),
  service_id text not null,
  request_id uuid not null,
  requested_tier text not null,
  requested_date date not null,
  window_start time not null,
  window_end time not null,
  comuna text,
  reason text not null,
  alternatives_offered jsonb not null default '[]'::jsonb,
  composite_offered boolean not null default false,
  composite_accepted boolean,
  recovered boolean not null default false,
  recovery_status text not null default 'unrecovered',
  recovered_booking_id uuid,
  recovered_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint lost_requests_service_request_key unique (service_id, request_id),
  constraint lost_requests_recovered_booking_fkey foreign key (
    service_id,
    recovered_booking_id
  ) references public.bookings (service_id, id),
  constraint lost_requests_window_check check (window_start < window_end),
  constraint lost_requests_reason_check check (
    reason in (
      'sin_capacidad',
      'fuera_de_zona',
      'cliente_no_acepto_alternativa',
      'precio',
      'no_respondio',
      'otro'
    )
  ),
  constraint lost_requests_alternatives_array_check check (
    jsonb_typeof(alternatives_offered) = 'array'
  ),
  constraint lost_requests_recovery_status_check check (
    recovery_status in ('unrecovered', 'recovered', 'superseded')
  ),
  constraint lost_requests_recovery_consistency_check check (
    (
      recovered
      and recovery_status = 'recovered'
      and recovered_booking_id is not null
      and recovered_at is not null
    )
    or (
      not recovered
      and recovery_status in ('unrecovered', 'superseded')
      and recovered_booking_id is null
      and recovered_at is null
    )
  )
);

create table public.comuna_travel_matrix (
  service_id text not null,
  origin_comuna text not null,
  destination_comuna text not null,
  hour_bucket integer not null,
  minutes_estimate numeric(8, 2) not null,
  sample_count integer not null default 0,
  last_observed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (
    service_id,
    origin_comuna,
    destination_comuna,
    hour_bucket
  ),
  constraint comuna_travel_matrix_origin_check check (
    nullif(btrim(origin_comuna), '') is not null
  ),
  constraint comuna_travel_matrix_destination_check check (
    nullif(btrim(destination_comuna), '') is not null
  ),
  constraint comuna_travel_matrix_hour_bucket_check check (
    hour_bucket between 0 and 23
  ),
  constraint comuna_travel_matrix_minutes_check check (minutes_estimate > 0),
  constraint comuna_travel_matrix_samples_check check (sample_count >= 0)
);

create or replace function public.enforce_assignment_saga_transition()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  if new.saga_status = old.saga_status then
    return new;
  end if;

  if not (
    (old.saga_status = 'proposed' and new.saga_status in (
      'committing',
      'failed',
      'superseded'
    ))
    or (old.saga_status = 'committing' and new.saga_status in (
      'committed',
      'failed',
      'superseded'
    ))
    or (old.saga_status = 'failed' and new.saga_status in (
      'committing',
      'superseded'
    ))
    or (old.saga_status = 'committed' and new.saga_status = 'superseded')
  ) then
    raise exception 'invalid assignment saga transition: % -> %',
      old.saga_status,
      new.saga_status
      using errcode = '23514';
  end if;

  return new;
end;
$$;

create or replace function public.recover_lost_request_from_booking()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_request_id uuid;
begin
  if new.assignment_decision_id is null
    or (
      tg_op = 'UPDATE'
      and new.assignment_decision_id is not distinct from old.assignment_decision_id
    )
  then
    return new;
  end if;

  select decision.request_id
  into v_request_id
  from public.assignment_decisions as decision
  where decision.service_id = new.service_id
    and decision.id::text = new.assignment_decision_id
  limit 1;

  if v_request_id is null then
    return new;
  end if;

  update public.lost_requests
  set
    recovered = true,
    recovery_status = 'recovered',
    recovered_booking_id = new.id,
    recovered_at = now(),
    updated_at = now()
  where service_id = new.service_id
    and request_id = v_request_id
    and recovery_status = 'unrecovered';

  return new;
end;
$$;

create or replace function public.record_comuna_travel_observation(
  p_service_id text,
  p_origin_comuna text,
  p_destination_comuna text,
  p_hour_bucket integer,
  p_observed_minutes numeric,
  p_alpha numeric
)
returns public.comuna_travel_matrix
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_row public.comuna_travel_matrix;
begin
  if nullif(btrim(p_service_id), '') is null
    or nullif(btrim(p_origin_comuna), '') is null
    or nullif(btrim(p_destination_comuna), '') is null
    or p_hour_bucket not between 0 and 23
    or p_observed_minutes <= 0
    or p_alpha <= 0
    or p_alpha > 1
  then
    raise exception 'invalid travel observation'
      using errcode = '22023';
  end if;

  insert into public.comuna_travel_matrix (
    service_id,
    origin_comuna,
    destination_comuna,
    hour_bucket,
    minutes_estimate,
    sample_count,
    last_observed_at
  ) values (
    btrim(p_service_id),
    btrim(p_origin_comuna),
    btrim(p_destination_comuna),
    p_hour_bucket,
    p_observed_minutes,
    1,
    now()
  )
  on conflict (
    service_id,
    origin_comuna,
    destination_comuna,
    hour_bucket
  ) do update
  set
    minutes_estimate = round(
      (
        excluded.minutes_estimate * p_alpha
        + public.comuna_travel_matrix.minutes_estimate * (1 - p_alpha)
      )::numeric,
      2
    ),
    sample_count = public.comuna_travel_matrix.sample_count + 1,
    last_observed_at = now(),
    updated_at = now()
  returning * into v_row;

  return v_row;
end;
$$;

create index assignment_decisions_service_created_idx
  on public.assignment_decisions (service_id, created_at desc);

create index assignment_decisions_service_saga_idx
  on public.assignment_decisions (service_id, saga_status, created_at)
  where saga_status in ('proposed', 'committing', 'failed');

create index assignment_decisions_supersedes_idx
  on public.assignment_decisions (service_id, supersedes_decision_id)
  where supersedes_decision_id is not null;

create index lost_requests_service_date_status_idx
  on public.lost_requests (
    service_id,
    requested_date,
    recovery_status,
    reason
  );

create index comuna_travel_matrix_lookup_idx
  on public.comuna_travel_matrix (
    service_id,
    origin_comuna,
    destination_comuna,
    hour_bucket,
    sample_count
  );

drop trigger if exists set_assignment_decisions_updated_at
  on public.assignment_decisions;
create trigger set_assignment_decisions_updated_at
before update on public.assignment_decisions
for each row execute function public.set_updated_at();

drop trigger if exists enforce_assignment_saga_transition
  on public.assignment_decisions;
create trigger enforce_assignment_saga_transition
before update of saga_status on public.assignment_decisions
for each row execute function public.enforce_assignment_saga_transition();

drop trigger if exists set_lost_requests_updated_at on public.lost_requests;
create trigger set_lost_requests_updated_at
before update on public.lost_requests
for each row execute function public.set_updated_at();

drop trigger if exists set_comuna_travel_matrix_updated_at
  on public.comuna_travel_matrix;
create trigger set_comuna_travel_matrix_updated_at
before update on public.comuna_travel_matrix
for each row execute function public.set_updated_at();

drop trigger if exists recover_lost_request_from_booking_insert
  on public.bookings;
create trigger recover_lost_request_from_booking_insert
after insert on public.bookings
for each row execute function public.recover_lost_request_from_booking();

drop trigger if exists recover_lost_request_from_booking_update
  on public.bookings;
create trigger recover_lost_request_from_booking_update
after update of assignment_decision_id on public.bookings
for each row execute function public.recover_lost_request_from_booking();

alter table public.assignment_decisions enable row level security;
alter table public.lost_requests enable row level security;
alter table public.comuna_travel_matrix enable row level security;

create policy "CRM admins manage assignment decisions"
on public.assignment_decisions for all to authenticated
using ((select app_private.is_crm_admin()))
with check ((select app_private.is_crm_admin()));

create policy "CRM admins manage lost requests"
on public.lost_requests for all to authenticated
using ((select app_private.is_crm_admin()))
with check ((select app_private.is_crm_admin()));

create policy "CRM admins manage travel matrix"
on public.comuna_travel_matrix for all to authenticated
using ((select app_private.is_crm_admin()))
with check ((select app_private.is_crm_admin()));

revoke all on table
  public.assignment_decisions,
  public.lost_requests,
  public.comuna_travel_matrix
from public, anon;

grant select, insert, update, delete on table
  public.assignment_decisions,
  public.lost_requests,
  public.comuna_travel_matrix
to authenticated;

grant select, insert, update, delete on table
  public.assignment_decisions,
  public.lost_requests,
  public.comuna_travel_matrix
to service_role;

revoke all on function public.enforce_assignment_saga_transition()
from public, anon, authenticated;

revoke all on function public.recover_lost_request_from_booking()
from public, anon, authenticated;

revoke all on function public.record_comuna_travel_observation(
  text,
  text,
  text,
  integer,
  numeric,
  numeric
) from public, anon, authenticated;

grant execute on function public.record_comuna_travel_observation(
  text,
  text,
  text,
  integer,
  numeric,
  numeric
) to service_role;
