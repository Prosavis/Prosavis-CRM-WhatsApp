create or replace function public.replace_cleaner_availability_window(
  p_service_id text,
  p_cleaner_id text,
  p_from_date date,
  p_to_date date,
  p_rows jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_count integer;
begin
  if nullif(btrim(p_service_id), '') is null
    or nullif(btrim(p_cleaner_id), '') is null
  then
    raise exception 'service_id and cleaner_id are required';
  end if;
  if p_from_date is null
    or p_to_date is null
    or p_from_date > p_to_date
    or p_to_date - p_from_date > 62
  then
    raise exception 'invalid availability window';
  end if;
  if jsonb_typeof(p_rows) <> 'array' then
    raise exception 'p_rows must be an array';
  end if;
  if exists (
    select 1
    from jsonb_to_recordset(p_rows) as row_data(
      operational_date date,
      offered_minutes integer,
      accepted_minutes integer,
      window_start timestamptz,
      window_end timestamptz,
      unavailable_reason text,
      source text
    )
    where row_data.operational_date is null
      or row_data.operational_date < p_from_date
      or row_data.operational_date > p_to_date
      or row_data.offered_minutes is null
      or row_data.accepted_minutes is null
      or row_data.offered_minutes < 0
      or row_data.accepted_minutes < 0
      or row_data.accepted_minutes > row_data.offered_minutes
  ) then
    raise exception 'invalid availability row';
  end if;

  delete from public.cleaner_availability
  where service_id = p_service_id
    and cleaner_id = p_cleaner_id
    and operational_date between p_from_date and p_to_date;

  insert into public.cleaner_availability (
    service_id,
    cleaner_id,
    operational_date,
    offered_minutes,
    accepted_minutes,
    window_start,
    window_end,
    unavailable_reason,
    source
  )
  select
    p_service_id,
    p_cleaner_id,
    row_data.operational_date,
    row_data.offered_minutes,
    row_data.accepted_minutes,
    row_data.window_start,
    row_data.window_end,
    coalesce(row_data.unavailable_reason, 'none'),
    coalesce(row_data.source, 'manual')
  from jsonb_to_recordset(p_rows) as row_data(
    operational_date date,
    offered_minutes integer,
    accepted_minutes integer,
    window_start timestamptz,
    window_end timestamptz,
    unavailable_reason text,
    source text
  );

  get diagnostics v_count = row_count;
  return jsonb_build_object(
    'service_id', p_service_id,
    'cleaner_id', p_cleaner_id,
    'from_date', p_from_date,
    'to_date', p_to_date,
    'rows_applied', v_count
  );
end;
$$;

revoke all on function public.replace_cleaner_availability_window(
  text,
  text,
  date,
  date,
  jsonb
) from public, anon, authenticated;

grant execute on function public.replace_cleaner_availability_window(
  text,
  text,
  date,
  date,
  jsonb
) to service_role;
