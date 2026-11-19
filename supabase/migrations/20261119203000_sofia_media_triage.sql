-- Triage de imágenes y documentos. No borra filas y no toca videos.
-- Las reglas fijas marcan lo obvio. Lo demás lo clasifica un modelo, aparte.

alter table public.whatsapp_message_log
  add column if not exists media_triage_label text,
  add column if not exists media_triage_reason text,
  add column if not exists media_triage_at timestamptz;

alter table public.whatsapp_message_log
  drop constraint if exists whatsapp_message_log_media_triage_label_check;

alter table public.whatsapp_message_log
  add constraint whatsapp_message_log_media_triage_label_check
  check (media_triage_label is null or media_triage_label in ('util', 'nuestro', 'ruido', 'duda'));

create index if not exists whatsapp_message_log_media_triage_idx
  on public.whatsapp_message_log (media_type, media_triage_label)
  where media_triage_label is null and media_type in ('image', 'document');

create or replace function public.sofia_media_triage_rules()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  stickers integer := 0;
  ours integer := 0;
  matched integer := 0;
  tiny integer := 0;
  dupes integer := 0;
begin
  update public.whatsapp_message_log
    set media_triage_label = 'ruido',
        media_triage_reason = 'sticker',
        media_triage_at = now()
    where media_triage_label is null and media_type = 'sticker';
  get diagnostics stickers = row_count;

  update public.whatsapp_message_log
    set media_triage_label = 'nuestro',
        media_triage_reason = 'documento enviado por nosotros',
        media_triage_at = now()
    where media_triage_label is null
      and media_type = 'document'
      and direction = 'outbound';
  get diagnostics ours = row_count;

  update public.whatsapp_message_log as inbound
    set media_triage_label = 'nuestro',
        media_triage_reason = 'mismo archivo que enviamos',
        media_triage_at = now()
    where inbound.media_triage_label is null
      and inbound.media_type = 'document'
      and inbound.direction = 'inbound'
      and inbound.filename is not null
      and exists (
        select 1 from public.whatsapp_message_log as outbound
        where outbound.direction = 'outbound'
          and outbound.media_type = 'document'
          and outbound.filename is not null
          and lower(outbound.filename) = lower(inbound.filename)
      );
  get diagnostics matched = row_count;
  ours := ours + matched;

  update public.whatsapp_message_log
    set media_triage_label = 'ruido',
        media_triage_reason = 'imagen muy pequena',
        media_triage_at = now()
    where media_triage_label is null
      and media_type = 'image'
      and size_bytes is not null
      and size_bytes < 8000;
  get diagnostics tiny = row_count;

  with dups as (
    select id
    from (
      select id, row_number() over (partition by media_id order by created_at) as n
      from public.whatsapp_message_log
      where media_id is not null
        and media_type in ('image', 'document', 'sticker')
    ) ranked
    where n > 1
  )
  update public.whatsapp_message_log
    set media_triage_label = 'ruido',
        media_triage_reason = 'archivo repetido',
        media_triage_at = now()
    where media_triage_label is null
      and id in (select id from dups);
  get diagnostics dupes = row_count;

  return jsonb_build_object(
    'stickers', stickers,
    'nuestros', ours,
    'pequenas', tiny,
    'repetidos', dupes
  );
end;
$$;

revoke all on function public.sofia_media_triage_rules() from public, anon, authenticated;
grant execute on function public.sofia_media_triage_rules() to service_role;
