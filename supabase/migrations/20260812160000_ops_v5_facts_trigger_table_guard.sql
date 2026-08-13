-- Facts trigger is shared by bookings, booking_crew and booking_events.
-- Referencing old.cleaner_id in a single IF expression is type-checked against
-- every table, so inserts into booking_events crashed. Nest crew-only fields.

create or replace function app_private.refresh_ops_facts_trigger()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_operational_date date;
  v_cleaner record;
begin
  if tg_table_name = 'bookings' then
    if tg_op = 'DELETE' then
      delete from public.booking_facts where booking_id = old.id;
      if old.scheduled_start is not null then
        perform app_private.refresh_daily_ops_rollup(
          old.service_id,
          (old.scheduled_start at time zone 'America/Bogota')::date
        );
      end if;
      if coalesce(old.prepay_verified_at, old.payment_recorded_at) is not null
      then
        perform app_private.refresh_daily_ops_rollup(
          old.service_id,
          (
            coalesce(old.prepay_verified_at, old.payment_recorded_at)
              at time zone 'America/Bogota'
          )::date
        );
      end if;
      return old;
    end if;

    perform app_private.refresh_ops_booking_fact(
      new.service_id,
      new.id
    );

    if tg_op = 'UPDATE'
      and old.scheduled_start is distinct from new.scheduled_start
      and old.scheduled_start is not null
    then
      v_operational_date :=
        (old.scheduled_start at time zone 'America/Bogota')::date;
      for v_cleaner in
        select distinct cleaner_id
        from public.booking_crew
        where service_id = old.service_id
          and booking_id = old.id
      loop
        perform app_private.refresh_cleaner_day_fact(
          old.service_id,
          v_cleaner.cleaner_id,
          v_operational_date
        );
      end loop;
      perform app_private.refresh_daily_ops_rollup(
        old.service_id,
        v_operational_date
      );
    end if;

    if tg_op = 'UPDATE'
      and coalesce(old.prepay_verified_at, old.payment_recorded_at) is not null
    then
      perform app_private.refresh_daily_ops_rollup(
        old.service_id,
        (
          coalesce(old.prepay_verified_at, old.payment_recorded_at)
            at time zone 'America/Bogota'
        )::date
      );
    end if;

    return new;
  end if;

  if tg_op = 'DELETE' then
    perform app_private.refresh_ops_booking_fact(
      old.service_id,
      old.booking_id
    );
    if tg_table_name = 'booking_crew' then
      select service_date
      into v_operational_date
      from public.booking_facts
      where booking_id = old.booking_id;
      if v_operational_date is not null then
        perform app_private.refresh_cleaner_day_fact(
          old.service_id,
          old.cleaner_id,
          v_operational_date
        );
      end if;
    end if;
    return old;
  end if;

  perform app_private.refresh_ops_booking_fact(new.service_id, new.booking_id);
  if tg_table_name = 'booking_crew' and tg_op = 'UPDATE' then
    if to_jsonb(old) ->> 'cleaner_id'
      is distinct from to_jsonb(new) ->> 'cleaner_id'
    then
      select service_date
      into v_operational_date
      from public.booking_facts
      where booking_id = new.booking_id;
      if v_operational_date is not null then
        perform app_private.refresh_cleaner_day_fact(
          old.service_id,
          old.cleaner_id,
          v_operational_date
        );
      end if;
    end if;
  end if;
  return new;
end;
$$;
