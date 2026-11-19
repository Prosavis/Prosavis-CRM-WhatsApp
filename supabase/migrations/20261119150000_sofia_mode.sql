-- Modo global de Sofía. Arranca apagada. El modo sola queda bloqueado en esta fase:
-- la función lo rechaza aunque alguien lo pida.

create table if not exists public.sofia_settings (
  id int primary key default 1 check (id = 1),
  mode text not null default 'apagada' check (mode in ('apagada', 'supervisada', 'sola')),
  updated_at timestamptz not null default now(),
  updated_by uuid
);

insert into public.sofia_settings (id, mode) values (1, 'apagada')
on conflict (id) do nothing;

create table if not exists public.sofia_mode_events (
  id bigint generated always as identity primary key,
  mode text not null,
  previous_mode text,
  changed_by uuid,
  changed_at timestamptz not null default now()
);

alter table public.sofia_settings enable row level security;
alter table public.sofia_mode_events enable row level security;

revoke all on table public.sofia_settings from public, anon;
revoke all on table public.sofia_mode_events from public, anon;

grant select on table public.sofia_settings to authenticated, service_role;
grant select on table public.sofia_mode_events to authenticated, service_role;

drop policy if exists sofia_settings_read on public.sofia_settings;
create policy sofia_settings_read
  on public.sofia_settings
  for select
  to authenticated
  using ((select app_private.is_crm_admin()));

drop policy if exists sofia_mode_events_read on public.sofia_mode_events;
create policy sofia_mode_events_read
  on public.sofia_mode_events
  for select
  to authenticated
  using ((select app_private.is_crm_admin()));

-- Solo Marian (admin@), Nicolás (support@) y Francy cambian el modo.
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
  insert into public.sofia_mode_events (mode, previous_mode, changed_by)
    values (next_mode, previous, auth.uid());
  return next_mode;
end;
$$;

revoke all on function public.set_sofia_mode(text) from public, anon;
grant execute on function public.set_sofia_mode(text) to authenticated, service_role;
