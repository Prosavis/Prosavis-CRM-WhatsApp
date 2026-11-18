begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(7);

insert into public.whatsapp_conversations (
  stable_key, phone, contact_phone, phone_number_id, state
) values (
  '573009990188', '573009990188', '573009990188', '1035566289641219', 'active'
);

insert into public.whatsapp_message_log (
  conversation_stable_key, direction, sender_type, phone_number_id, message_body, created_at
) values (
  '573009990188', 'inbound', 'user', '1035566289641219', 'hola',
  '2026-11-14 22:55:00+00'
);

select is(
  (select line from public.whatsapp_response_episodes where stable_key = '573009990188'),
  '312',
  'el entrante abre un episodio en la 312'
);

insert into public.whatsapp_message_log (
  conversation_stable_key, direction, sender_type, sent_via, phone_number_id,
  message_body, campaign_type, created_at
) values (
  '573009990188', 'outbound', 'system', 'system', '1035566289641219',
  'menu', 'CTWA_MENU', '2026-11-14 22:55:20+00'
);

select is(
  (select author_kind from public.whatsapp_message_log where message_body = 'menu'),
  'automatica',
  'un saliente de sistema queda como automatica'
);

select ok(
  (select first_real_at is null and first_auto_at is not null
   from public.whatsapp_response_episodes where stable_key = '573009990188'),
  'el menu no cierra el reloj de la respuesta real'
);

insert into public.whatsapp_message_log (
  conversation_stable_key, direction, sender_type, sent_via, phone_number_id,
  message_body, created_at
) values (
  '573009990188', 'inbound', 'user', '1035566289641219', 'sigo esperando',
  '2026-11-17 18:00:00+00'
);

select is(
  (select count(*) from public.whatsapp_response_episodes where stable_key = '573009990188'),
  1::bigint,
  'sin respuesta real el reloj no se reabre'
);

insert into public.whatsapp_message_log (
  conversation_stable_key, direction, sender_type, sent_via, phone_number_id,
  message_body, created_at
) values (
  '573009990188', 'outbound', 'agent', 'crm', '1035566289641219',
  'buenas tardes', '2026-11-17 18:48:00+00'
);

select is(
  (select round(extract(epoch from (first_real_at - started_at)) / 3600)
   from public.whatsapp_response_episodes where stable_key = '573009990188'),
  68::numeric,
  'el caso del sabado mide unas 68 horas hasta la persona'
);

insert into public.whatsapp_message_log (
  conversation_stable_key, direction, sender_type, sent_via, phone_number_id,
  message_body, created_at
) values (
  '573009990188', 'inbound', 'user', '1035566289641219', 'otra vez',
  '2026-11-19 18:00:00+00'
);

select is(
  (select count(*) from public.whatsapp_response_episodes where stable_key = '573009990188'),
  2::bigint,
  'con respuesta real, 24 horas despues abre otro episodio'
);

select is(
  (
    select round((elem->>'mediana_real_seg')::numeric / 3600)
    from jsonb_array_elements(
      public.metrics_first_response(
        '2026-11-01', '2026-11-30', 'dow', '1035566289641219', false
      )->'filas'
    ) as elem
    where elem->>'bucket' = 'sabado'
  ),
  68::numeric,
  'la lectura por dia de la semana devuelve el sabado'
);

select * from finish();
rollback;
