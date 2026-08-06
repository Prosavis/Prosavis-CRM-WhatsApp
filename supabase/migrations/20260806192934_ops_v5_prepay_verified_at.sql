alter table public.bookings
  add column if not exists prepay_verified_at timestamptz;

comment on column public.bookings.prepay_verified_at is
  'Timestamp estable del evento Wompi APPROVED; null para pagos no verificados o manuales.';

create index bookings_service_prepay_verified_idx
  on public.bookings (service_id, prepay_verified_at)
  where prepay_verified_at is not null;
