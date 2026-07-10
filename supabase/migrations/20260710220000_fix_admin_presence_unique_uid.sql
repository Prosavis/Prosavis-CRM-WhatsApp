-- One live presence row per admin: drop heartbeat duplicates, then enforce uniqueness.
delete from public.whatsapp_admin_presence
where id in (
  select id from (
    select id,
           row_number() over (
             partition by admin_uid
             order by last_seen_at desc nulls last, id desc
           ) as rn
    from public.whatsapp_admin_presence
    where admin_uid is not null
  ) ranked
  where rn > 1
);

delete from public.whatsapp_admin_presence where admin_uid is null;

alter table public.whatsapp_admin_presence
  alter column admin_uid set not null;

drop index if exists public.whatsapp_admin_presence_admin_uid_idx;

create unique index if not exists whatsapp_admin_presence_admin_uid_uidx
  on public.whatsapp_admin_presence (admin_uid);
