-- Nota de voz a los 5 minutos del menú de anuncio, y de las fichas doméstica y empresarial.
-- Empleo no encola. live queda en false hasta la prueba en el 312.

create table public.ctwa_voice_nudges (
  id uuid primary key default gen_random_uuid(),
  conversation_stable_key text not null,
  phone_number_id text not null,
  recipient text not null,
  kind text not null,
  anchor_wa_message_id text not null,
  anchor_at timestamptz not null,
  due_at timestamptz not null,
  status text not null default 'pending',
  skip_reason text,
  attempts integer not null default 0,
  wa_message_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ctwa_voice_nudges_kind_check check (kind in ('menu', 'hogar', 'empresas')),
  constraint ctwa_voice_nudges_status_check check (
    status in ('pending', 'sending', 'sent', 'skipped', 'failed', 'cancelled')
  ),
  constraint ctwa_voice_nudges_anchor_kind_key unique (anchor_wa_message_id, kind)
);

create unique index ctwa_voice_nudges_one_pending
  on public.ctwa_voice_nudges (conversation_stable_key)
  where status = 'pending';

create index ctwa_voice_nudges_due
  on public.ctwa_voice_nudges (due_at)
  where status = 'pending';

create table public.ctwa_voice_nudge_settings (
  id integer primary key,
  live boolean not null default false,
  constraint ctwa_voice_nudge_settings_singleton check (id = 1)
);

insert into public.ctwa_voice_nudge_settings (id, live) values (1, false);

alter table public.ctwa_voice_nudges enable row level security;
alter table public.ctwa_voice_nudge_settings enable row level security;

revoke all on public.ctwa_voice_nudges from public, anon, authenticated;
revoke all on public.ctwa_voice_nudge_settings from public, anon, authenticated;
grant select, insert, update on public.ctwa_voice_nudges to service_role;
grant select, update on public.ctwa_voice_nudge_settings to service_role;

create or replace function public.cancel_ctwa_voice_nudge_on_activity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.conversation_stable_key is null or new.campaign_type = 'CTWA_VOICE_NUDGE' then
    return new;
  end if;
  if new.direction = 'inbound'
     or (
       new.direction = 'outbound'
       and (new.sender_type = 'agent' or new.sent_via = 'crm')
     )
  then
    update public.ctwa_voice_nudges
    set status = 'cancelled',
        skip_reason = case
          when new.direction = 'inbound' then 'inbound_after_anchor'
          else 'agent_after_anchor'
        end,
        updated_at = now()
    where conversation_stable_key = new.conversation_stable_key
      and status = 'pending'
      and anchor_at < coalesce(new.created_at, now());
  end if;
  return new;
exception when others then
  raise warning 'ctwa voice nudge cancel skipped: %', sqlerrm;
  return new;
end;
$$;

drop trigger if exists ctwa_voice_nudge_cancel on public.whatsapp_message_log;

create trigger ctwa_voice_nudge_cancel
  after insert on public.whatsapp_message_log
  for each row
  execute function public.cancel_ctwa_voice_nudge_on_activity();

create or replace function public.claim_ctwa_voice_nudges(p_limit integer)
returns setof public.ctwa_voice_nudges
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.ctwa_voice_nudges
  set status = 'failed',
      skip_reason = 'gave_up',
      updated_at = now()
  where status = 'sending'
    and attempts >= 2
    and updated_at < now() - interval '2 minutes';

  return query
  with due as (
    select n.id
    from public.ctwa_voice_nudges n
    where (
      n.status = 'pending' and n.due_at <= now()
    ) or (
      n.status = 'sending'
      and n.updated_at < now() - interval '2 minutes'
      and n.attempts < 2
    )
    order by n.due_at
    limit greatest(1, least(coalesce(p_limit, 10), 20))
    for update skip locked
  )
  update public.ctwa_voice_nudges n
  set status = 'sending',
      attempts = n.attempts + 1,
      updated_at = now()
  from due
  where n.id = due.id
  returning n.*;
end;
$$;

revoke all on function public.cancel_ctwa_voice_nudge_on_activity() from public, anon, authenticated;
revoke all on function public.claim_ctwa_voice_nudges(integer) from public, anon, authenticated;
grant execute on function public.claim_ctwa_voice_nudges(integer) to service_role;

create or replace function app_private.invoke_ctwa_voice_nudge()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_url text;
  v_key text;
  v_live boolean;
  v_pending integer;
begin
  select s.live into v_live
  from public.ctwa_voice_nudge_settings s
  where s.id = 1;
  if v_live is not true then
    return;
  end if;

  select count(*) into v_pending
  from public.ctwa_voice_nudges n
  where (
    n.status = 'pending' and n.due_at <= now()
  ) or (
    n.status = 'sending'
    and n.updated_at < now() - interval '2 minutes'
    and n.attempts < 2
  );
  if v_pending = 0 then
    return;
  end if;

  if not exists (
    select 1 from information_schema.tables
    where table_schema = 'vault' and table_name = 'decrypted_secrets'
  ) then
    return;
  end if;

  begin
    select ds.decrypted_secret into v_url
    from vault.decrypted_secrets ds
    where ds.name = 'ctwa_voice_nudge_url'
    limit 1;
    select ds.decrypted_secret into v_key
    from vault.decrypted_secrets ds
    where ds.name = 'ctwa_voice_nudge_auth'
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
      'x-ctwa-voice-nudge', v_key
    ),
    body := jsonb_build_object('action', 'process', 'limit', 10)
  );
end;
$$;

revoke all on function app_private.invoke_ctwa_voice_nudge() from public, anon, authenticated;

do $$
begin
  if exists (select 1 from pg_namespace where nspname = 'vault') then
    if not exists (select 1 from vault.secrets where name = 'ctwa_voice_nudge_url') then
      perform vault.create_secret(
        'https://djzwjaegxbhlefanmmee.supabase.co/functions/v1/ctwa-voice-nudge',
        'ctwa_voice_nudge_url',
        'Notas de voz del menú de anuncio'
      );
    end if;
  end if;
exception when others then
  raise notice 'ctwa voice nudge url secret skipped: %', sqlerrm;
end
$$;

do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron;
    perform cron.unschedule(jobid)
    from cron.job
    where jobname = 'ctwa-voice-nudge';
    perform cron.schedule(
      'ctwa-voice-nudge',
      '* * * * *',
      $job$select app_private.invoke_ctwa_voice_nudge()$job$
    );
  end if;
end
$$;
