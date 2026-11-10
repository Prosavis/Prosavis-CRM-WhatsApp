begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(4);

select throws_ok(
  $$
    insert into public.whatsapp_conversations (
      stable_key, phone, contact_phone, phone_number_id, state
    ) values (
      '3009990099', '3009990099', '3009990099', '1043086062223440', 'active'
    )
  $$,
  '23514',
  'la línea comercial rechaza un stable_key de 10 dígitos'
);

select lives_ok(
  $$
    insert into public.crm_directory (
      id, full_name, display_name, phone, classification, tags, status, source, channels
    ) values (
      '52000000-0000-4000-8000-0000000000a1',
      'Hot Path',
      'Hot Path',
      '+573009990099',
      'user',
      array['Cliente']::text[],
      'active',
      'WHATSAPP_INBOUND',
      array['WHATSAPP']::text[]
    );
    insert into public.job_candidates (id, full_name, phone_key)
    values (
      '52000000-0000-4000-8000-0000000000a2',
      'Hot Path',
      '3009990099'
    );
    insert into public.job_applications (id, candidate_id, directory_id, cohort)
    values (
      '52000000-0000-4000-8000-0000000000a3',
      '52000000-0000-4000-8000-0000000000a2',
      '52000000-0000-4000-8000-0000000000a1',
      'job'
    );
    insert into public.job_application_sources (
      application_id, source_kind, conversation_stable_key
    ) values (
      '52000000-0000-4000-8000-0000000000a3',
      'conversation',
      '573009990099__1043086062223440'
    );
    insert into public.whatsapp_conversations (
      stable_key, phone, contact_phone, phone_number_id, state, last_message_at, last_message_text
    ) values (
      '573009990099__1043086062223440',
      '573009990099',
      '573009990099',
      '1043086062223440',
      'active',
      '2026-11-10T20:00:00Z',
      'hola'
    );
    update public.whatsapp_conversations
    set last_message_at = '2026-11-10T20:05:00Z', last_message_text = 'sigo aqui'
    where stable_key = '573009990099__1043086062223440';
    insert into public.whatsapp_message_log (
      conversation_stable_key, direction, message_body, wa_message_id, phone_number_id, created_at
    ) values (
      '573009990099__1043086062223440',
      'inbound',
      'sigo aqui',
      'wamid.hotpath.1',
      '1043086062223440',
      '2026-11-10T20:05:00Z'
    );
  $$,
  'un entrante con solicitud de empleo no aborta la conversación ni el log'
);

select ok(
  (
    select last_contact_at = '2026-11-10T20:05:00Z'::timestamptz
    from public.job_applications
    where id = '52000000-0000-4000-8000-0000000000a3'
  ),
  'last_contact_at sigue al último mensaje sin tumbar el webhook'
);

select lives_ok(
  $$
    insert into public.whatsapp_conversations (
      stable_key, phone_number_id, state
    ) values (
      'lid:CO.HOTPATH__1043086062223440',
      '1043086062223440',
      'active'
    )
  $$,
  'un hilo LID comercial sigue siendo válido'
);

select * from finish();
rollback;
