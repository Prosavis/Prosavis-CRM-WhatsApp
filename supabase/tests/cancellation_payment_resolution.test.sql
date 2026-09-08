begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select no_plan();

select ok(
  exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'bookings'
      and column_name = 'cancellation_reason'
  ),
  'bookings has cancellation_reason'
);

insert into public.bookings (
  service_id, appointment_id, source_revision, source_hash, source_updated_at,
  status, scheduled_start, scheduled_end, payment_status
) values (
  'svc-test', 'apt-legacy-cancel', 1,
  'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
  now(), 'CANCELED', now(), now() + interval '2 hours', 'PAGO_PENDIENTE'
);

select is(
  (select cancellation_reason from public.bookings where appointment_id = 'apt-legacy-cancel'),
  'motivo_desconocido_legacy',
  'trigger backfills missing cancellation reason to legacy'
);

select throws_ok(
  $$insert into public.bookings (
      service_id, appointment_id, source_revision, source_hash, source_updated_at,
      status, scheduled_start, scheduled_end, payment_status, cancellation_reason
    ) values (
      'svc-test', 'apt-bad-reason', 1,
      'cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc',
      now(), 'CANCELED', now(), now() + interval '2 hours', 'PAGO_PENDIENTE', 'foo'
    )$$,
  '23514',
  'invalid cancellation reason is rejected'
);

select lives_ok(
  $$insert into public.bookings (
      service_id, appointment_id, source_revision, source_hash, source_updated_at,
      status, scheduled_start, scheduled_end, payment_status, cancellation_reason,
      cancellation_reason_other, financial_outcome, paid_cop, paid_gross_cop,
      refund_cop, net_collected_cop
    ) values (
      'svc-test', 'apt-nequi-refund', 1,
      'dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd',
      now(), 'CANCELED', now(), now() + interval '2 hours', 'PAGO_ACEPTADO',
      'cliente_viaja_aplaza', null, 'PAGO_DEVUELTO', 88000, 88000, 44000, 44000
    )$$,
  'valid refunded cancellation is accepted'
);

select lives_ok(
  $$insert into public.bookings (
      service_id, appointment_id, source_revision, source_hash, source_updated_at,
      status, scheduled_start, scheduled_end, payment_status
    ) values (
      'svc-test', 'apt-rejected-pay', 1,
      'eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee',
      now(), 'PENDING', now(), now() + interval '2 hours', 'PAGO_RECHAZADO'
    )$$,
  'PAGO_RECHAZADO is a valid collection status'
);

select finish();
rollback;
