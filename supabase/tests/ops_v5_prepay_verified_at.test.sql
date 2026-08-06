begin;

create extension if not exists pgtap with schema extensions;

select plan(10);

select has_column(
  'public',
  'bookings',
  'prepay_verified_at',
  'bookings exposes the Wompi verification timestamp'
);

select is(
  (
    select data_type
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'bookings'
      and column_name = 'prepay_verified_at'
  ),
  'timestamp with time zone',
  'prepay verification preserves timezone'
);

select ok(
  to_regclass('public.bookings_service_prepay_verified_idx') is not null,
  'partial prepay verification index exists'
);

select has_column(
  'public',
  'bookings',
  'payment_recorded_at',
  'bookings exposes the effective payment timestamp'
);

select is(
  (
    select data_type
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'bookings'
      and column_name = 'payment_recorded_at'
  ),
  'timestamp with time zone',
  'effective payment timestamp preserves timezone'
);

select ok(
  to_regclass('public.bookings_service_payment_recorded_idx') is not null,
  'partial effective payment index exists'
);

insert into public.bookings (
  service_id,
  appointment_id,
  source_revision,
  source_hash,
  source_updated_at,
  prepay_verified_at,
  status
)
values (
  'service-prepay-test',
  'appointment-prepay-test',
  1,
  repeat('a', 64),
  '2026-08-06T18:00:00Z',
  '2026-08-06T17:59:00Z',
  'CONFIRMED'
);

select is(
  (
    select prepay_verified_at
    from public.bookings
    where service_id = 'service-prepay-test'
      and appointment_id = 'appointment-prepay-test'
  ),
  '2026-08-06T17:59:00Z'::timestamptz,
  'prepay verification timestamp round-trips exactly'
);

select is(
  public.apply_ops_booking_projection(
    jsonb_build_object(
      'service_id', 'service-prepay-test',
      'appointment_id', 'appointment-prepay-test',
      'source_revision', 2,
      'source_hash', repeat('b', 64),
      'source_updated_at', '2026-08-06T18:30:00Z',
      'prepay_verified_at', '2026-08-06T18:29:00Z',
      'payment_recorded_at', '2026-08-06T18:28:00Z',
      'status', 'CONFIRMED'
    ),
    '[]'::jsonb,
    '[]'::jsonb,
    '[]'::jsonb
  ) ->> 'reason',
  'updated',
  'projection RPC applies a newer prepay verification timestamp'
);

select is(
  (
    select prepay_verified_at
    from public.bookings
    where service_id = 'service-prepay-test'
      and appointment_id = 'appointment-prepay-test'
  ),
  '2026-08-06T18:29:00Z'::timestamptz,
  'projection RPC persists prepay_verified_at'
);

select is(
  (
    select payment_recorded_at
    from public.bookings
    where service_id = 'service-prepay-test'
      and appointment_id = 'appointment-prepay-test'
  ),
  '2026-08-06T18:28:00Z'::timestamptz,
  'projection RPC persists payment_recorded_at'
);

select * from finish();
rollback;
