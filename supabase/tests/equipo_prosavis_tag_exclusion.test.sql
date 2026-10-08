begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(9);

select ok(
  app_private.metrics_is_test_contact(null, array['Equipo Prosavis']),
  'Equipo Prosavis tag counts as internal contact'
);

select ok(
  app_private.metrics_is_test_contact(null, array['  EQUIPO PROSAVIS  ']),
  'Equipo Prosavis matches case-insensitively and trimmed'
);

select ok(
  app_private.metrics_is_test_contact('Agendado, Equipo Prosavis', null),
  'Equipo Prosavis inside classification counts as internal contact'
);

select ok(
  app_private.metrics_is_test_contact(null, array['TEST']),
  'TEST still counts as internal contact'
);

select ok(
  not app_private.metrics_is_test_contact('Equipo', array['Prosavis', 'Agendado']),
  'partial tokens are not internal contacts'
);

insert into public.whatsapp_chat_tags (id, name, archived)
values ('e1000000-0000-4000-8000-000000000001', 'Equipo Prosavis', false)
on conflict (id) do update set name = excluded.name, archived = false;

insert into public.crm_directory (
  id, full_name, display_name, phone, tags, status, source, channels,
  is_app_user, app_user_id
) values
  (
    'e2000000-0000-4000-8000-000000000001',
    'Fixture equipo tag',
    'Fixture equipo tag',
    '+573009990101',
    array['Equipo Prosavis'],
    'active',
    'APP_USER',
    array['IN_APP'],
    true,
    'fixture-equipo-app-1'
  ),
  (
    'e2000000-0000-4000-8000-000000000002',
    'Fixture equipo chat',
    'Fixture equipo chat',
    '+573009990102',
    array[]::text[],
    'active',
    'APP_USER',
    array['IN_APP'],
    true,
    'fixture-equipo-app-2'
  ),
  (
    'e2000000-0000-4000-8000-000000000003',
    'Fixture cliente',
    'Fixture cliente',
    '+573009990103',
    array[]::text[],
    'active',
    'APP_USER',
    array['IN_APP'],
    true,
    'fixture-equipo-app-3'
  ),
  (
    'e2000000-0000-4000-8000-000000000004',
    'Fixture test tag',
    'Fixture test tag',
    '+573009990104',
    array['TEST'],
    'active',
    'APP_USER',
    array['IN_APP'],
    true,
    'fixture-equipo-app-4'
  );

insert into public.whatsapp_conversations (
  stable_key,
  phone,
  contact_phone,
  contact_name,
  tag_ids,
  last_message_text,
  last_message_at
) values (
  '573009990102',
  '573009990102',
  '573009990102',
  'Fixture equipo chat',
  array['e1000000-0000-4000-8000-000000000001'::uuid],
  'hola',
  now() - interval '30 days'
);

select ok(
  not exists (
    select 1
    from public.list_cold_app_user_outreach_eligible(null, 0)
    where id = 'e2000000-0000-4000-8000-000000000001'
  ),
  'cold outreach skips a directory row tagged Equipo Prosavis'
);

select ok(
  not exists (
    select 1
    from public.list_cold_app_user_outreach_eligible(null, 0)
    where id = 'e2000000-0000-4000-8000-000000000002'
  ),
  'cold outreach skips a contact whose chat is tagged Equipo Prosavis'
);

select ok(
  not exists (
    select 1
    from public.list_cold_app_user_outreach_eligible(null, 0)
    where id = 'e2000000-0000-4000-8000-000000000004'
  ),
  'cold outreach still skips TEST'
);

select ok(
  exists (
    select 1
    from public.list_cold_app_user_outreach_eligible(null, 0)
    where id = 'e2000000-0000-4000-8000-000000000003'
  ),
  'cold outreach keeps an untagged app user'
);

select finish();
rollback;
