-- El DELETE sin WHERE chocaba con pg_safeupdate y el botón no podía apagar.
-- Un correo null tampoco debe pasar el permiso. El mismo modo no escribe otro evento.

alter table public.sofia_mode_events
  add column if not exists actor_email text;

update public.sofia_mode_events as event
set actor_email = profile.email
from public.admin_profiles as profile
where event.actor_email is null
  and event.changed_by = profile.id;

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

  if caller_email is null or caller_email not in (
    'admin@prosavis.com',
    'support@prosavis.com',
    'francyoliverab@gmail.com'
  ) then
    raise exception 'sin permiso para cambiar el modo' using errcode = '42501';
  end if;

  select mode into previous from public.sofia_settings where id = 1;
  if previous is not distinct from next_mode then
    return next_mode;
  end if;

  update public.sofia_settings
    set mode = next_mode, updated_at = now(), updated_by = auth.uid()
    where id = 1;
  if next_mode = 'apagada' then
    delete from public.sofia_pending_drafts where stable_key is not null;
  end if;
  insert into public.sofia_mode_events (mode, previous_mode, changed_by, actor_email)
    values (next_mode, previous, auth.uid(), caller_email);
  return next_mode;
end;
$$;

revoke all on function public.set_sofia_mode(text) from public, anon;
grant execute on function public.set_sofia_mode(text) to authenticated, service_role;

alter table public.sofia_settings replica identity full;
alter table public.sofia_pending_drafts replica identity full;
alter table public.sofia_draft_reviews replica identity full;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'sofia_settings'
  ) then
    alter publication supabase_realtime add table public.sofia_settings;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'sofia_pending_drafts'
  ) then
    alter publication supabase_realtime add table public.sofia_pending_drafts;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'sofia_draft_reviews'
  ) then
    alter publication supabase_realtime add table public.sofia_draft_reviews;
  end if;
end $$;
