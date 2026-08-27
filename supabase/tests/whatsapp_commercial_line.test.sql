begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(15);

select has_column(
  'public',
  'crm_directory',
  'whatsapp_commercial_conversation_id',
  'directory stores the commercial sibling key'
);

select has_function(
  'public',
  'is_commercial_whatsapp_line',
  array['text'],
  'commercial line resolver exists'
);

select has_index(
  'public',
  'whatsapp_conversations',
  'uq_whatsapp_conversations_phone_key_line',
  'one conversation per customer and WhatsApp line'
);

select has_table(
  'public',
  'whatsapp_coex_health',
  'Coex health snapshots are persisted for monitoring'
);

select ok(
  public.is_commercial_whatsapp_line('1043086062223440'),
  '311 phone_number_id is commercial'
);

select ok(
  not public.is_commercial_whatsapp_line('1035566289641219'),
  '312 phone_number_id remains bot'
);

insert into public.whatsapp_chat_tags (id, name, archived)
values ('10000000-0000-4000-8000-000000000001', 'Comercial test', false);

insert into public.crm_directory (
  id,
  full_name,
  display_name,
  phone,
  address,
  classification,
  tags,
  source,
  channels
)
values (
  '20000000-0000-4000-8000-000000000001',
  'Nombre CRM canónico',
  'Nombre CRM canónico',
  '573001111111',
  'Dirección CRM canónica',
  'Agendado',
  array['Agendado'],
  'CRM_CLIENT',
  array['WHATSAPP']
);

insert into public.whatsapp_conversations (
  stable_key,
  phone,
  contact_phone,
  contact_name,
  phone_number_id,
  last_message_text,
  last_message_at
)
values (
  '573001111111__1043086062223440',
  '573001111111',
  '573001111111',
  'Nombre incorrecto de WhatsApp',
  '1043086062223440',
  'Mensaje comercial',
  '2026-08-27T12:00:00Z'
);

select is(
  (select full_name from public.crm_directory where id = '20000000-0000-4000-8000-000000000001'),
  'Nombre CRM canónico',
  'commercial conversation does not overwrite canonical name'
);

select is(
  (select address from public.crm_directory where id = '20000000-0000-4000-8000-000000000001'),
  'Dirección CRM canónica',
  'commercial conversation does not overwrite canonical address'
);

select is(
  (
    select whatsapp_commercial_conversation_id
    from public.crm_directory
    where id = '20000000-0000-4000-8000-000000000001'
  ),
  '573001111111__1043086062223440',
  'directory points to the commercial sibling'
);

update public.whatsapp_conversations
set tag_ids = array['10000000-0000-4000-8000-000000000001'::uuid]
where stable_key = '573001111111__1043086062223440';

select is(
  (
    select tags
    from public.crm_directory
    where id = '20000000-0000-4000-8000-000000000001'
  ),
  array['Agendado', 'Comercial test']::text[],
  'commercial tags are unioned into directory tags'
);

select is(
  (
    select classification
    from public.crm_directory
    where id = '20000000-0000-4000-8000-000000000001'
  ),
  'Agendado',
  'commercial tags do not replace canonical classification'
);

select lives_ok(
  $$
    insert into public.whatsapp_message_log (
      conversation_stable_key,
      recipient_phone,
      direction,
      sender_type,
      message_body,
      status,
      wa_message_id,
      phone_number_id
    )
    values (
      '573001111111__1043086062223440',
      '573001111111',
      'outbound',
      'app',
      'Eco desde Business App',
      'sent',
      'wamid.coex-test',
      '1043086062223440'
    )
  $$,
  'Coex app echoes are accepted by sender_type constraint'
);

select lives_ok(
  $$
    SELECT public.upsert_directory_entry(
      jsonb_build_object(
        'phone', '573009999001',
        'source', 'WHATSAPP',
        'channels', jsonb_build_array('WHATSAPP')
      ),
      false,
      false
    )
  $$,
  'upsert_directory_entry INSERT coalesces full_name when Meta sends no name'
);

select ok(
  exists (
    select 1
    from public.crm_directory
    where phone_key = public.directory_phone_key('573009999001')
      and full_name is not null
      and length(trim(full_name)) > 0
  ),
  'new WhatsApp phone without full_name still gets a directory name'
);

select lives_ok(
  $$
    insert into public.whatsapp_conversations (
      stable_key,
      phone,
      contact_phone,
      phone_number_id,
      last_message_text,
      last_message_at
    )
    values (
      '573009999002__1043086062223440',
      '573009999002',
      '573009999002',
      '1043086062223440',
      'Hola buena tarde',
      '2026-08-27T20:47:11Z'
    )
  $$,
  'new commercial conversation does not roll back when directory has no prior row'
);

select * from finish();
rollback;
