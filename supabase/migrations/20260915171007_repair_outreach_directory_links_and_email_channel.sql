-- Reparación pool↔Directorio (cierre empresas).
-- 1) Canal EMAIL en fichas ya enviadas por correo.
-- 2) Enlace histórico WA sent sin crm_directory_id.
--    - 502 único no-APP_USER, mismo teléfono: automático.
--    - 2 único APP_USER, mismo teléfono: solo FK, sin tocar ficha
--      (IMPOR CARMARI / MARISOL VANEGAS; musicales jj / Musicales JJ).
--    - 1 conflicto (CERTIEXPRESS): FK a la ficha Empresas del teléfono WA;
--      no se fusiona con el APP_USER de otro celular.
-- No altera last_wa_at / last_email_at.

create table if not exists public.outreach_directory_repair_log (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  action text not null,
  lead_id uuid,
  directory_id uuid,
  detail jsonb not null default '{}'::jsonb
);

alter table public.outreach_directory_repair_log enable row level security;
revoke all on public.outreach_directory_repair_log from public, anon, authenticated;

with targets as (
  select distinct d.id as directory_id
  from public.crm_directory d
  join public.outreach_leads o on o.crm_directory_id = d.id
  where o.email_status = 'sent'
    and not ('EMAIL' = any(coalesce(d.channels, '{}'::text[])))
),
upd as (
  update public.crm_directory d
  set
    channels = (
      select array_agg(distinct ch)
      from unnest(coalesce(d.channels, '{}'::text[]) || array['EMAIL']::text[]) as ch
    ),
    updated_at = now()
  from targets t
  where d.id = t.directory_id
  returning d.id
)
insert into public.outreach_directory_repair_log (action, directory_id, detail)
select 'add_email_channel', id, jsonb_build_object('reason', 'email_status=sent')
from upd;

with unlinked as (
  select id, phone_key, email, nit
  from public.outreach_leads
  where crm_directory_id is null
    and wa_status = 'sent'
),
pairs as (
  select
    u.id as lead_id,
    d.id as directory_id,
    d.source,
    (u.phone_key is not null and d.phone_key = u.phone_key) as phone_match
  from unlinked u
  join public.crm_directory d
    on (u.phone_key is not null and d.phone_key = u.phone_key)
    or (
      nullif(trim(u.email), '') is not null
      and lower(trim(d.email)) = lower(trim(u.email))
    )
    or (
      directory_normalize_nit(u.nit) is not null
      and directory_normalize_nit(
        coalesce(d.metadata->'outreach'->>'nit', d.document_number)
      ) = directory_normalize_nit(u.nit)
    )
),
cand as (
  select
    lead_id,
    count(distinct directory_id) as n,
    count(distinct directory_id) filter (where phone_match) as n_phone,
    bool_or(source ilike '%APP_USER%') as has_app_user
  from pairs
  group by lead_id
),
chosen as (
  select
    p.lead_id,
    (array_agg(p.directory_id))[1] as directory_id,
    case
      when c.has_app_user then 'unique_app_user_phone_reviewed'
      else 'unique_non_app_phone'
    end as reason
  from pairs p
  join cand c on c.lead_id = p.lead_id
  where c.n = 1
    and p.phone_match
  group by p.lead_id, c.has_app_user

  union all

  select
    p.lead_id,
    (array_agg(p.directory_id))[1] as directory_id,
    'multi_phone_only_reviewed' as reason
  from pairs p
  join cand c on c.lead_id = p.lead_id
  where c.n > 1
    and c.n_phone = 1
    and p.phone_match
  group by p.lead_id
),
upd as (
  update public.outreach_leads o
  set crm_directory_id = c.directory_id
  from chosen c
  where o.id = c.lead_id
    and o.crm_directory_id is null
  returning o.id as lead_id, o.crm_directory_id as directory_id, c.reason
)
insert into public.outreach_directory_repair_log (action, lead_id, directory_id, detail)
select 'link_wa_sent', lead_id, directory_id, jsonb_build_object('reason', reason)
from upd;
