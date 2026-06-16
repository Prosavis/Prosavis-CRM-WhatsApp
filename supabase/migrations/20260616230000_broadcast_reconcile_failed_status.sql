-- Reconciliación de fallos de ENTREGA en envíos masivos.
--
-- Problema: bulk-whatsapp-send marca un destinatario como 'sent' cuando la API de
-- Meta ACEPTA el POST (devuelve un wa_message_id). Pero la entrega real puede
-- fallar después de forma asíncrona (ventana de re-engagement, número inválido,
-- bloqueo del usuario, etc.). Ese fallo llega por webhook como status='failed' y
-- on-whatsapp-webhook actualizaba whatsapp_message_log y whatsapp_conversations
-- (de ahí el ícono rojo en el chat) pero NO whatsapp_broadcast_recipients ni los
-- conteos del job. Resultado: el envío masivo reportaba "enviado" mensajes que en
-- realidad nunca llegaron.
--
-- Solución:
--  - Índice por wa_message_id para enlazar el status del webhook con el destinatario.
--  - reconcile_broadcast_on_status(): al recibir un fallo de entrega, marca el
--    destinatario como 'failed' y recalcula los conteos del job afectado.
--  - Backfill: corrige envíos pasados cuyos destinatarios siguen como 'sent' pese
--    a que el mensaje terminó en 'failed'.

create index if not exists whatsapp_broadcast_recipients_wa_message_id_idx
  on public.whatsapp_broadcast_recipients (wa_message_id)
  where wa_message_id is not null;

create or replace function public.reconcile_broadcast_on_status(
  p_wa_message_id text,
  p_status text,
  p_error text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_wa_message_id is null or btrim(p_wa_message_id) = '' then
    return;
  end if;

  -- Solo reconciliamos fallos de entrega terminales. Los estados sent/delivered/read
  -- no degradan a un destinatario ya marcado como 'sent'.
  if p_status is distinct from 'failed' then
    return;
  end if;

  with updated as (
    update public.whatsapp_broadcast_recipients
    set status = 'failed',
        error_message = coalesce(nullif(btrim(p_error), ''), 'Entrega fallida reportada por WhatsApp'),
        processed_at = now()
    where wa_message_id = p_wa_message_id
      and status <> 'failed'
    returning job_id
  )
  update public.whatsapp_broadcast_jobs j
  set sent = c.sent,
      failed = c.failed,
      skipped = c.skipped
  from (
    select
      r.job_id,
      count(*) filter (where r.status = 'sent') as sent,
      count(*) filter (where r.status = 'failed') as failed,
      count(*) filter (where r.status = 'skipped') as skipped
    from public.whatsapp_broadcast_recipients r
    where r.job_id in (select distinct job_id from updated)
    group by r.job_id
  ) c
  where j.id = c.job_id;
end;
$$;

grant execute on function public.reconcile_broadcast_on_status(text, text, text)
  to authenticated, service_role;

-- ── Backfill: corregir envíos pasados ────────────────────────────────────────
-- Destinatarios marcados 'sent' cuyo mensaje terminó en 'failed' en el log.
update public.whatsapp_broadcast_recipients r
set status = 'failed',
    error_message = coalesce(
      nullif(btrim(r.error_message), ''),
      nullif(btrim(m.error_message), ''),
      'Entrega fallida reportada por WhatsApp'
    )
from public.whatsapp_message_log m
where r.wa_message_id is not null
  and r.wa_message_id = m.wa_message_id
  and r.status = 'sent'
  and m.status = 'failed';

-- Recalcular conteos de todos los jobs (idempotente).
update public.whatsapp_broadcast_jobs j
set sent = c.sent,
    failed = c.failed,
    skipped = c.skipped
from (
  select
    job_id,
    count(*) filter (where status = 'sent') as sent,
    count(*) filter (where status = 'failed') as failed,
    count(*) filter (where status = 'skipped') as skipped
  from public.whatsapp_broadcast_recipients
  group by job_id
) c
where j.id = c.job_id;
