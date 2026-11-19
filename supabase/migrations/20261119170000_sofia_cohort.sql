-- Un mensaje puente por conversación y por ventana fuera de horario.
create table if not exists public.sofia_bridge_log (
  stable_key text not null,
  window_date date not null,
  sent_at timestamptz not null default now(),
  primary key (stable_key, window_date)
);

alter table public.sofia_bridge_log enable row level security;
revoke all on table public.sofia_bridge_log from public, anon, authenticated;
grant select, insert on table public.sofia_bridge_log to service_role;

-- Grupo de comparación de Sofía. El 30% de los chats nuevos de anuncio del 312
-- (último dígito del teléfono 0, 1 o 2) se atiende como hoy. Se asigna una sola vez.

create or replace function app_private.assign_sofia_cohort()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  last_digit text;
begin
  if new.sofia_cohort is not null then
    return new;
  end if;
  if new.phone_number_id is distinct from '1035566289641219' then
    return new;
  end if;
  if nullif(btrim(coalesce(new.ctwa_source_id, '')), '') is null then
    return new;
  end if;

  last_digit = right(regexp_replace(coalesce(new.phone, ''), '\D', '', 'g'), 1);
  new.sofia_cohort = case
    when last_digit in ('0', '1', '2') then 'control'
    else 'sofia'
  end;
  return new;
end;
$$;

drop trigger if exists whatsapp_conversations_sofia_cohort on public.whatsapp_conversations;
create trigger whatsapp_conversations_sofia_cohort
  before insert or update of ctwa_source_id
  on public.whatsapp_conversations
  for each row
  execute function app_private.assign_sofia_cohort();
