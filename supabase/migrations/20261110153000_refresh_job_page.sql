-- Refresh only the applications on the current page: name, phone, CV mark, last message.

create or replace function public.refresh_job_application_page(p_ids uuid[])
returns integer
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_ids uuid[];
begin
  perform app_private.assert_job_admin_or_service();
  select coalesce(array_agg(id), '{}'::uuid[])
  into v_ids
  from (
    select id
    from public.job_applications
    where deleted_at is null
      and id = any (coalesce(p_ids, '{}'::uuid[]))
    limit 50
  ) s;

  update public.job_candidates c
  set
    full_name = coalesce(nullif(btrim(d.full_name), ''), c.full_name),
    display_name = coalesce(d.display_name, c.display_name),
    phone = coalesce(nullif(btrim(d.phone), ''), c.phone),
    phone_key = app_private.job_phone_key(coalesce(nullif(btrim(d.phone), ''), c.phone)),
    email = coalesce(nullif(btrim(d.email), ''), c.email),
    email_key = app_private.job_email_key(coalesce(nullif(btrim(d.email), ''), c.email))
  from public.job_applications a
  join public.crm_directory d on d.id = a.directory_id
  where a.id = any (v_ids)
    and c.id = a.candidate_id;

  update public.job_applications a
  set fit_rank = case
    when not exists (
      select 1 from public.job_application_documents doc
      where doc.application_id = a.id
    ) then 0
    when exists (
      select 1
      from public.job_candidate_evaluations e
      where e.application_id = a.id
        and coalesce((e.scores->'cleaning_experience'->>'score')::numeric, 0) >= 0.7
        and jsonb_typeof(e.scores->'cleaning_experience'->'evidence') = 'array'
        and jsonb_array_length(e.scores->'cleaning_experience'->'evidence') > 0
    ) then 2
    else 1
  end,
  updated_at = now()
  where a.id = any (v_ids);

  update public.job_applications a
  set last_contact_at = x.mx
  from (
    select a2.id, max(c.last_message_at) as mx
    from public.job_applications a2
    join public.job_candidates cand on cand.id = a2.candidate_id
    left join public.crm_directory d on d.id = a2.directory_id
    join public.whatsapp_conversations c
      on c.stable_key = d.whatsapp_conversation_id
      or c.stable_key = d.whatsapp_commercial_conversation_id
      or (
        cand.phone_key is not null
        and app_private.job_phone_key(coalesce(c.contact_phone, c.phone)) = cand.phone_key
      )
    where a2.id = any (v_ids)
      and c.last_message_at is not null
    group by a2.id
  ) x
  where a.id = x.id
    and (a.last_contact_at is null or x.mx > a.last_contact_at);

  return coalesce(array_length(v_ids, 1), 0);
end;
$fn$;

revoke all on function public.refresh_job_application_page(uuid[]) from public, anon, authenticated;
grant execute on function public.refresh_job_application_page(uuid[]) to service_role;
