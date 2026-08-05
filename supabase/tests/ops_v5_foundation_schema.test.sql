begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select no_plan();

create or replace function pg_temp.sqlstate_of(statement text)
returns text
language plpgsql
as $$
begin
  execute statement;
  return null;
exception
  when others then
    return sqlstate;
end;
$$;

select has_table('public', 'buildings', 'buildings exists');
select has_table('public', 'bookings', 'bookings exists');
select has_table('public', 'booking_crew', 'booking_crew exists');
select has_table('public', 'booking_addons', 'booking_addons exists');
select has_table('public', 'booking_events', 'booking_events exists');
select has_table('public', 'cleaner_availability', 'cleaner_availability exists');

select has_column('public', 'crm_team_members', 'hire_date', 'team members have hire_date');
select has_column('public', 'crm_team_members', 'labor_regime', 'team members have labor_regime');
select has_column('public', 'crm_team_members', 'operations_status', 'team members have operations_status');

select is(
  pg_temp.sqlstate_of($$insert into public.buildings
    (service_id, name, building_type, unit_count)
    values ('svc-a', 'Invalid type', 'office', 1)$$),
  '23514',
  'building type is exhaustive'
);
select is(
  pg_temp.sqlstate_of($$insert into public.buildings
    (service_id, name, building_type, unit_count)
    values ('svc-a', 'Invalid units', 'edificio', -1)$$),
  '23514',
  'building unit count cannot be negative'
);
select is(
  pg_temp.sqlstate_of($$insert into public.buildings
    (service_id, name, building_type, latitude, longitude)
    values ('svc-a', 'Invalid coordinates', 'edificio', 91, -181)$$),
  '23514',
  'building coordinates stay in geographic bounds'
);

insert into public.crm_team_members
  (service_id, id, user_id, name, email)
values
  ('svc-a', 'cleaner-a', 'user-a', 'Cleaner A', 'cleaner-a@example.test'),
  ('svc-a', 'cleaner-a-2', 'user-a-2', 'Cleaner A2', 'cleaner-a-2@example.test'),
  ('svc-b', 'cleaner-b', 'user-b', 'Cleaner B', 'cleaner-b@example.test');

insert into public.buildings
  (id, service_id, name, building_type, unit_count)
values
  ('10000000-0000-0000-0000-000000000001', 'svc-a', 'Building A', 'edificio', 10),
  ('10000000-0000-0000-0000-000000000002', 'svc-b', 'Building B', 'edificio', 10);

select is(
  pg_temp.sqlstate_of($$insert into public.bookings
    (service_id, appointment_id, status, fulfillment, crew_size)
    values ('svc-a', 'invalid-status', 'DONE', 'single', 1)$$),
  '23514',
  'booking status is exhaustive'
);
select is(
  pg_temp.sqlstate_of($$insert into public.bookings
    (service_id, appointment_id, status, payment_status, fulfillment, crew_size)
    values ('svc-a', 'invalid-payment-status', 'PENDING', 'PAID', 'single', 1)$$),
  '23514',
  'payment status is exhaustive'
);
select is(
  pg_temp.sqlstate_of($$insert into public.bookings
    (service_id, appointment_id, status, payment_method, fulfillment, crew_size)
    values ('svc-a', 'invalid-payment-method', 'PENDING', 'CARD', 'single', 1)$$),
  '23514',
  'payment method is exhaustive'
);
select is(
  pg_temp.sqlstate_of($$insert into public.bookings
    (service_id, appointment_id, status, fulfillment, crew_size)
    values ('svc-a', 'invalid-fulfillment', 'PENDING', 'team', 1)$$),
  '23514',
  'fulfillment is exhaustive'
);
select is(
  pg_temp.sqlstate_of($$insert into public.bookings
    (service_id, appointment_id, status, fulfillment, crew_size)
    values ('svc-a', 'invalid-single-size', 'PENDING', 'single', 2)$$),
  '23514',
  'single fulfillment requires one cleaner'
);
select is(
  pg_temp.sqlstate_of($$insert into public.bookings
    (service_id, appointment_id, status, fulfillment, crew_size)
    values ('svc-a', 'invalid-composite-size', 'PENDING', 'composite', 1)$$),
  '23514',
  'composite fulfillment requires at least two cleaners'
);
select is(
  pg_temp.sqlstate_of($$insert into public.bookings
    (service_id, appointment_id, status, required_cleaner_minutes, fulfillment, crew_size)
    values ('svc-a', 'invalid-minutes', 'PENDING', -1, 'single', 1)$$),
  '23514',
  'required cleaner minutes cannot be negative'
);
select is(
  pg_temp.sqlstate_of($$insert into public.bookings
    (service_id, appointment_id, status, total_cop, fulfillment, crew_size)
    values ('svc-a', 'invalid-money', 'PENDING', -1, 'single', 1)$$),
  '23514',
  'booking COP amounts cannot be negative'
);
select is(
  pg_temp.sqlstate_of($$insert into public.bookings
    (service_id, appointment_id, status, scheduled_start, scheduled_end, fulfillment, crew_size)
    values ('svc-a', 'invalid-range', 'PENDING', '2026-08-05 12:00+00', '2026-08-05 11:00+00', 'single', 1)$$),
  '23514',
  'booking scheduled range must increase'
);
select is(
  pg_temp.sqlstate_of($$insert into public.bookings
    (service_id, appointment_id, status, building_id, fulfillment, crew_size)
    values ('svc-a', 'cross-service-building', 'PENDING',
      '10000000-0000-0000-0000-000000000002', 'single', 1)$$),
  '23503',
  'building foreign key prevents cross-service references'
);

insert into public.bookings
  (id, service_id, appointment_id, status, scheduled_start, scheduled_end,
   fulfillment, crew_size)
values
  ('20000000-0000-0000-0000-000000000001', 'svc-a', 'appointment-a',
   'CONFIRMED', '2026-08-05 12:00+00', '2026-08-05 14:00+00', 'single', 1),
  ('20000000-0000-0000-0000-000000000002', 'svc-b', 'appointment-b',
   'CONFIRMED', '2026-08-05 12:00+00', '2026-08-05 14:00+00', 'single', 1);

select is(
  pg_temp.sqlstate_of($$insert into public.booking_crew
    (service_id, booking_id, cleaner_id, assigned_minutes)
    values ('svc-a', '20000000-0000-0000-0000-000000000001', 'cleaner-b', 60)$$),
  '23503',
  'cleaner foreign key prevents cross-service references'
);
select is(
  pg_temp.sqlstate_of($$insert into public.booking_crew
    (service_id, booking_id, cleaner_id, assigned_minutes)
    values ('svc-a', '20000000-0000-0000-0000-000000000001', 'cleaner-a', -1)$$),
  '23514',
  'assigned minutes cannot be negative'
);
select is(
  pg_temp.sqlstate_of($$insert into public.booking_crew
    (service_id, booking_id, cleaner_id, assigned_minutes, scheduled_start, scheduled_end)
    values ('svc-a', '20000000-0000-0000-0000-000000000001', 'cleaner-a', 60,
      '2026-08-05 14:00+00', '2026-08-05 12:00+00')$$),
  '23514',
  'crew scheduled range must increase'
);
select is(
  pg_temp.sqlstate_of($$insert into public.booking_crew
    (service_id, booking_id, cleaner_id, assigned_minutes, estimated_marginal_cost_cop)
    values ('svc-a', '20000000-0000-0000-0000-000000000001', 'cleaner-a', 60, -1)$$),
  '23514',
  'crew marginal cost cannot be negative'
);

insert into public.booking_crew
  (service_id, booking_id, cleaner_id, assigned_minutes, is_lead)
values
  ('svc-a', '20000000-0000-0000-0000-000000000001', 'cleaner-a', 60, true);

select is(
  pg_temp.sqlstate_of($$insert into public.booking_crew
    (service_id, booking_id, cleaner_id, assigned_minutes, is_lead)
    values ('svc-a', '20000000-0000-0000-0000-000000000001', 'cleaner-a-2', 60, true)$$),
  '23505',
  'only one lead is allowed per booking'
);

select is(
  pg_temp.sqlstate_of($$insert into public.booking_addons
    (service_id, booking_id, addon_id, minutes, price_cop, sold_at)
    values ('svc-a', '20000000-0000-0000-0000-000000000001', 'addon-a', -1, 0, 'checkout')$$),
  '23514',
  'addon minutes cannot be negative'
);
select is(
  pg_temp.sqlstate_of($$insert into public.booking_addons
    (service_id, booking_id, addon_id, minutes, price_cop, sold_at)
    values ('svc-a', '20000000-0000-0000-0000-000000000001', 'addon-a', 15, -1, 'checkout')$$),
  '23514',
  'addon price cannot be negative'
);
select is(
  pg_temp.sqlstate_of($$insert into public.booking_addons
    (service_id, booking_id, addon_id, minutes, price_cop, sold_at)
    values ('svc-a', '20000000-0000-0000-0000-000000000001', 'addon-a', 15, 1000, 'later')$$),
  '23514',
  'addon sale point is exhaustive'
);

select is(
  pg_temp.sqlstate_of($$insert into public.booking_events
    (service_id, booking_id, event)
    values ('svc-a', '20000000-0000-0000-0000-000000000001', 'deleted')$$),
  '23514',
  'booking event is exhaustive'
);

select is(
  pg_temp.sqlstate_of($$insert into public.cleaner_availability
    (service_id, cleaner_id, operational_date, offered_minutes, accepted_minutes, source)
    values ('svc-a', 'cleaner-a-2', '2026-08-05', 60, 61, 'manual')$$),
  '23514',
  'accepted availability cannot exceed offered minutes'
);
select is(
  pg_temp.sqlstate_of($$insert into public.cleaner_availability
    (service_id, cleaner_id, operational_date, offered_minutes, accepted_minutes, source)
    values ('svc-a', 'cleaner-a-2', '2026-08-05', 60, 30, 'manual')$$),
  '23514',
  'accepted availability requires a window'
);
select is(
  pg_temp.sqlstate_of($$insert into public.cleaner_availability
    (service_id, cleaner_id, operational_date, offered_minutes, accepted_minutes,
     window_start, window_end, source)
    values ('svc-a', 'cleaner-a-2', '2026-08-05', 60, 30,
      '2026-08-05 14:00+00', '2026-08-05 12:00+00', 'manual')$$),
  '23514',
  'availability window must increase'
);
select is(
  pg_temp.sqlstate_of($$insert into public.cleaner_availability
    (service_id, cleaner_id, operational_date, unavailable_reason, source)
    values ('svc-a', 'cleaner-a-2', '2026-08-05', 'other', 'manual')$$),
  '23514',
  'availability reason is exhaustive'
);
select is(
  pg_temp.sqlstate_of($$insert into public.cleaner_availability
    (service_id, cleaner_id, operational_date, source)
    values ('svc-a', 'cleaner-a-2', '2026-08-05', 'web')$$),
  '23514',
  'availability source is exhaustive'
);
select is(
  pg_temp.sqlstate_of($$insert into public.cleaner_availability
    (service_id, cleaner_id, operational_date, source)
    values ('svc-a', 'cleaner-b', '2026-08-05', 'manual')$$),
  '23503',
  'availability cleaner foreign key prevents cross-service references'
);

select * from finish();
rollback;
