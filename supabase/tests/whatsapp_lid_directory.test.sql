begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(7);

select ok(
  public.is_whatsapp_lid_identity('lid:CO.2284278722318211'),
  'internal lid: keys are LID identity'
);

select ok(
  public.is_whatsapp_lid_identity('CO.2284278722318211'),
  'raw Meta BSUID is LID identity'
);

select ok(
  not public.is_whatsapp_lid_identity('573001234567'),
  'E.164 mobile is not LID identity'
);

insert into public.whatsapp_conversations (
  stable_key,
  contact_name,
  whatsapp_profile_name,
  phone_number_id,
  last_message_text,
  last_message_at,
  state
)
values (
  'lid:CO.2284278722318211__1043086062223440',
  'Guadalupe',
  'Guadalupe',
  '1043086062223440',
  'Por la mañana por favor',
  '2026-09-10T10:10:00Z',
  'active'
);

select is(
  (
    select display_name
    from public.crm_directory
    where whatsapp_commercial_conversation_id = 'lid:CO.2284278722318211__1043086062223440'
  ),
  'Guadalupe',
  'commercial LID conversation creates a searchable directory name'
);

select ok(
  (
    select phone is null
    from public.crm_directory
    where whatsapp_commercial_conversation_id = 'lid:CO.2284278722318211__1043086062223440'
  ),
  'LID directory row does not store the BSUID as a phone'
);

update public.whatsapp_conversations
set last_message_text = 'Tienes disponibilidad para el sábado',
    last_message_at = '2026-09-10T10:12:00Z'
where stable_key = 'lid:CO.2284278722318211__1043086062223440';

select is(
  (
    select count(*)::integer
    from public.crm_directory
    where whatsapp_commercial_conversation_id = 'lid:CO.2284278722318211__1043086062223440'
       or display_name = 'Guadalupe'
  ),
  1,
  'later LID messages do not clone the directory row'
);

insert into public.whatsapp_conversations (
  stable_key,
  contact_name,
  phone_number_id,
  last_message_text,
  last_message_at,
  state
)
values (
  'lid:CO.9990001112223333',
  'LID Bot',
  '1035566289641219',
  'Hola',
  '2026-09-10T10:20:00Z',
  'active'
);

select is(
  (
    select display_name
    from public.crm_directory
    where whatsapp_conversation_id = 'lid:CO.9990001112223333'
  ),
  'LID Bot',
  'bot LID conversation also lands in directory'
);

select * from finish();
rollback;
