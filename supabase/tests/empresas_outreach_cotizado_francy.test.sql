begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(15);

select has_function(
  'public',
  'empresas_outreach_has_cotizado_francy',
  array['text', 'text'],
  'cotizado-francy hold helper exists'
);

insert into public.whatsapp_chat_tags (id, name, archived)
values ('a1000000-0000-4000-8000-000000000001', 'Cotizado - Francy', false)
on conflict (id) do update set name = excluded.name, archived = false;

insert into public.crm_directory (
  id, full_name, display_name, phone, email, tags, source, channels
) values
  (
    'a2000000-0000-4000-8000-000000000001',
    'Dir tagged phone',
    'Dir tagged phone',
    '+573001991001',
    'dir.phone.cotizado@example.com',
    array['  COTIZADO - francy  '],
    'LEAD',
    array['WHATSAPP']
  ),
  (
    'a2000000-0000-4000-8000-000000000002',
    'Dir tagged email only',
    'Dir tagged email only',
    '+573001991002',
    'dir.email.cotizado@example.com',
    array['Cotizado - Francy'],
    'LEAD',
    array['EMAIL']
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
  '573001991003',
  '573001991003',
  '573001991003',
  'Conv tagged',
  array['a1000000-0000-4000-8000-000000000001'::uuid],
  'cotizado',
  now()
);

insert into public.outreach_leads (
  id, name, phone_key, email, wa_status, email_status, sources
) values
  (
    'a3000000-0000-4000-8000-000000000001',
    '!!! cotizado conv wa',
    '3001991003',
    'conv.tagged@example.com',
    'pending',
    'pending',
    array['test']
  ),
  (
    'a3000000-0000-4000-8000-000000000002',
    '!!! cotizado dir phone wa',
    '3001991001',
    'dir.phone.lead@example.com',
    'pending',
    'pending',
    array['test']
  ),
  (
    'a3000000-0000-4000-8000-000000000003',
    '!!! cotizado dir email',
    '3001991099',
    'dir.email.cotizado@example.com',
    'pending',
    'pending',
    array['test']
  ),
  (
    'a3000000-0000-4000-8000-000000000004',
    '!!! clean empresas lead',
    '3001991004',
    'clean.empresas@example.com',
    'pending',
    'pending',
    array['test']
  );

select ok(
  public.empresas_outreach_has_cotizado_francy('3001991003', null),
  'conversation tag_ids hold matches phone_key'
);

select ok(
  public.empresas_outreach_has_cotizado_francy('3001991001', null),
  'directory tags hold matches phone_key'
);

select ok(
  public.empresas_outreach_has_cotizado_francy(null, 'DIR.EMAIL.COTIZADO@example.com'),
  'directory tags hold matches email case-insensitively'
);

select ok(
  not public.empresas_outreach_has_cotizado_francy('3001991004', 'clean.empresas@example.com'),
  'untagged lead is not held'
);

select is(
  (
    select count(*)::int
    from public.list_empresas_outreach_wa_eligible(50)
    where id = 'a3000000-0000-4000-8000-000000000001'
  ),
  0,
  'WA list excludes conversation tagged Cotizado - Francy'
);

select is(
  (
    select count(*)::int
    from public.list_empresas_outreach_wa_eligible(50)
    where id = 'a3000000-0000-4000-8000-000000000002'
  ),
  0,
  'WA list excludes directory tagged Cotizado - Francy'
);

select is(
  (
    select count(*)::int
    from public.list_empresas_outreach_wa_eligible(50)
    where id = 'a3000000-0000-4000-8000-000000000004'
  ),
  1,
  'WA list still returns a clean pending mobile'
);

select is(
  (
    select count(*)::int
    from public.list_empresas_outreach_email_eligible(50)
    where id = 'a3000000-0000-4000-8000-000000000001'
  ),
  0,
  'email list excludes a phone_key that matches a tagged chat'
);

select is(
  (
    select count(*)::int
    from public.list_empresas_outreach_email_eligible(50)
    where id = 'a3000000-0000-4000-8000-000000000003'
  ),
  0,
  'email list excludes a lead whose email matches a tagged directory row'
);

select is(
  (
    select count(*)::int
    from public.list_empresas_outreach_email_eligible(50)
    where id = 'a3000000-0000-4000-8000-000000000004'
  ),
  1,
  'email list still returns a clean pending address'
);

create temp table pool_before as
select * from public.count_empresas_outreach_pool();

insert into public.crm_directory (
  id, full_name, display_name, phone, email, tags, source, channels
) values (
  'a2000000-0000-4000-8000-000000000005',
  'Dir tagged extra pool',
  'Dir tagged extra pool',
  '+573001991007',
  'dir.extra.cotizado@example.com',
  array['Cotizado - Francy'],
  'LEAD',
  array['WHATSAPP']
);

insert into public.outreach_leads (
  id, name, phone_key, email, wa_status, email_status, sources
) values (
  'a3000000-0000-4000-8000-000000000005',
  '!!! cotizado extra pool',
  '3001991007',
  'should-not-count@example.com',
  'pending',
  'pending',
  array['test']
);

select is(
  (select whatsapp_pending from public.count_empresas_outreach_pool()),
  (select whatsapp_pending from pool_before),
  'WA pool count ignores an extra Cotizado - Francy lead'
);

select is(
  (select email_pending from public.count_empresas_outreach_pool()),
  (select email_pending from pool_before),
  'email pool count ignores an extra Cotizado - Francy lead'
);

insert into public.outreach_leads (
  id, name, phone_key, email, wa_status, email_status, sources
) values (
  'a3000000-0000-4000-8000-000000000006',
  '!!! clean extra pool',
  '3001991006',
  'clean.extra.pool@example.com',
  'pending',
  'pending',
  array['test']
);

select is(
  (select whatsapp_pending from public.count_empresas_outreach_pool()),
  (select whatsapp_pending from pool_before) + 1,
  'WA pool count still grows for an untagged lead'
);

select is(
  (select email_pending from public.count_empresas_outreach_pool()),
  (select email_pending from pool_before) + 1,
  'email pool count still grows for an untagged lead'
);

select * from finish();
