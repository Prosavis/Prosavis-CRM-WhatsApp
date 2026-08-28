-- Semilla pequeña para e2e/local. NO incluir 3k filas aquí (rompe SQL CI).
-- El usuario e2e (`e2e@prosavis.local` / `e2e-local-only`) lo crea Playwright
-- (e2e/auth.setup.ts) vía Admin API + `admin_profiles`. No insertar auth.users aquí.
-- Para carga 3k/10k: `npx tsx scripts/audit/seed-perf.ts` o `supabase/seed-perf.sql`.

insert into public.whatsapp_conversations (
  stable_key,
  phone,
  contact_name,
  contact_phone,
  last_message_text,
  last_message_at,
  last_message_direction,
  unread_count,
  phone_number_id,
  state
)
values
  (
    '573001110001',
    '573001110001',
    'E2E Ana',
    '573001110001',
    'Hola, quiero agendar',
    now() - interval '2 minutes',
    'inbound',
    1,
    null,
    'active'
  ),
  (
    '573001110002',
    '573001110002',
    'E2E Bruno',
    '573001110002',
    'Gracias',
    now() - interval '1 hour',
    'inbound',
    0,
    null,
    'active'
  ),
  (
    '573001110003',
    '573001110003',
    'E2E Carla',
    '573001110003',
    '¿Tienen cupo hoy?',
    now() - interval '3 hours',
    'inbound',
    2,
    null,
    'active'
  )
on conflict (stable_key) do update
set
  contact_name = excluded.contact_name,
  contact_phone = excluded.contact_phone,
  last_message_text = excluded.last_message_text,
  last_message_at = excluded.last_message_at,
  last_message_direction = excluded.last_message_direction,
  unread_count = excluded.unread_count;

insert into public.whatsapp_message_log (
  conversation_stable_key,
  recipient_phone,
  direction,
  sender_type,
  message_body,
  status,
  created_at
)
select
  c.stable_key,
  c.phone,
  'inbound',
  'user',
  coalesce(c.last_message_text, 'mensaje e2e'),
  'delivered',
  coalesce(c.last_message_at, now())
from public.whatsapp_conversations c
where c.stable_key in ('573001110001', '573001110002', '573001110003')
  and not exists (
    select 1
    from public.whatsapp_message_log m
    where m.conversation_stable_key = c.stable_key
      and m.message_body = coalesce(c.last_message_text, 'mensaje e2e')
  );
