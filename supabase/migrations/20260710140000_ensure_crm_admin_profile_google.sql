-- Google OAuth admin bootstrap for CRM WhatsApp
-- Allowlisted emails can upsert their own admin_profiles after Google sign-in.

create or replace function public.ensure_crm_admin_profile()
returns public.admin_profiles
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_email text;
  v_display_name text;
  v_role text;
  v_row public.admin_profiles;
begin
  if v_uid is null then
    raise exception 'not authenticated';
  end if;

  v_email := lower(coalesce(auth.jwt() ->> 'email', ''));
  if v_email not in (
    'admin@prosavis.com',
    'support@prosavis.com',
    'oliverafrancy@gmail.com'
  ) then
    raise exception 'not authorized';
  end if;

  v_display_name := coalesce(
    nullif(auth.jwt() -> 'user_metadata' ->> 'full_name', ''),
    nullif(auth.jwt() -> 'user_metadata' ->> 'name', ''),
    split_part(v_email, '@', 1)
  );

  v_role := case
    when v_email in ('admin@prosavis.com', 'support@prosavis.com') then 'super_admin'
    else 'admin'
  end;

  insert into public.admin_profiles as ap (id, email, display_name, role, is_active)
  values (v_uid, v_email, v_display_name, v_role, true)
  on conflict (id) do update
    set email = excluded.email,
        display_name = coalesce(excluded.display_name, ap.display_name),
        role = excluded.role,
        is_active = true,
        updated_at = now()
  returning * into v_row;

  return v_row;
end;
$$;

revoke all on function public.ensure_crm_admin_profile() from public;
grant execute on function public.ensure_crm_admin_profile() to authenticated;
