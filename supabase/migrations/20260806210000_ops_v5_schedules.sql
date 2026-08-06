-- V5 operational schedules. pg_cron uses UTC in Supabase:
-- 23:00 UTC = 18:00 America/Bogota; 04:59 UTC = 23:59 previous Bogotá day.
do $$
begin
  if exists (
    select 1
    from pg_available_extensions
    where name = 'pg_cron'
  ) then
    create extension if not exists pg_cron;

    perform cron.unschedule(jobid)
    from cron.job
    where jobname = 'ops-v5-recoverables-tomorrow';

    perform cron.schedule(
      'ops-v5-recoverables-tomorrow',
      '0 23 * * *',
      $job$
        select public.run_orphan_stacking_recovery(service_id)
        from (
          select distinct service_id
          from public.cleaner_availability
        ) services
      $job$
    );

    perform cron.unschedule(jobid)
    from cron.job
    where jobname = 'ops-v5-monthly-close-daily';

    perform cron.schedule(
      'ops-v5-monthly-close-daily',
      '59 4 * * *',
      $job$
        select app_private.enqueue_ops_monthly_close_if_due(service_id)
        from (
          select distinct service_id
          from public.bookings
        ) services
      $job$
    );
  end if;
end
$$;
