begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(11);

select is(
  public.directory_is_company_name('CENTRO DE ESTETICA AMARA SAS'),
  true,
  'SAS legal names count as companies'
);

select is(
  public.directory_is_company_name('Maria Gonzalez'),
  false,
  'person names are not company names'
);

insert into public.crm_directory (
  id, full_name, display_name, email, classification, tags, source, channels, metadata
) values (
  '31000000-0000-4000-8000-000000000001',
  'CENTRO DE ESTETICA AMARA SAS',
  'CENTRO DE ESTETICA AMARA SAS',
  'amara-identity-test@example.com',
  'email enviado',
  array['email enviado'],
  'LEAD',
  array['EMAIL'],
  jsonb_build_object('outreach', jsonb_build_object('nit', '999000111222', 'leadId', 'lead-amara'))
);

select is(
  public.upsert_directory_entry(
    jsonb_build_object(
      'phone', '+573001119901',
      'source', 'WHATSAPP',
      'channels', jsonb_build_array('WHATSAPP'),
      'full_name', 'Juan',
      'metadata', jsonb_build_object('outreach', jsonb_build_object('nit', '999000111222'))
    ),
    false,
    false
  ),
  '31000000-0000-4000-8000-000000000001'::uuid,
  'WhatsApp with same NIT merges into the email-only LEAD'
);

select is(
  (select phone_key from public.crm_directory where id = '31000000-0000-4000-8000-000000000001'),
  public.directory_phone_key('+573001119901'),
  'merged ficha keeps the WhatsApp mobile'
);

select is(
  (select email from public.crm_directory where id = '31000000-0000-4000-8000-000000000001'),
  'amara-identity-test@example.com',
  'merged ficha keeps the outreach email'
);

select is(
  (select full_name from public.crm_directory where id = '31000000-0000-4000-8000-000000000001'),
  'CENTRO DE ESTETICA AMARA SAS',
  'company legal name wins over WhatsApp push name'
);

insert into public.crm_directory (
  id, full_name, phone, source, channels
) values (
  '31000000-0000-4000-8000-000000000002',
  'WA stub unique email',
  '+573001119902',
  'WHATSAPP',
  array['WHATSAPP']
);

insert into public.crm_directory (
  id, full_name, email, source, channels, tags
) values (
  '31000000-0000-4000-8000-000000000003',
  'EMPRESA UNIQUE EMAIL SAS',
  'unique-email-merge@example.com',
  'LEAD',
  array['EMAIL'],
  array['email enviado']
);

select is(
  public.upsert_directory_entry(
    jsonb_build_object(
      'phone', '+573001119902',
      'email', 'unique-email-merge@example.com',
      'source', 'WHATSAPP',
      'channels', jsonb_build_array('WHATSAPP')
    ),
    false,
    false
  ),
  '31000000-0000-4000-8000-000000000003'::uuid,
  'unique email conflict merges WA stub into the LEAD'
);

select ok(
  not exists(select 1 from public.crm_directory where id = '31000000-0000-4000-8000-000000000002'),
  'WA stub is deleted after unique-email merge'
);

insert into public.crm_directory (id, full_name, email, source, channels) values
  ('31000000-0000-4000-8000-000000000004', 'GEMELAS DEMO SAS', 'gemela-a@example.com', 'LEAD', array['EMAIL']),
  ('31000000-0000-4000-8000-000000000005', 'GEMELAS DEMO SAS', 'gemela-b@example.com', 'LEAD', array['EMAIL']);

select lives_ok(
  $$
    SELECT public.upsert_directory_entry(
      jsonb_build_object(
        'phone', '+573001119903',
        'source', 'WHATSAPP',
        'channels', jsonb_build_array('WHATSAPP'),
        'full_name', 'GEMELAS DEMO SAS'
      ),
      false,
      false
    )
  $$,
  'ambiguous company name still inserts a WhatsApp row'
);

select is(
  (
    select count(*)::integer
    from public.crm_directory
    where id in (
      '31000000-0000-4000-8000-000000000004',
      '31000000-0000-4000-8000-000000000005'
    )
      and phone_key is null
  ),
  2,
  'two email-only LEADs with the same company name stay unmerged'
);

insert into public.crm_directory (
  id, full_name, email, source, channels, metadata
) values (
  '31000000-0000-4000-8000-000000000006',
  'REHIDRATA POOL SAS',
  'rehidrata-pool@example.com',
  'LEAD',
  array['EMAIL'],
  jsonb_build_object('outreach', jsonb_build_object('nit', '999000111333'))
);

insert into public.outreach_leads (
  id, name, email, nit, wa_status, email_status, crm_directory_id, sources, sectors
) values (
  '32000000-0000-4000-8000-000000000001',
  'REHIDRATA POOL SAS',
  'rehidrata-pool@example.com',
  '999000111333',
  'skipped_no_mobile',
  'sent',
  '31000000-0000-4000-8000-000000000006',
  array['test'],
  array['test']
);

update public.outreach_leads
set phone_key = '3001119904'
where id = '32000000-0000-4000-8000-000000000001';

select is(
  (select phone_key from public.crm_directory where id = '31000000-0000-4000-8000-000000000006'),
  '3001119904',
  'gaining a mobile in outreach_leads rehydrates the email-only ficha'
);

select * from finish();
rollback;
