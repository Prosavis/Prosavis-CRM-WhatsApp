-- Cold outreach: excluir Equipo/auxiliares aunque no tengan tag en directorio.
-- Incluye crm_team_members activos e inactivos (ex-empleadas desactivadas).
-- También classification decline/bloqueado y tag "failed to be sent".

create or replace function public.list_cold_app_user_outreach_eligible(
  p_limit integer default 5000,
  p_offset integer default 0
)
returns table (
  id uuid,
  phone text,
  phone_key text,
  display_name text,
  full_name text,
  app_user_id text,
  tags text[]
)
language sql
stable
security definer
set search_path = public
as $$
  with recent_outbound as (
    select distinct
      right(regexp_replace(coalesce(ml.conversation_stable_key, ''), '\D', '', 'g'), 10) as pk
    from public.whatsapp_message_log ml
    where ml.direction = 'outbound'
      and ml.created_at >= (now() - interval '7 days')
      and length(right(regexp_replace(coalesce(ml.conversation_stable_key, ''), '\D', '', 'g'), 10)) = 10
    union
    select distinct
      right(regexp_replace(coalesce(ml.recipient_phone, ''), '\D', '', 'g'), 10) as pk
    from public.whatsapp_message_log ml
    where ml.direction = 'outbound'
      and ml.created_at >= (now() - interval '7 days')
      and length(right(regexp_replace(coalesce(ml.recipient_phone, ''), '\D', '', 'g'), 10)) = 10
  ),
  blocked_keys as (
    select distinct
      right(regexp_replace(coalesce(b.phone, b.stable_key, b.bsuid, ''), '\D', '', 'g'), 10) as pk
    from public.whatsapp_blocklist b
    where length(right(regexp_replace(coalesce(b.phone, b.stable_key, b.bsuid, ''), '\D', '', 'g'), 10)) = 10
  ),
  team_keys as (
    -- Equipo Prosavis: activas y desactivadas (ya no están en el equipo).
    select distinct
      right(regexp_replace(coalesce(t.phone_number, ''), '\D', '', 'g'), 10) as pk,
      nullif(trim(t.user_id), '') as user_id
    from public.crm_team_members t
  )
  select
    d.id,
    d.phone,
    d.phone_key,
    d.display_name,
    d.full_name,
    d.app_user_id,
    d.tags
  from public.crm_directory d
  left join public.whatsapp_reactivation_preferences pref
    on pref.directory_id = d.id
  where d.is_app_user = true
    and d.status = 'active'
    and coalesce(d.opt_out, false) = false
    and d.active_sequence is distinct from 'REACTIVACION'
    and d.phone_key is not null
    and length(d.phone_key) = 10
    and d.phone_key like '3%'
    and d.phone is not null
    and nullif(trim(d.phone), '') is not null
    and coalesce(pref.reactivations_enabled, true) = true
    -- classification blacklist (decline / bloqueado), aunque tags estén vacíos
    and not (
      lower(trim(coalesce(d.classification, ''))) in ('decline', 'bloqueado', '🚫')
      or lower(coalesce(d.classification, '')) like '%decline%'
      or lower(coalesce(d.classification, '')) like '%bloqueado%'
    )
    and not exists (
      select 1
      from unnest(coalesce(d.tags, '{}'::text[])) t(tag)
      where lower(trim(t.tag)) in (
        'auxiliares', 'auxiliar', 'auxiliares desactivadas',
        'test', 'decline', 'bloqueado', '🚫',
        'marian', 'job', 'jobs', 'francy', 'entrevista', 'trabajo',
        'trabajo / cv', 'trabajo/cv',
        'empresas', 'empresa', 'cliente problemática', 'cliente problematica',
        'no priorizar',
        'fuera de cobertura', 'bogotá', 'bogota', 'quindío', 'quindio',
        'armenia', 'cartago', 'medellín', 'medellin', 'cali', 'barranquilla',
        'manizales', 'cerritos',
        -- fallos cold outreach (carpeta Negativos)
        'undeliverable meta',
        'bug uuid log (sin confirmación)',
        'failed to be sent',
        'cold falló: undeliverable meta',
        'cold falló: bug uuid log (sin confirmación)'
      )
    )
    -- Ex-empleadas / auxiliares en Equipo (incluso is_active=false)
    and not exists (
      select 1
      from team_keys tk
      where (tk.pk is not null and length(tk.pk) = 10 and tk.pk = d.phone_key)
         or (tk.user_id is not null and tk.user_id = d.app_user_id)
    )
    -- Tags de exclusión en conversación WA (si no están en directory.tags)
    and not exists (
      select 1
      from public.whatsapp_conversations c
      join public.whatsapp_chat_tags ct
        on ct.id = any (coalesce(c.tag_ids, '{}'::uuid[]))
      where right(
          regexp_replace(
            coalesce(c.phone_key, c.contact_phone, c.phone, c.stable_key, ''),
            '\D',
            '',
            'g'
          ),
          10
        ) = d.phone_key
        and lower(trim(ct.name)) in (
          'auxiliares', 'auxiliar', 'auxiliares desactivadas',
          'test', 'decline', 'bloqueado', '🚫',
          'marian', 'job', 'jobs', 'francy', 'entrevista', 'trabajo',
          'trabajo / cv', 'trabajo/cv'
        )
    )
    and not exists (
      select 1 from blocked_keys bk where bk.pk = d.phone_key
    )
    and not exists (
      select 1 from recent_outbound ro where ro.pk = d.phone_key
    )
  order by d.created_at asc nulls last, d.id asc
  limit case
    when p_limit is null then null
    else greatest(p_limit, 0)
  end
  offset greatest(coalesce(p_offset, 0), 0);
$$;
