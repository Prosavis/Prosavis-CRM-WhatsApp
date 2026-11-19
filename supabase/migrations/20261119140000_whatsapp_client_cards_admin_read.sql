-- S6: las fichas de clientas solo las lee el equipo del CRM.
-- Verificado el 19 nov 2026: las 4 cuentas activas de admin_profiles son
-- admin o super_admin, y no hay otras cuentas en auth.users.

drop policy if exists whatsapp_client_cards_read on public.whatsapp_client_cards;
create policy whatsapp_client_cards_read
  on public.whatsapp_client_cards
  for select
  to authenticated
  using ((select app_private.is_crm_admin()));

drop policy if exists whatsapp_client_card_reviews_read on public.whatsapp_client_card_reviews;
create policy whatsapp_client_card_reviews_read
  on public.whatsapp_client_card_reviews
  for select
  to authenticated
  using ((select app_private.is_crm_admin()));

drop policy if exists whatsapp_client_card_reviews_write on public.whatsapp_client_card_reviews;
create policy whatsapp_client_card_reviews_write
  on public.whatsapp_client_card_reviews
  for insert
  to authenticated
  with check ((select app_private.is_crm_admin()));

drop policy if exists whatsapp_client_card_reviews_update on public.whatsapp_client_card_reviews;
create policy whatsapp_client_card_reviews_update
  on public.whatsapp_client_card_reviews
  for update
  to authenticated
  using ((select app_private.is_crm_admin()))
  with check ((select app_private.is_crm_admin()));

-- El registro de cambios de la ficha era invisible para el equipo.
grant select on table public.whatsapp_client_card_events to authenticated;

drop policy if exists whatsapp_client_card_events_read on public.whatsapp_client_card_events;
create policy whatsapp_client_card_events_read
  on public.whatsapp_client_card_events
  for select
  to authenticated
  using ((select app_private.is_crm_admin()));
