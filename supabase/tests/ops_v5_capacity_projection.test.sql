begin;

create extension if not exists pgtap with schema extensions;

select plan(6);

select has_function(
  'public',
  'replace_cleaner_availability_window',
  array['text', 'text', 'date', 'date', 'jsonb'],
  'capacity projection RPC exists'
);

select function_privs_are(
  'public',
  'replace_cleaner_availability_window',
  array['text', 'text', 'date', 'date', 'jsonb'],
  'service_role',
  array['EXECUTE'],
  'only service role executes capacity projection'
);

insert into public.crm_team_members (
  service_id,
  id,
  user_id,
  name,
  email
)
values (
  'service-capacity-test',
  'cleaner-capacity-test',
  'user-capacity-test',
  'Operaria Capacity',
  'capacity@example.test'
);

insert into public.cleaner_availability (
  service_id,
  cleaner_id,
  operational_date,
  offered_minutes,
  accepted_minutes,
  window_start,
  window_end
)
values (
  'service-capacity-test',
  'cleaner-capacity-test',
  '2026-08-07',
  120,
  120,
  '2026-08-07T08:00:00-05:00',
  '2026-08-07T10:00:00-05:00'
);

select is(
  public.replace_cleaner_availability_window(
    'service-capacity-test',
    'cleaner-capacity-test',
    '2026-08-07',
    '2026-08-08',
    jsonb_build_array(
      jsonb_build_object(
        'operational_date', '2026-08-07',
        'offered_minutes', 480,
        'accepted_minutes', 480,
        'window_start', '2026-08-07T08:00:00-05:00',
        'window_end', '2026-08-07T16:00:00-05:00',
        'unavailable_reason', 'none',
        'source', 'manual'
      ),
      jsonb_build_object(
        'operational_date', '2026-08-08',
        'offered_minutes', 0,
        'accepted_minutes', 0,
        'window_start', null,
        'window_end', null,
        'unavailable_reason', 'personal',
        'source', 'manual'
      )
    )
  ) ->> 'rows_applied',
  '2',
  'capacity projection replaces the complete window'
);

select is(
  (
    select accepted_minutes
    from public.cleaner_availability
    where service_id = 'service-capacity-test'
      and cleaner_id = 'cleaner-capacity-test'
      and operational_date = '2026-08-07'
  ),
  480,
  'existing capacity day is replaced'
);

select is(
  (
    select unavailable_reason
    from public.cleaner_availability
    where service_id = 'service-capacity-test'
      and cleaner_id = 'cleaner-capacity-test'
      and operational_date = '2026-08-08'
  ),
  'personal',
  'excluded day remains explicit with zero denominator'
);

select throws_ok(
  $$
    select public.replace_cleaner_availability_window(
      'service-capacity-test',
      'cleaner-capacity-test',
      '2026-08-07',
      '2026-08-08',
      '[{"operational_date":"2026-08-09","offered_minutes":60,"accepted_minutes":60}]'::jsonb
    )
  $$,
  'invalid availability row',
  'rows outside the requested window are rejected'
);

select * from finish();
rollback;
