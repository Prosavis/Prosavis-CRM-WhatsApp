-- Supervisada deja el borrador de todo el no leído del 312, no solo el de los últimos 10 minutos.
-- No envía. El límite de 5 por pasada evita que la función se corte a la mitad.

create or replace function app_private.sofia_draft_candidates(silence_floor int, silence_ceiling int)
returns table (stable_key text, anchor_message_id text)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select latest.stable_key, latest.anchor_message_id
  from (
    select distinct on (log.conversation_stable_key)
      log.conversation_stable_key as stable_key,
      log.id::text as anchor_message_id,
      log.direction,
      log.created_at
    from public.whatsapp_message_log as log
    where log.phone_number_id = '1035566289641219'
      and log.created_at >= now() - interval '24 hours'
    order by log.conversation_stable_key, log.created_at desc
  ) as latest
  join public.whatsapp_conversations as conv
    on conv.stable_key = latest.stable_key
  where silence_ceiling >= 0
    and latest.direction = 'inbound'
    and latest.created_at <= now() - make_interval(secs => greatest(silence_floor, 0))
    and conv.unread_count > 0
    and conv.phone_number_id = '1035566289641219'
    and conv.automated_inbound_disabled = false
    and (conv.sofia_muted_until is null or conv.sofia_muted_until < now())
    and not exists (
      select 1
      from public.sofia_pending_drafts as draft
      where draft.stable_key = latest.stable_key
    )
  order by latest.created_at asc
  limit 5;
$$;

revoke all on function app_private.sofia_draft_candidates(int, int) from public, anon, authenticated;
grant execute on function app_private.sofia_draft_candidates(int, int) to service_role;
