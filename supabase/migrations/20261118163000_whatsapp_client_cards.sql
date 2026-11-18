-- Ficha de memoria de Sofía, una por teléfono (312 y 311 juntos).
-- modo = prueba hasta que el bloque ✨ la lea. Este cambio no envía mensajes.

create table if not exists public.whatsapp_client_cards (
  phone text primary key,
  ficha jsonb not null default '{}'::jsonb,
  resumen text not null default '',
  version_molde text not null default '1',
  modo text not null default 'prueba',
  chequeo jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  constraint whatsapp_client_cards_modo_check check (modo in ('prueba', 'vivo'))
);

create table if not exists public.whatsapp_client_card_events (
  id bigint generated always as identity primary key,
  phone text not null,
  modo text,
  before_ficha jsonb,
  after_ficha jsonb,
  recorded_at timestamptz not null default now()
);

create table if not exists public.whatsapp_client_card_reviews (
  phone text not null,
  field_path text not null,
  verdict text not null,
  reviewer text not null,
  reviewed_at timestamptz not null default now(),
  primary key (phone, field_path, reviewer),
  constraint whatsapp_client_card_reviews_verdict_check
    check (verdict in ('correcto', 'error'))
);

alter table public.whatsapp_client_cards enable row level security;
alter table public.whatsapp_client_card_events enable row level security;
alter table public.whatsapp_client_card_reviews enable row level security;

revoke all on table public.whatsapp_client_cards from public, anon;
revoke all on table public.whatsapp_client_card_events from public, anon, authenticated;
revoke all on table public.whatsapp_client_card_reviews from public, anon;

grant select on table public.whatsapp_client_cards to authenticated, service_role;
grant select, insert, update, delete on table public.whatsapp_client_cards to service_role;
grant select, insert on table public.whatsapp_client_card_events to service_role;
grant select, insert, update on table public.whatsapp_client_card_reviews to authenticated, service_role;

drop policy if exists whatsapp_client_cards_read on public.whatsapp_client_cards;
create policy whatsapp_client_cards_read
  on public.whatsapp_client_cards
  for select
  to authenticated
  using (true);

drop policy if exists whatsapp_client_card_reviews_read on public.whatsapp_client_card_reviews;
create policy whatsapp_client_card_reviews_read
  on public.whatsapp_client_card_reviews
  for select
  to authenticated
  using (true);

drop policy if exists whatsapp_client_card_reviews_write on public.whatsapp_client_card_reviews;
create policy whatsapp_client_card_reviews_write
  on public.whatsapp_client_card_reviews
  for insert
  to authenticated
  with check (true);

drop policy if exists whatsapp_client_card_reviews_update on public.whatsapp_client_card_reviews;
create policy whatsapp_client_card_reviews_update
  on public.whatsapp_client_card_reviews
  for update
  to authenticated
  using (true)
  with check (true);

create or replace function app_private.log_whatsapp_client_card()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.whatsapp_client_card_events (
    phone, modo, before_ficha, after_ficha
  ) values (
    new.phone,
    new.modo,
    case when tg_op = 'INSERT' then null else old.ficha end,
    new.ficha
  );
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists whatsapp_client_cards_log on public.whatsapp_client_cards;
create trigger whatsapp_client_cards_log
  before insert or update of ficha, resumen, modo
  on public.whatsapp_client_cards
  for each row
  execute function app_private.log_whatsapp_client_card();
