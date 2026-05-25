insert into auth.users (
  instance_id,
  id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  created_at,
  updated_at,
  raw_app_meta_data,
  raw_user_meta_data,
  is_super_admin
)
values (
  '00000000-0000-0000-0000-000000000000',
  '11111111-1111-1111-1111-111111111111',
  'authenticated',
  'authenticated',
  'admin@prosavis.local',
  crypt('Prosavis123!', gen_salt('bf')),
  now(),
  now(),
  now(),
  '{"provider":"email","providers":["email"]}',
  '{"name":"Admin Prosavis"}',
  false
)
on conflict (id) do update
set email = excluded.email,
    encrypted_password = excluded.encrypted_password,
    updated_at = now();

insert into auth.identities (
  id,
  user_id,
  provider_id,
  identity_data,
  provider,
  last_sign_in_at,
  created_at,
  updated_at
)
values (
  '11111111-1111-1111-1111-111111111111',
  '11111111-1111-1111-1111-111111111111',
  'admin@prosavis.local',
  '{"sub":"11111111-1111-1111-1111-111111111111","email":"admin@prosavis.local"}',
  'email',
  now(),
  now(),
  now()
)
on conflict (provider, provider_id) do nothing;

insert into public.admin_profiles (id, email, display_name, role, is_active)
values (
  '11111111-1111-1111-1111-111111111111',
  'admin@prosavis.local',
  'Admin Prosavis',
  'super_admin',
  true
)
on conflict (id) do update
set email = excluded.email,
    display_name = excluded.display_name,
    role = excluded.role,
    is_active = excluded.is_active;

insert into public.whatsapp_chat_tags (id, name, color, created_by)
values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1', 'Prioritario', '#f59e0b', '11111111-1111-1111-1111-111111111111'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2', 'Seguimiento', '#00a884', '11111111-1111-1111-1111-111111111111')
on conflict (id) do update
set name = excluded.name,
    color = excluded.color;

insert into public.platform_settings (key, value, updated_by)
values (
  'whatsapp_automation',
  '{"enabled":false,"geminiEnabled":false,"phase":"local-demo"}',
  '11111111-1111-1111-1111-111111111111'
)
on conflict (key) do update
set value = excluded.value,
    updated_by = excluded.updated_by,
    updated_at = now();

insert into public.whatsapp_conversations (
  stable_key,
  phone,
  state,
  contact_name,
  contact_phone,
  whatsapp_profile_name,
  last_message_text,
  last_message_at,
  last_message_direction,
  last_message_outbound_status,
  unread_count,
  phone_number_id,
  tag_ids,
  is_pinned
)
values
  (
    '573001112233',
    '573001112233',
    'active',
    'Laura Mejia',
    '+57 300 111 2233',
    'Laura M.',
    'Hola, quiero reprogramar mi cita',
    now() - interval '10 minutes',
    'inbound',
    null,
    2,
    'demo-phone-number-id',
    array['aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1']::uuid[],
    true
  ),
  (
    '573004445566',
    '573004445566',
    'active',
    'Carlos Ruiz',
    '+57 300 444 5566',
    'Carlos R.',
    'Perfecto, quedo atento',
    now() - interval '3 hours',
    'outbound',
    'read',
    0,
    'demo-phone-number-id',
    array['aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2']::uuid[],
    false
  ),
  (
    '573007778899',
    '573007778899',
    'escalated',
    'Diana Torres',
    '+57 300 777 8899',
    'Diana',
    'No pudimos entregar el ultimo mensaje',
    now() - interval '1 day',
    'outbound',
    'failed',
    0,
    'demo-phone-number-id',
    array[]::uuid[],
    false
  )
on conflict (stable_key) do update
set contact_name = excluded.contact_name,
    last_message_text = excluded.last_message_text,
    last_message_at = excluded.last_message_at,
    last_message_direction = excluded.last_message_direction,
    last_message_outbound_status = excluded.last_message_outbound_status,
    unread_count = excluded.unread_count,
    tag_ids = excluded.tag_ids,
    is_pinned = excluded.is_pinned;

insert into public.whatsapp_message_log (
  conversation_stable_key,
  recipient_phone,
  direction,
  sender_type,
  agent_uid,
  message_body,
  status,
  campaign_type,
  phone_number_id,
  created_at
)
values
  ('573001112233', '573001112233', 'inbound', 'user', null, 'Hola, quiero reprogramar mi cita', 'received', 'FOLLOW_UP', 'demo-phone-number-id', now() - interval '30 minutes'),
  ('573001112233', '573001112233', 'outbound', 'agent', '11111111-1111-1111-1111-111111111111', 'Claro Laura, tenemos agenda manana a las 10:00 a.m.', 'delivered', 'FOLLOW_UP', 'demo-phone-number-id', now() - interval '24 minutes'),
  ('573001112233', '573001112233', 'inbound', 'user', null, 'Me sirve, gracias', 'received', 'FOLLOW_UP', 'demo-phone-number-id', now() - interval '10 minutes'),
  ('573004445566', '573004445566', 'outbound', 'bot', null, 'Hola Carlos, te recordamos tu cita de control.', 'sent', 'REBOOKING', 'demo-phone-number-id', now() - interval '5 hours'),
  ('573004445566', '573004445566', 'outbound', 'bot', null, 'Hola Carlos, te recordamos tu cita de control.', 'delivered', 'REBOOKING', 'demo-phone-number-id', now() - interval '4 hours'),
  ('573004445566', '573004445566', 'outbound', 'bot', null, 'Hola Carlos, te recordamos tu cita de control.', 'read', 'REBOOKING', 'demo-phone-number-id', now() - interval '3 hours'),
  ('573004445566', '573004445566', 'inbound', 'user', null, 'Perfecto, quedo atento', 'received', 'REBOOKING', 'demo-phone-number-id', now() - interval '3 hours'),
  ('573007778899', '573007778899', 'outbound', 'agent', '11111111-1111-1111-1111-111111111111', 'Hola Diana, confirmamos tu solicitud.', 'failed', 'OTHER', 'demo-phone-number-id', now() - interval '1 day'),
  ('573007778899', '573007778899', 'outbound', 'agent', '11111111-1111-1111-1111-111111111111', 'Intentaremos contactarte nuevamente.', 'sent', 'OTHER', 'demo-phone-number-id', now() - interval '20 hours'),
  ('573001112233', '573001112233', 'outbound', 'agent', '11111111-1111-1111-1111-111111111111', 'Queda reprogramada. Te enviaremos recordatorio.', 'read', 'FOLLOW_UP', 'demo-phone-number-id', now() - interval '8 minutes');
