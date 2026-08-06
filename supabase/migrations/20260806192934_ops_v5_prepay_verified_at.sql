alter table public.bookings
  add column if not exists prepay_verified_at timestamptz,
  add column if not exists payment_recorded_at timestamptz;

comment on column public.bookings.prepay_verified_at is
  'Timestamp estable del evento Wompi APPROVED; null para pagos no verificados o manuales.';

comment on column public.bookings.payment_recorded_at is
  'Timestamp de registro efectivo del pago, incluida verificación manual auditada.';

create index bookings_service_prepay_verified_idx
  on public.bookings (service_id, prepay_verified_at)
  where prepay_verified_at is not null;

create index bookings_service_payment_recorded_idx
  on public.bookings (service_id, payment_recorded_at)
  where payment_recorded_at is not null;
