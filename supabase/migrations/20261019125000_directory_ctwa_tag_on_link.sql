-- La ficha que aparece después del clic no pasaba por copy_ctwa_to_directory.
-- El sync de etiquetas del inbox reemplaza tags y se llevaba anuncio-meta.

create or replace function public.copy_ctwa_when_directory_linked()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_clid text;
  v_source text;
  v_at timestamptz;
begin
  if nullif(btrim(coalesce(NEW.ctwa_clid, '')), '') is not null then
    return NEW;
  end if;
  if nullif(btrim(coalesce(NEW.whatsapp_conversation_id, '')), '') is null then
    return NEW;
  end if;

  select
    c.ctwa_clid,
    nullif(btrim(coalesce(c.ctwa_source_id, '')), ''),
    c.ctwa_captured_at
  into v_clid, v_source, v_at
  from public.whatsapp_conversations c
  where c.stable_key = NEW.whatsapp_conversation_id
    and nullif(btrim(coalesce(c.ctwa_clid, '')), '') is not null
  limit 1;

  if v_clid is null then
    return NEW;
  end if;

  update public.crm_directory d
  set
    ctwa_clid = v_clid,
    ctwa_source_id = v_source,
    ctwa_first_at = coalesce(v_at, now()),
    tags = case
      when 'anuncio-meta' = any (coalesce(d.tags, array[]::text[])) then d.tags
      else coalesce(d.tags, array[]::text[]) || array['anuncio-meta']
    end,
    updated_at = now()
  where d.id = NEW.id
    and d.ctwa_clid is null;

  return NEW;
end;
$$;

create or replace function public.keep_anuncio_meta_tag()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
begin
  if 'anuncio-meta' = any (coalesce(NEW.tags, array[]::text[])) then
    return NEW;
  end if;
  if exists (
    select 1
    from public.whatsapp_conversations c
    where nullif(btrim(coalesce(c.ctwa_clid, '')), '') is not null
      and (
        (
          nullif(btrim(coalesce(NEW.whatsapp_conversation_id, '')), '') is not null
          and c.stable_key = NEW.whatsapp_conversation_id
        )
        or (NEW.ctwa_clid is not null and c.ctwa_clid = NEW.ctwa_clid)
      )
  ) then
    NEW.tags := coalesce(NEW.tags, array[]::text[]) || array['anuncio-meta'];
  end if;
  return NEW;
end;
$$;

drop trigger if exists trg_copy_ctwa_when_directory_linked on public.crm_directory;
create trigger trg_copy_ctwa_when_directory_linked
  after insert or update of whatsapp_conversation_id on public.crm_directory
  for each row
  execute function public.copy_ctwa_when_directory_linked();

drop trigger if exists trg_keep_anuncio_meta_tag on public.crm_directory;
create trigger trg_keep_anuncio_meta_tag
  before insert or update of tags on public.crm_directory
  for each row
  execute function public.keep_anuncio_meta_tag();

-- Promo Octubre · WhatsApp, clic desde el 15 oct. No cambia el anuncio ya guardado.
update public.crm_directory d
set
  tags = coalesce(d.tags, array[]::text[]) || array['anuncio-meta'],
  updated_at = now()
from public.whatsapp_conversations c
where c.ctwa_source_id in (
    '120250397331720691',
    '120250397333590691',
    '120250397337640691',
    '120250397340930691'
  )
  and c.ctwa_captured_at >= '2026-10-15 00:00:00-05'
  and d.whatsapp_conversation_id = c.stable_key
  and d.ctwa_clid is not null
  and not ('anuncio-meta' = any (coalesce(d.tags, array[]::text[])));
