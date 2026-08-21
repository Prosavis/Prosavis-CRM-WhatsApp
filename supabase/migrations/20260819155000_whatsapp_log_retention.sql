-- Time-based retention: raw webhook payloads (30d) and old message_log (90d archive).
-- Does not touch whatsapp_conversations (live inbox).

create table if not exists public.whatsapp_message_log_archive (
  like public.whatsapp_message_log including defaults
);

alter table public.whatsapp_message_log_archive
  add constraint whatsapp_message_log_archive_pkey primary key (id);

create index if not exists idx_whatsapp_message_log_archive_created_at
  on public.whatsapp_message_log_archive (created_at);

alter table public.whatsapp_message_log_archive enable row level security;

revoke all on table public.whatsapp_message_log_archive from public, anon, authenticated;
grant select, insert, delete on table public.whatsapp_message_log_archive to service_role;

drop policy if exists whatsapp_message_log_archive_no_client
  on public.whatsapp_message_log_archive;
create policy whatsapp_message_log_archive_no_client
on public.whatsapp_message_log_archive
for all
to anon, authenticated
using (false)
with check (false);

create or replace function app_private.purge_whatsapp_retention(
  p_webhook_days integer default 30,
  p_message_days integer default 90,
  p_batch integer default 1500
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  webhook_deleted integer := 0;
  message_archived integer := 0;
  n integer;
begin
  if p_webhook_days < 30 or p_message_days < 90 or p_batch < 1 or p_batch > 5000 then
    raise exception 'retention bounds: webhook_days>=30, message_days>=90, batch 1..5000';
  end if;

  loop
    delete from public.whatsapp_webhook_events
    where id in (
      select id
      from public.whatsapp_webhook_events
      where received_at < now() - make_interval(days => p_webhook_days)
      order by received_at
      limit p_batch
    );
    get diagnostics n = row_count;
    webhook_deleted := webhook_deleted + n;
    exit when n = 0;
  end loop;

  loop
    with batch as (
      select id
      from public.whatsapp_message_log
      where created_at < now() - make_interval(days => p_message_days)
      order by created_at
      limit p_batch
    ),
    moved as (
      insert into public.whatsapp_message_log_archive
      select l.*
      from public.whatsapp_message_log l
      join batch b on b.id = l.id
      on conflict (id) do nothing
      returning id
    )
    delete from public.whatsapp_message_log l
    using batch b
    where l.id = b.id;
    get diagnostics n = row_count;
    message_archived := message_archived + n;
    exit when n = 0;
  end loop;

  return jsonb_build_object(
    'webhook_deleted', webhook_deleted,
    'message_archived', message_archived
  );
end;
$$;

revoke all on function app_private.purge_whatsapp_retention(integer, integer, integer)
  from public, anon, authenticated;
grant execute on function app_private.purge_whatsapp_retention(integer, integer, integer)
  to service_role;

select app_private.purge_whatsapp_retention(30, 90, 1500);

analyze public.whatsapp_webhook_events;
analyze public.whatsapp_message_log;

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule(jobid)
    from cron.job
    where jobname = 'whatsapp-log-retention-daily';

    perform cron.schedule(
      'whatsapp-log-retention-daily',
      '30 5 * * *',
      $job$select app_private.purge_whatsapp_retention(30, 90, 1500)$job$
    );
  end if;
end
$$;
