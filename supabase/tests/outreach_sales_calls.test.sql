begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(9);

select has_function(
  'public',
  'is_contact_suppressed',
  array['text', 'text'],
  'is_contact_suppressed exists'
);

select has_function(
  'public',
  'list_outreach_call_eligible',
  array['integer'],
  'list_outreach_call_eligible exists'
);

select has_view('public', 'outreach_call_funnel_daily', 'funnel view exists');

insert into public.outreach_leads (
  id, name, landline_e164, municipio, call_status, wa_status, email_status
) values
  (
    'c1000000-0000-4000-8000-000000000001',
    'Fijo Pereira',
    '+576063331111',
    'Pereira',
    'pendiente',
    'pending',
    'pending'
  ),
  (
    'c1000000-0000-4000-8000-000000000002',
    'Fuera de zona',
    '+576063332222',
    'Medellin',
    'pendiente',
    'pending',
    'pending'
  ),
  (
    'c1000000-0000-4000-8000-000000000003',
    'Fijo Bogota',
    '+576013334455',
    null,
    'pendiente',
    'pending',
    'pending'
  );

insert into public.contact_suppression (value, reason, source)
values ('+576063331111', 'test', 'llamada');

select is(
  public.is_contact_suppressed('+576063331111', null),
  true,
  'a suppressed landline is suppressed'
);

select is(
  public.is_contact_suppressed('+576069999999', null),
  false,
  'an unknown landline is not suppressed'
);

select is(
  (
    select count(*)::integer
    from public.list_outreach_call_eligible(20)
    where id = 'c1000000-0000-4000-8000-000000000001'
  ),
  0,
  'suppressed Pereira lead stays out of the queue'
);

delete from public.contact_suppression where value = '+576063331111';

select is(
  (
    select count(*)::integer
    from public.list_outreach_call_eligible(20)
    where id = 'c1000000-0000-4000-8000-000000000001'
  ),
  1,
  'Pereira landline enters the queue after suppression is removed'
);

select is(
  (
    select count(*)::integer
    from public.list_outreach_call_eligible(20)
    where id = 'c1000000-0000-4000-8000-000000000002'
  ),
  0,
  'Medellin landline stays out of the queue'
);

select is(
  (
    select count(*)::integer
    from public.list_outreach_call_eligible(20)
    where id = 'c1000000-0000-4000-8000-000000000003'
  ),
  0,
  'a Bogota landline stays out of the queue'
);

select * from finish();
rollback;
