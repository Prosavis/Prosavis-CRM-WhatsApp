-- Los triggers de autoría y primera respuesta corren con el rol que inserta
-- (service_role, authenticated), que no tiene USAGE sobre app_private.
-- La contabilidad nunca debe frenar un envío: si falla, solo deja un warning.

create or replace function app_private.set_message_author_kind()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.direction is distinct from 'outbound' then
    new.author_kind := null;
    return new;
  end if;
  if new.author_kind is null then
    new.author_kind := app_private.derive_author_kind(
      new.sent_via,
      new.sender_type,
      new.agent_uid
    );
  end if;
  return new;
exception when others then
  raise warning 'set_message_author_kind skipped: %', sqlerrm;
  return new;
end;
$$;

create or replace function app_private.on_message_response_episode()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  begin
    perform app_private.apply_response_episode(
      new.id,
      new.conversation_stable_key,
      new.direction,
      new.sender_type,
      new.author_kind,
      new.created_at,
      new.phone_number_id,
      new.status,
      new.campaign_type,
      coalesce(new.hidden_from_panel, false)
    );
  exception when others then
    raise warning 'apply_response_episode skipped for %: %', new.id, sqlerrm;
  end;
  return new;
end;
$$;

create or replace function app_private.mark_suggestion_author()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  message_id uuid;
begin
  if new.sent_text is null or btrim(new.sent_text) = '' then
    return new;
  end if;
  if tg_op = 'UPDATE' and old.sent_text is not distinct from new.sent_text then
    return new;
  end if;

  begin
    update public.whatsapp_message_log as log
    set author_kind = 'sugerencia_ia'
    where log.id = (
      select candidate.id
      from public.whatsapp_message_log as candidate
      where candidate.conversation_stable_key = new.stable_key
        and candidate.direction = 'outbound'
        and candidate.sent_via = 'crm'
        and candidate.message_body = new.sent_text
        and candidate.created_at >= coalesce(new.closed_at, now()) - interval '15 minutes'
        and candidate.created_at <= coalesce(new.closed_at, now()) + interval '2 minutes'
      order by candidate.created_at desc
      limit 1
    )
    returning log.id into message_id;

    if message_id is not null then
      update public.whatsapp_response_episodes
      set first_real_by = 'sugerencia_ia'
      where first_real_message_id = message_id
        and first_real_by = 'persona';
    end if;
  exception when others then
    raise warning 'mark_suggestion_author skipped: %', sqlerrm;
  end;
  return new;
end;
$$;
