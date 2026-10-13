-- Fase 1: solo fijos 606 de Pereira, Dosquebradas, Cerritos y Santa Rosa.
-- Cartago (602) y los celulares quedan fuera. fallo_tecnico entra al resultado.

alter table public.outreach_calls drop constraint if exists outreach_calls_outcome_chk;

alter table public.outreach_calls
  add constraint outreach_calls_outcome_chk check (
    outcome is null or outcome in (
      'no_contesta', 'buzon', 'ocupado', 'ivr', 'numero_equivocado',
      'fuera_cobertura', 'no_interesado', 'no_llamar', 'rellamar', 'referido',
      'calificado_email', 'calificado_whatsapp', 'cortada', 'fallo_tecnico'
    )
  );

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
  sources text[],
  ciiu text,
  call_status text,
  intento integer
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
    l.sources,
    l.ciiu,
    l.call_status,
    jsonb_array_length(coalesce(l.call_attempts, '[]'::jsonb)) + 1
  from public.outreach_leads l
  where l.call_status in ('pendiente', 'en_cola', 'rellamar')
    and l.call_e164 not in ('+573112121108', '+573122531271')
    and (
      (
        l.call_e164 like '+57606%'
        and lower(translate(coalesce(l.municipio, ''), 'áéíóúÁÉÍÓÚñÑ', 'aeiouAEIOUnN'))
          in ('pereira', 'dosquebradas', 'cerritos', 'santa rosa de cabal')
      )
      or (
        l.call_e164 like '+57602%'
        and lower(translate(coalesce(l.municipio, ''), 'áéíóúÁÉÍÓÚñÑ', 'aeiouAEIOUnN')) = 'cartago'
      )
    )
    and (l.next_call_at is null or l.next_call_at <= now())
    and (
      l.call_status = 'rellamar'
      or l.last_person_at is null
      or l.last_person_at < now() - interval '7 days'
    )
    and lower(translate(coalesce(l.name, ''), 'áéíóúÁÉÍÓÚñÑüÜ', 'aeiouAEIOUnNuU')) !~
      'coomeva|industrias om|megapolis|ingeomega|detektor|mfl eje cafetero|kua easy living|lockbox|galiciatelecom|alcaldia|gobernacion|municipio|instituto|e\\.s\\.e|institucion educativa|universidad tecnologica|empresas publicas|aguas y aguas|empresa social del estado'
    and (
      l.ciiu is null
      or left(regexp_replace(l.ciiu, '[^0-9]', '', 'g'), 4) not in ('8121', '8129', '8110')
    )
    and not public.is_contact_suppressed(l.call_e164, l.email)
    and (l.phone_key is null or not public.is_contact_suppressed('+57' || l.phone_key, null))
    and (l.last_wa_at is null or l.last_wa_at < now() - interval '90 days')
    and (
      nullif(btrim(l.nit), '') is null
      or not exists (
        select 1
        from public.outreach_calls c
        join public.outreach_leads sibling on sibling.id = c.lead_id
        where sibling.nit = l.nit
          and c.started_at >= (
            date_trunc('day', timezone('America/Bogota', now())) at time zone 'America/Bogota'
          )
      )
    )
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
          where lower(trim(tag.name)) in (
            'cliente', 'agendado', 'competencia', 'parar', 'bloqueado',
            'auxiliares', 'auxiliares desactivadas', 'equipo prosavis'
          )
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
  order by
    case left(regexp_replace(coalesce(l.ciiu, ''), '[^0-9]', '', 'g'), 4)
      when '6810' then 1 when '6820' then 1 when '7110' then 1
      when '4111' then 1 when '4112' then 1 when '5511' then 1 when '5519' then 1
      when '8621' then 2 when '8622' then 2 when '9602' then 2
      when '6910' then 2 when '6920' then 2 when '7020' then 2
      when '8511' then 3 when '8512' then 3 when '9311' then 3
      else 4
    end,
    l.next_call_at nulls first,
    l.name nulls last
  limit greatest(1, least(coalesce(p_limit, 1), 20));
$$;

revoke execute on function public.list_outreach_call_eligible(integer) from public, anon, authenticated;
grant execute on function public.list_outreach_call_eligible(integer) to service_role;
