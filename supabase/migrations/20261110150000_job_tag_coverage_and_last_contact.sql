-- Everyone with a Job tag gets an application. The list stacks by the last
-- WhatsApp message, not by the day the row was first created.

alter table public.job_applications
  add column if not exists last_contact_at timestamptz;

create index if not exists job_applications_last_contact_idx
  on public.job_applications (last_contact_at desc)
  where deleted_at is null;

create or replace function app_private.trg_ingest_job_from_directory()
returns trigger
language plpgsql
security definer
set search_path = ''
as $fn$
begin
  if app_private.job_cohorts_from_tag_names(new.tags) = '{}'::text[] then
    return new;
  end if;
  if tg_op = 'UPDATE'
    and app_private.job_cohorts_from_tag_names(new.tags)
      = app_private.job_cohorts_from_tag_names(old.tags) then
    return new;
  end if;
  perform public.ingest_job_application_from_directory(
    new.id,
    'system',
    'system/directory-tag',
    'Sincronización de tags',
    'tag',
    new.whatsapp_conversation_id,
    null
  );
  return new;
end;
$fn$;

drop trigger if exists trg_ingest_job_from_directory on public.crm_directory;
create trigger trg_ingest_job_from_directory
  after insert or update of tags
  on public.crm_directory
  for each row
  execute function app_private.trg_ingest_job_from_directory();

revoke all on function app_private.trg_ingest_job_from_directory() from public, anon, authenticated;

create or replace function app_private.touch_job_last_contact()
returns trigger
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_phone text;
begin
  if new.last_message_at is null then
    return new;
  end if;
  if tg_op = 'UPDATE' and new.last_message_at is not distinct from old.last_message_at then
    return new;
  end if;
  v_phone := app_private.job_phone_key(coalesce(new.contact_phone, new.phone));
  update public.job_applications a
  set last_contact_at = new.last_message_at
  from public.job_candidates c
  left join public.crm_directory d on d.id = a.directory_id
  where c.id = a.candidate_id
    and a.deleted_at is null
    and (
      d.whatsapp_conversation_id = new.stable_key
      or d.whatsapp_commercial_conversation_id = new.stable_key
      or (v_phone is not null and c.phone_key = v_phone)
      or exists (
        select 1 from public.job_application_sources s
        where s.application_id = a.id
          and s.conversation_stable_key = new.stable_key
      )
    );
  return new;
end;
$fn$;

drop trigger if exists trg_touch_job_last_contact on public.whatsapp_conversations;
create trigger trg_touch_job_last_contact
  after insert or update of last_message_at
  on public.whatsapp_conversations
  for each row
  execute function app_private.touch_job_last_contact();

revoke all on function app_private.touch_job_last_contact() from public, anon, authenticated;

select public.backfill_job_applications(false, 'job', 100);

update public.job_applications a
set last_contact_at = c.last_message_at
from public.crm_directory d
join public.whatsapp_conversations c
  on c.stable_key = d.whatsapp_conversation_id
  or c.stable_key = d.whatsapp_commercial_conversation_id
where a.directory_id = d.id
  and a.deleted_at is null
  and c.last_message_at is not null
  and (a.last_contact_at is null or c.last_message_at > a.last_contact_at);

update public.job_applications a
set last_contact_at = p.mx
from (
  select cand.id as candidate_id, max(c.last_message_at) as mx
  from public.job_candidates cand
  join public.whatsapp_conversations c
    on app_private.job_phone_key(coalesce(c.contact_phone, c.phone)) = cand.phone_key
  where cand.phone_key is not null
    and c.last_message_at is not null
  group by cand.id
) p
where a.candidate_id = p.candidate_id
  and a.deleted_at is null
  and (a.last_contact_at is null or p.mx > a.last_contact_at);

update public.job_applications a
set last_contact_at = coalesce(a.last_contact_at, a.created_at)
where a.deleted_at is null
  and a.last_contact_at is null;
