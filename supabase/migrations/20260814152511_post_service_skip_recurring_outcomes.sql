-- Permite auditar omisiones de post-servicio por cliente recurrente,
-- cita de serie o cita futura PENDING/CONFIRMED.

ALTER TABLE public.whatsapp_post_service_events
  DROP CONSTRAINT IF EXISTS whatsapp_post_service_events_outcome_check;

ALTER TABLE public.whatsapp_post_service_events
  ADD CONSTRAINT whatsapp_post_service_events_outcome_check
  CHECK (
    outcome IN (
      'sent',
      'failed',
      'dry_run',
      'skipped_duplicate',
      'skipped_opt_out',
      'skipped_status',
      'skipped_disabled',
      'skipped_blacklisted',
      'skipped_invalid_phone',
      'skipped_recurring',
      'skipped_has_future_booking'
    )
  );
