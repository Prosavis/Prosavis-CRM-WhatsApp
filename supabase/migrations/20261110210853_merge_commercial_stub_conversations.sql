-- Four commercial threads were created with a 10-digit stable_key
-- (ensure-whatsapp-conversation-from-lead stored the raw phone and the 311
-- phone_number_id). uq_whatsapp_conversations_phone_key_line then rejected the
-- real "57...__1043086062223440" thread, so inbound messages for those customers
-- never landed. None of the stubs have messages. Replace each with the
-- canonical key and point directory links at it.

do $merge$
declare
  v_pnid constant text := '1043086062223440';
  r record;
  v_digits text;
  v_canonical text;
  v_bot_key text;
begin
  for r in
    select *
    from public.whatsapp_conversations
    where phone_number_id = v_pnid
      and position('__' in stable_key) = 0
      and not public.is_whatsapp_lid_identity(stable_key)
  loop
    if exists (
      select 1 from public.whatsapp_message_log m
      where m.conversation_stable_key = r.stable_key
    ) or exists (
      select 1 from public.whatsapp_message_log_archive m
      where m.conversation_stable_key = r.stable_key
    ) then
      raise exception 'stub % tiene mensajes; no se fusiona a ciegas', r.stable_key;
    end if;

    v_digits := regexp_replace(coalesce(r.phone, r.contact_phone, r.stable_key), '\D', '', 'g');
    if length(v_digits) = 10 and left(v_digits, 1) = '3' then
      v_digits := '57' || v_digits;
    end if;
    if v_digits !~ '^[0-9]{11,15}$' then
      raise exception 'stub % no se puede normalizar a E.164 (%)', r.stable_key, v_digits;
    end if;

    v_canonical := v_digits || '__' || v_pnid;
    v_bot_key := v_digits;

    update public.crm_directory
    set
      whatsapp_commercial_conversation_id = v_canonical,
      whatsapp_conversation_id = case
        when whatsapp_conversation_id = r.stable_key then
          case
            when exists (
              select 1 from public.whatsapp_conversations c
              where c.stable_key = v_bot_key
            ) then v_bot_key
            else v_canonical
          end
        else whatsapp_conversation_id
      end
    where whatsapp_commercial_conversation_id = r.stable_key
       or whatsapp_conversation_id = r.stable_key;

    update public.ctwa_voice_nudges
    set conversation_stable_key = v_canonical
    where conversation_stable_key = r.stable_key;
    update public.document_sources
    set conversation_stable_key = v_canonical
    where conversation_stable_key = r.stable_key;
    update public.job_application_sources
    set conversation_stable_key = v_canonical
    where conversation_stable_key = r.stable_key;
    update public.reminder_batch_items
    set conversation_stable_key = v_canonical
    where conversation_stable_key = r.stable_key;
    update public.whatsapp_ai_suggestion_log
    set stable_key = v_canonical
    where stable_key = r.stable_key;
    update public.whatsapp_blocklist
    set stable_key = v_canonical
    where stable_key = r.stable_key;
    update public.whatsapp_conversation_ai_memory
    set stable_key = v_canonical
    where stable_key = r.stable_key;
    update public.whatsapp_review_intent_judgments
    set conversation_stable_key = v_canonical
    where conversation_stable_key = r.stable_key;

    delete from public.whatsapp_conversations where stable_key = r.stable_key;

    if not exists (
      select 1 from public.whatsapp_conversations where stable_key = v_canonical
    ) then
      insert into public.whatsapp_conversations (
        stable_key,
        phone,
        contact_phone,
        contact_name,
        contact_name_locked,
        whatsapp_profile_name,
        contact_photo_url,
        admin_notes,
        assigned_to,
        tag_ids,
        metadata,
        state,
        phone_number_id,
        is_archived,
        is_pinned,
        automated_inbound_disabled
      ) values (
        v_canonical,
        v_digits,
        v_digits,
        r.contact_name,
        r.contact_name_locked,
        r.whatsapp_profile_name,
        r.contact_photo_url,
        r.admin_notes,
        r.assigned_to,
        r.tag_ids,
        r.metadata,
        coalesce(r.state, 'active'),
        v_pnid,
        r.is_archived,
        r.is_pinned,
        r.automated_inbound_disabled
      );
    end if;
  end loop;
end;
$merge$;

create or replace function app_private.reject_malformed_commercial_stable_key()
returns trigger
language plpgsql
set search_path = ''
as $fn$
declare
  v_customer text;
begin
  if new.phone_number_id is distinct from '1043086062223440' then
    return new;
  end if;

  v_customer := split_part(new.stable_key, '__', 1);
  if new.stable_key ~ '^[0-9]{11,15}__1043086062223440$'
     or public.is_whatsapp_lid_identity(new.stable_key)
     or public.is_whatsapp_lid_identity(v_customer) then
    return new;
  end if;

  raise exception
    'stable_key comercial inválido: %. Usa E.164 (11-15 dígitos) o LID, seguido de __1043086062223440.',
    new.stable_key
    using errcode = '23514';
end;
$fn$;

drop trigger if exists trg_reject_malformed_commercial_stable_key on public.whatsapp_conversations;
create trigger trg_reject_malformed_commercial_stable_key
  before insert or update of stable_key, phone_number_id
  on public.whatsapp_conversations
  for each row
  execute function app_private.reject_malformed_commercial_stable_key();

revoke all on function app_private.reject_malformed_commercial_stable_key() from public, anon, authenticated;
