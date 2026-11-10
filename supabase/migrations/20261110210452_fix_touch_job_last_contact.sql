-- touch_job_last_contact joined crm_directory ON a.directory_id inside the FROM
-- of an UPDATE on job_applications. Postgres rejects that (42P01: invalid
-- reference to FROM-clause entry "a") and the error aborted every inbound
-- WhatsApp upsert from 2026-11-10 14:55 America/Bogota. The directory match
-- now lives in EXISTS, where the target alias is legal.
--
-- These three triggers sit on the messaging path. A bug in the job module
-- must warn, not drop the message.

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

  begin
    v_phone := app_private.job_phone_key(coalesce(new.contact_phone, new.phone));
    update public.job_applications a
    set last_contact_at = new.last_message_at
    from public.job_candidates c
    where c.id = a.candidate_id
      and a.deleted_at is null
      and (a.last_contact_at is null or a.last_contact_at < new.last_message_at)
      and (
        (v_phone is not null and c.phone_key = v_phone)
        or exists (
          select 1
          from public.crm_directory d
          where d.id = a.directory_id
            and (
              d.whatsapp_conversation_id = new.stable_key
              or d.whatsapp_commercial_conversation_id = new.stable_key
            )
        )
        or exists (
          select 1
          from public.job_application_sources s
          where s.application_id = a.id
            and s.conversation_stable_key = new.stable_key
        )
      );
  exception
    when others then
      raise warning 'touch_job_last_contact failed for %: %', new.stable_key, sqlerrm;
  end;

  return new;
end;
$fn$;

create or replace function app_private.trg_ingest_job_from_conversation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_actor text;
begin
  begin
    v_actor := coalesce(auth.uid()::text, 'system/tag_sync');
    perform public.ingest_job_application_from_conversation(
      new.stable_key,
      case when auth.uid() is null then 'system' else 'supabase' end,
      v_actor,
      case when auth.uid() is null then 'Sincronización de tags' else v_actor end,
      'tag'
    );
  exception
    when others then
      raise warning 'trg_ingest_job_from_conversation failed for %: %', new.stable_key, sqlerrm;
  end;
  return new;
end;
$fn$;

create or replace function app_private.trg_ingest_job_from_directory()
returns trigger
language plpgsql
security definer
set search_path = ''
as $fn$
begin
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
  exception
    when others then
      raise warning 'trg_ingest_job_from_directory failed for %: %', new.id, sqlerrm;
  end;
  return new;
end;
$fn$;

revoke all on function app_private.touch_job_last_contact() from public, anon, authenticated;
revoke all on function app_private.trg_ingest_job_from_conversation() from public, anon, authenticated;
revoke all on function app_private.trg_ingest_job_from_directory() from public, anon, authenticated;
