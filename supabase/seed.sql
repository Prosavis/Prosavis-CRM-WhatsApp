-- Seed exclusivamente local para `supabase db reset`.
-- No inserta conversaciones, mensajes, tags ni datos demo.
-- La operacion productiva debe poblarse solo con trafico real de Meta.

insert into auth.users (
  instance_id,
  id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  confirmation_token,
  recovery_token,
  email_change_token_new,
  email_change,
  email_change_token_current,
  phone_change,
  phone_change_token,
  reauthentication_token,
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
  'support@prosavis.com',
  crypt('Horizont28', gen_salt('bf')),
  now(),
  '',
  '',
  '',
  '',
  '',
  '',
  '',
  '',
  now(),
  now(),
  '{"provider":"email","providers":["email"]}',
  '{"name":"Soporte Prosavis"}',
  false
)
on conflict (id) do update
set email = excluded.email,
    encrypted_password = excluded.encrypted_password,
    email_confirmed_at = excluded.email_confirmed_at,
    raw_app_meta_data = excluded.raw_app_meta_data,
    raw_user_meta_data = excluded.raw_user_meta_data,
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
  'support@prosavis.com',
  '{"sub":"11111111-1111-1111-1111-111111111111","email":"support@prosavis.com","email_verified":true,"phone_verified":false}',
  'email',
  now(),
  now(),
  now()
)
on conflict (provider, provider_id) do nothing;

insert into public.admin_profiles (id, email, display_name, role, is_active)
values (
  '11111111-1111-1111-1111-111111111111',
  'support@prosavis.com',
  'Soporte Prosavis',
  'super_admin',
  true
)
on conflict (id) do update
set email = excluded.email,
    display_name = excluded.display_name,
    role = excluded.role,
    is_active = excluded.is_active;
