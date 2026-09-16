begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(14);

insert into public.crm_directory (
  id, full_name, display_name, phone, classification, tags, status, source, channels, service_id
) values
  (
    '41000000-0000-4000-8000-000000000001',
    'Ana Agendada',
    'Ana Agendada',
    '+573001110001',
    'user',
    array['Agendado'],
    'active',
    'WHATSAPP_INBOUND',
    array['WHATSAPP'],
    'svc-dir-workspace'
  ),
  (
    '41000000-0000-4000-8000-000000000002',
    'Carlos Citas',
    'Carlos Citas',
    '+573001110002',
    'user',
    array[]::text[],
    'active',
    'MANUAL',
    array['WHATSAPP'],
    'svc-dir-workspace'
  ),
  (
    '41000000-0000-4000-8000-000000000003',
    'Lucia Cancelo',
    'Lucia Cancelo',
    '+573001110003',
    'user',
    array['Agendado'],
    'active',
    'MANUAL',
    array['WHATSAPP'],
    'svc-dir-workspace'
  ),
  (
    '41000000-0000-4000-8000-000000000004',
    'Rita Recurrente',
    'Rita Recurrente',
    '+573001110004',
    'user',
    array['Cliente recurrente'],
    'active',
    'APP_USER',
    array['IN_APP'],
    'svc-dir-workspace'
  ),
  (
    '41000000-0000-4000-8000-000000000005',
    'Pedro Inactivo',
    'Pedro Inactivo',
    '+573001110005',
    'user',
    array[]::text[],
    'active',
    'MANUAL',
    array['WHATSAPP'],
    'svc-dir-workspace'
  ),
  (
    '41000000-0000-4000-8000-000000000006',
    'Test Interno',
    'Test Interno',
    '+573001110006',
    'user',
    array['test'],
    'active',
    'MANUAL',
    array['WHATSAPP'],
    'svc-dir-workspace'
  );

insert into public.bookings (
  service_id, appointment_id, source_revision, source_hash, source_updated_at,
  status, scheduled_start, scheduled_end, payment_status, client_phone, client_id,
  pending_cop, cancellation_reason, cancellation_reason_other
) values
  (
    'svc-dir-workspace', 'apt-carlos-done', 1,
    'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    now(), 'COMPLETED', now() - interval '2 days', now() - interval '2 days' + interval '2 hours',
    'PAGO_ACEPTADO', '+573001110002', '41000000-0000-4000-8000-000000000002', 0, null, null
  ),
  (
    'svc-dir-workspace', 'apt-lucia-old', 1,
    'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
    now() - interval '10 days', 'CANCELED', now() - interval '20 days',
    now() - interval '20 days' + interval '2 hours',
    'PAGO_PENDIENTE', '+573001110003', '41000000-0000-4000-8000-000000000003',
    0, 'cliente_viaja_aplaza', 'Se va de viaje'
  ),
  (
    'svc-dir-workspace', 'apt-lucia-new', 1,
    'cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc',
    now(), 'REJECTED', now() - interval '3 days',
    now() - interval '3 days' + interval '2 hours',
    'PAGO_PENDIENTE', '+573001110003', '41000000-0000-4000-8000-000000000003',
    0, 'no_confirmo', null
  ),
  (
    'svc-dir-workspace', 'apt-rita-done', 1,
    'dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd',
    now(), 'COMPLETED', now() - interval '5 days',
    now() - interval '5 days' + interval '2 hours',
    'PAGO_EN_PROCESO', '+573001110004', '41000000-0000-4000-8000-000000000004',
    25000, null, null
  ),
  (
    'svc-dir-workspace', 'apt-pedro-old', 1,
    'eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee',
    now() - interval '40 days', 'COMPLETED', now() - interval '40 days',
    now() - interval '40 days' + interval '2 hours',
    'PAGO_ACEPTADO', '+573001110005', '41000000-0000-4000-8000-000000000005',
    0, null, null
  ),
  (
    'svc-dir-workspace', 'apt-test-hidden', 1,
    'ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff',
    now(), 'COMPLETED', now() - interval '1 day',
    now() - interval '1 day' + interval '2 hours',
    'PAGO_ACEPTADO', '+573001110006', '41000000-0000-4000-8000-000000000006',
    0, null, null
  );

select is(
  (public.directory_workspace_snapshot('svc-dir-workspace') ->> 'total')::int,
  5,
  'audience excludes TEST contacts and other services'
);

select is(
  (public.directory_workspace_snapshot('svc-dir-workspace') ->> 'scheduled')::int,
  5,
  'scheduled includes tag-only and any historical booking'
);

select is(
  (public.directory_workspace_snapshot('svc-dir-workspace') ->> 'canceledOrRejected')::int,
  1,
  'canceled counts contacts with CANCELED or REJECTED bookings'
);

select is(
  (public.directory_workspace_snapshot('svc-dir-workspace') ->> 'recurring')::int,
  1,
  'recurring requires booking plus recurring tag'
);

select is(
  (public.directory_workspace_snapshot('svc-dir-workspace') ->> 'reactivation')::int,
  1,
  'reactivation is last booking older than 30 days'
);

select is(
  (
    select count(*)
    from public.directory_workspace_page('svc-dir-workspace', 'scheduled', null, null, 50, 0)
  )::int,
  5,
  'scheduled page returns tag-only plus booked contacts'
);

select ok(
  exists (
    select 1
    from public.directory_workspace_page('svc-dir-workspace', 'scheduled', '3001110001', null, 50, 0)
    where id = '41000000-0000-4000-8000-000000000001'
      and appointment_count = 0
      and is_scheduled
  ),
  'tag Agendado without bookings still appears in scheduled'
);

select ok(
  exists (
    select 1
    from public.directory_workspace_page('svc-dir-workspace', 'canceled', null, null, 50, 0)
    where id = '41000000-0000-4000-8000-000000000003'
      and is_scheduled
      and is_canceled
      and latest_cancellation_status = 'REJECTED'
      and cancellation_count = 2
  ),
  'a contact can belong to scheduled and canceled; latest incident wins'
);

select is(
  (
    select count(*)
    from public.directory_workspace_cancellations_ordered(
      'svc-dir-workspace',
      '41000000-0000-4000-8000-000000000003'
    )
  )::int,
  2,
  'cancellation history returns every CANCELED and REJECTED booking'
);

select is(
  (
    select cancellation_reason
    from public.directory_workspace_cancellations_ordered(
      'svc-dir-workspace',
      '41000000-0000-4000-8000-000000000003'
    )
    offset 1 limit 1
  ),
  'cliente_viaja_aplaza',
  'older cancellation reason remains visible in history'
);

select is(
  (
    select count(*)
    from public.directory_workspace_page('svc-dir-workspace', 'all', null, 'recurring', 50, 0)
  )::int,
  1,
  'recurring segment is server-filtered'
);

select is(
  (
    select matched_count
    from public.directory_workspace_page('svc-dir-workspace', 'scheduled', 'Lucia Cancelo', null, 50, 0)
    limit 1
  )::int,
  1,
  'search is applied before pagination and exposes matched_count'
);

select is(
  (
    select count(*)
    from public.directory_workspace_page('svc-dir-workspace', 'scheduled', 'Lucia Cancelo', null, 1, 0)
  )::int,
  1,
  'page size is honored without scanning the whole directory'
);

select is(
  (
    select count(*)
    from public.directory_workspace_page('svc-dir-workspace', 'scheduled', 'Lucia Cancelo', null, 1, 1)
  )::int,
  0,
  'offset pagination does not re-fetch the first page'
);

select finish();
rollback;
