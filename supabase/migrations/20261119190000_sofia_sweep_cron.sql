-- Apagar Sofía descarta la cola de borradores. El barrido corre cada minuto
-- y no hace nada si faltan los secretos del vault.

create or replace function public.set_sofia_mode(next_mode text)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  caller_email text;
  previous text;
begin
  if next_mode not in ('apagada', 'supervisada') then
    raise exception 'modo no permitido en esta fase' using errcode = '22023';
  end if;

  select email into caller_email
  from public.admin_profiles
  where id = auth.uid() and is_active = true;

  if caller_email not in (
    'admin@prosavis.com',
    'support@prosavis.com',
    'francyoliverab@gmail.com'
  ) then
    raise exception 'sin permiso para cambiar el modo' using errcode = '42501';
  end if;

  select mode into previous from public.sofia_settings where id = 1;
  update public.sofia_settings
    set mode = next_mode, updated_at = now(), updated_by = auth.uid()
    where id = 1;
  if next_mode = 'apagada' then
    delete from public.sofia_pending_drafts;
  end if;
  insert into public.sofia_mode_events (mode, previous_mode, changed_by)
    values (next_mode, previous, auth.uid());
  return next_mode;
end;
$$;

create or replace function app_private.invoke_sofia_draft_sweep()
returns void
language plpgsql
security definer
set search_path = public, app_private, pg_temp
as $$
declare
  v_url text;
  v_key text;
begin
  if not exists (
    select 1 from information_schema.tables
    where table_schema = 'vault' and table_name = 'decrypted_secrets'
  ) then
    return;
  end if;

  begin
    select ds.decrypted_secret into v_url
    from vault.decrypted_secrets ds
    where ds.name = 'sofia_draft_sweep_url'
    limit 1;
    select ds.decrypted_secret into v_key
    from vault.decrypted_secrets ds
    where ds.name = 'sofia_draft_sweep_auth'
    limit 1;
  exception when others then
    return;
  end;

  if v_url is null or v_key is null then
    return;
  end if;
  if not exists (select 1 from pg_extension where extname = 'pg_net') then
    return;
  end if;

  perform net.http_post(
    url := v_url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-sofia-draft-sweep', v_key
    ),
    body := '{}'::jsonb
  );
end;
$$;

revoke all on function app_private.invoke_sofia_draft_sweep() from public, anon, authenticated;

do $$
begin
  if exists (select 1 from pg_namespace where nspname = 'vault') then
    if not exists (select 1 from vault.secrets where name = 'sofia_draft_sweep_url') then
      perform vault.create_secret(
        'https://djzwjaegxbhlefanmmee.supabase.co/functions/v1/sofia-draft-sweep',
        'sofia_draft_sweep_url',
        'Barrido de borradores de Sofía'
      );
    end if;
  end if;
exception when others then
  raise notice 'sofia draft sweep url secret skipped: %', sqlerrm;
end
$$;

do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron;
    perform cron.unschedule(jobid)
    from cron.job
    where jobname = 'sofia-draft-sweep';
    perform cron.schedule(
      'sofia-draft-sweep',
      '* * * * *',
      $job$select app_private.invoke_sofia_draft_sweep()$job$
    );
  end if;
end
$$;
