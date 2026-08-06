create table public.orphan_stacking_candidates (
  id uuid primary key default gen_random_uuid(),
  service_id text not null,
  cleaner_id text not null,
  operational_date date not null,
  window_start timestamptz not null,
  window_end timestamptz not null,
  available_minutes integer not null,
  status text not null default 'open',
  source text not null default 'recovery_job',
  single_price_cop bigint,
  pair_price_cop bigint,
  estimated_marginal_cost_cop bigint,
  flags text[] not null default '{}',
  addons jsonb not null default '[]'::jsonb,
  suggested_client_name text,
  converted_booking_id uuid,
  computed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint orphan_stacking_candidates_cleaner_fkey
    foreign key (service_id, cleaner_id)
    references public.crm_team_members (service_id, id),
  constraint orphan_stacking_candidates_booking_fkey
    foreign key (service_id, converted_booking_id)
    references public.bookings (service_id, id),
  constraint orphan_stacking_candidates_window_check
    check (window_start < window_end),
  constraint orphan_stacking_candidates_minutes_check
    check (available_minutes > 0),
  constraint orphan_stacking_candidates_status_check
    check (status in ('open', 'dismissed', 'converted', 'expired')),
  constraint orphan_stacking_candidates_source_check
    check (source in ('recovery_job', 'manual')),
  constraint orphan_stacking_candidates_money_check check (
    (single_price_cop is null or single_price_cop >= 0)
    and (pair_price_cop is null or pair_price_cop >= 0)
    and (
      estimated_marginal_cost_cop is null
      or estimated_marginal_cost_cop >= 0
    )
  ),
  constraint orphan_stacking_candidates_addons_check
    check (jsonb_typeof(addons) = 'array'),
  constraint orphan_stacking_candidates_unique_window
    unique (service_id, cleaner_id, operational_date, window_start, window_end)
);

create index orphan_stacking_candidates_service_date_status_idx
  on public.orphan_stacking_candidates (
    service_id,
    operational_date,
    status,
    window_start
  );

create index orphan_stacking_candidates_open_idx
  on public.orphan_stacking_candidates (
    service_id,
    operational_date,
    cleaner_id
  )
  where status = 'open';

drop trigger if exists set_orphan_stacking_candidates_updated_at
  on public.orphan_stacking_candidates;
create trigger set_orphan_stacking_candidates_updated_at
before update on public.orphan_stacking_candidates
for each row execute function public.set_updated_at();

alter table public.orphan_stacking_candidates enable row level security;

create policy orphan_stacking_candidates_admin_all
  on public.orphan_stacking_candidates
  for all
  to authenticated
  using ((select app_private.is_crm_admin()))
  with check ((select app_private.is_crm_admin()));

revoke all on table public.orphan_stacking_candidates
from public, anon;
grant select, insert, update, delete
on table public.orphan_stacking_candidates
to authenticated;
grant select, insert, update, delete
on table public.orphan_stacking_candidates
to service_role;

create or replace function app_private.refresh_orphan_stacking_candidates(
  p_service_id text,
  p_operational_date date
)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_inserted integer := 0;
begin
  delete from public.orphan_stacking_candidates
  where service_id = p_service_id
    and operational_date = p_operational_date
    and source = 'recovery_job'
    and status in ('open', 'expired');

  with accepted_windows as (
    select
      availability.service_id,
      availability.cleaner_id,
      availability.operational_date,
      availability.window_start,
      availability.window_end
    from public.cleaner_availability as availability
    where availability.service_id = p_service_id
      and availability.operational_date = p_operational_date
      and availability.accepted_minutes > 0
      and availability.window_start is not null
      and availability.window_end is not null
  ),
  windows_with_occupancy as (
    select
      accepted.*,
      coalesce(
        occupied.ranges,
        '{}'::tstzmultirange
      ) as occupied_ranges
    from accepted_windows as accepted
    left join lateral (
      select range_agg(
        tstzrange(
          greatest(
            accepted.window_start,
            coalesce(crew.scheduled_start, booking.scheduled_start)
          ),
          least(
            accepted.window_end,
            coalesce(crew.scheduled_end, booking.scheduled_end)
          ),
          '[)'
        )
      ) as ranges
      from public.booking_crew as crew
      join public.bookings as booking
        on booking.service_id = crew.service_id
       and booking.id = crew.booking_id
      where crew.service_id = accepted.service_id
        and crew.cleaner_id = accepted.cleaner_id
        and booking.source_deleted_at is null
        and booking.status in (
          'CONFIRMED',
          'EN_ROUTE',
          'IN_PROGRESS',
          'COMPLETED'
        )
        and coalesce(crew.scheduled_start, booking.scheduled_start) is not null
        and coalesce(crew.scheduled_end, booking.scheduled_end) is not null
        and tstzrange(
          coalesce(crew.scheduled_start, booking.scheduled_start),
          coalesce(crew.scheduled_end, booking.scheduled_end),
          '[)'
        ) && tstzrange(
          accepted.window_start,
          accepted.window_end,
          '[)'
        )
    ) as occupied on true
  ),
  free_ranges as (
    select
      windows.service_id,
      windows.cleaner_id,
      windows.operational_date,
      unnest(
        tstzmultirange(
          tstzrange(windows.window_start, windows.window_end, '[)')
        ) - windows.occupied_ranges
      ) as free_range
    from windows_with_occupancy as windows
  ),
  valid_candidates as (
    select
      free.service_id,
      free.cleaner_id,
      free.operational_date,
      lower(free.free_range) as window_start,
      upper(free.free_range) as window_end,
      floor(
        extract(epoch from upper(free.free_range) - lower(free.free_range)) /
        60
      )::integer as available_minutes
    from free_ranges as free
    where extract(
      epoch from upper(free.free_range) - lower(free.free_range)
    ) >= 30 * 60
  )
  insert into public.orphan_stacking_candidates (
    service_id,
    cleaner_id,
    operational_date,
    window_start,
    window_end,
    available_minutes,
    status,
    source,
    single_price_cop,
    pair_price_cop,
    estimated_marginal_cost_cop,
    flags,
    computed_at
  )
  select
    candidate.service_id,
    candidate.cleaner_id,
    candidate.operational_date,
    candidate.window_start,
    candidate.window_end,
    candidate.available_minutes,
    'open',
    'recovery_job',
    null,
    null,
    null,
    array['unknown_price', 'unknown_cost']::text[],
    now()
  from valid_candidates as candidate
  on conflict (
    service_id,
    cleaner_id,
    operational_date,
    window_start,
    window_end
  ) do update
  set
    available_minutes = excluded.available_minutes,
    computed_at = excluded.computed_at,
    flags = excluded.flags;

  get diagnostics v_inserted = row_count;
  return v_inserted;
end;
$$;

revoke all on function
  app_private.refresh_orphan_stacking_candidates(text, date)
from public, anon, authenticated;
grant execute on function
  app_private.refresh_orphan_stacking_candidates(text, date)
to service_role;

create or replace function public.run_orphan_stacking_recovery(
  p_service_id text,
  p_now timestamptz default now()
)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_bogota_now timestamp :=
    p_now at time zone 'America/Bogota';
  v_operational_date date :=
    (p_now at time zone 'America/Bogota')::date + 1;
  v_count integer := 0;
begin
  if extract(hour from v_bogota_now) < 18 then
    return jsonb_build_object(
      'should_run',
      false,
      'operational_date',
      v_operational_date,
      'candidate_count',
      0,
      'reason',
      'before_cutoff'
    );
  end if;

  v_count := app_private.refresh_orphan_stacking_candidates(
    p_service_id,
    v_operational_date
  );

  return jsonb_build_object(
    'should_run',
    true,
    'operational_date',
    v_operational_date,
    'candidate_count',
    v_count,
    'reason',
    'scheduled_recovery'
  );
end;
$$;

revoke all on function
  public.run_orphan_stacking_recovery(text, timestamptz)
from public, anon, authenticated;
grant execute on function
  public.run_orphan_stacking_recovery(text, timestamptz)
to service_role;
