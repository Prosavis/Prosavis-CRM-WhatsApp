-- Marca de anuncio en la ficha. No cambia source. No manda nada a Meta.

alter table public.crm_directory
  add column if not exists ctwa_clid text,
  add column if not exists ctwa_source_id text,
  add column if not exists ctwa_first_at timestamptz;

comment on column public.crm_directory.ctwa_clid is
  'Primer ctwa_clid copiado del chat. No se pisa.';

create or replace function public.copy_ctwa_to_directory()
returns trigger
language plpgsql
set search_path to 'public', 'pg_temp'
as $$
declare
  v_digits text;
  v_key text;
begin
  if nullif(btrim(coalesce(NEW.ctwa_clid, '')), '') is null then
    return NEW;
  end if;
  if TG_OP = 'UPDATE' and nullif(btrim(coalesce(OLD.ctwa_clid, '')), '') is not null then
    return NEW;
  end if;

  v_digits := regexp_replace(coalesce(NEW.phone, NEW.contact_phone, ''), '\D', '', 'g');
  v_key := case when length(v_digits) >= 10 then right(v_digits, 10) else null end;

  update public.crm_directory d
  set
    ctwa_clid = NEW.ctwa_clid,
    ctwa_source_id = nullif(btrim(coalesce(NEW.ctwa_source_id, '')), ''),
    ctwa_first_at = coalesce(NEW.ctwa_captured_at, now()),
    tags = case
      when 'anuncio-meta' = any (coalesce(d.tags, array[]::text[])) then d.tags
      else coalesce(d.tags, array[]::text[]) || array['anuncio-meta']
    end,
    updated_at = now()
  where d.ctwa_clid is null
    and (
      (nullif(btrim(coalesce(NEW.stable_key, '')), '') is not null
        and d.whatsapp_conversation_id = NEW.stable_key)
      or (v_key is not null and d.phone_key = v_key)
    );

  return NEW;
end;
$$;

drop trigger if exists trg_zz_copy_ctwa_to_directory_insert on public.whatsapp_conversations;
create trigger trg_zz_copy_ctwa_to_directory_insert
  after insert on public.whatsapp_conversations
  for each row
  execute function public.copy_ctwa_to_directory();

drop trigger if exists trg_zz_copy_ctwa_to_directory_update on public.whatsapp_conversations;
create trigger trg_zz_copy_ctwa_to_directory_update
  after update of ctwa_clid on public.whatsapp_conversations
  for each row
  execute function public.copy_ctwa_to_directory();

with first_chat as (
  select distinct on (right(regexp_replace(coalesce(c.phone, c.contact_phone, ''), '\D', '', 'g'), 10))
    c.stable_key,
    c.ctwa_clid,
    nullif(btrim(coalesce(c.ctwa_source_id, '')), '') as ctwa_source_id,
    c.ctwa_captured_at,
    right(regexp_replace(coalesce(c.phone, c.contact_phone, ''), '\D', '', 'g'), 10) as phone_key
  from public.whatsapp_conversations c
  where nullif(btrim(coalesce(c.ctwa_clid, '')), '') is not null
    and length(regexp_replace(coalesce(c.phone, c.contact_phone, ''), '\D', '', 'g')) >= 10
  order by
    right(regexp_replace(coalesce(c.phone, c.contact_phone, ''), '\D', '', 'g'), 10),
    c.ctwa_captured_at asc nulls last
)
update public.crm_directory d
set
  ctwa_clid = first_chat.ctwa_clid,
  ctwa_source_id = first_chat.ctwa_source_id,
  ctwa_first_at = first_chat.ctwa_captured_at,
  tags = case
    when 'anuncio-meta' = any (coalesce(d.tags, array[]::text[])) then d.tags
    else coalesce(d.tags, array[]::text[]) || array['anuncio-meta']
  end,
  updated_at = now()
from first_chat
where d.ctwa_clid is null
  and (
    d.whatsapp_conversation_id = first_chat.stable_key
    or d.phone_key = first_chat.phone_key
  );
