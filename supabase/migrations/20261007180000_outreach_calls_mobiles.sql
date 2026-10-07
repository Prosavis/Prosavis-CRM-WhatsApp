-- La cola llama fijos de Risaralda y celulares. call_e164 guarda el número marcado.

alter table public.outreach_leads rename column landline_e164 to call_e164;

alter index outreach_leads_landline_e164_uidx rename to outreach_leads_call_e164_uidx;

drop function public.list_outreach_call_eligible(integer);

create function public.list_outreach_call_eligible(p_limit integer default 1)
returns table (
  id uuid,
  name text,
  call_e164 text,
  phone_key text,
  email text,
  municipio text,
  nit text,
  sources text[]
)
language sql
stable
security definer
set search_path = public
as $$
  select
    l.id,
    l.name,
    l.call_e164,
    l.phone_key,
    l.email,
    l.municipio,
    l.nit,
    l.sources
  from public.outreach_leads l
  where l.call_status in ('pendiente', 'en_cola', 'rellamar')
    and (l.call_e164 like '+57606%' or l.call_e164 like '+573%')
    and (l.next_call_at is null or l.next_call_at <= now())
    and (
      l.call_status = 'rellamar'
      or l.last_person_at is null
      or l.last_person_at < now() - interval '7 days'
    )
    and (
      l.municipio is null
      or btrim(l.municipio) = ''
      or lower(translate(l.municipio, 'áéíóúÁÉÍÓÚñÑ', 'aeiouAEIOUnN'))
        in ('pereira', 'dosquebradas', 'cerritos')
    )
    and not public.is_contact_suppressed(l.call_e164, l.email)
    and (l.phone_key is null or not public.is_contact_suppressed('+57' || l.phone_key, null))
    and (l.last_wa_at is null or l.last_wa_at < now() - interval '90 days')
    and not exists (
      select 1
      from public.crm_directory d
      where d.phone_key is not null
        and d.phone_key in (
          l.phone_key,
          right(regexp_replace(l.call_e164, '[^0-9]', '', 'g'), 10)
        )
        and exists (
          select 1
          from unnest(coalesce(d.tags, '{}'::text[])) as tag(name)
          where lower(trim(tag.name)) in ('cliente', 'agendado')
            or lower(trim(tag.name)) like 'cliente %'
        )
    )
    and not exists (
      select 1
      from public.bookings a
      where a.client_phone is not null
        and a.source_deleted_at is null
        and a.scheduled_start > now() - interval '180 days'
        and a.status not ilike '%cancel%'
        and right(regexp_replace(a.client_phone, '[^0-9]', '', 'g'), 10) in (
          l.phone_key,
          right(regexp_replace(l.call_e164, '[^0-9]', '', 'g'), 10)
        )
    )
    and not exists (
      select 1
      from public.whatsapp_conversations c
      where c.last_message_at > now() - interval '90 days'
        and c.phone_key is not null
        and c.phone_key in (
          l.phone_key,
          right(regexp_replace(l.call_e164, '[^0-9]', '', 'g'), 10)
        )
    )
  order by l.next_call_at nulls first, l.name nulls last
  limit greatest(1, least(coalesce(p_limit, 1), 20));
$$;

revoke execute on function public.list_outreach_call_eligible(integer) from public, anon, authenticated;
grant execute on function public.list_outreach_call_eligible(integer) to service_role;
