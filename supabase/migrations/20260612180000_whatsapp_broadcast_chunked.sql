-- Envío masivo WhatsApp reanudable por lotes:
--  - message_payload en el job (config del mensaje para continuar/reintentar sin reenviarla)
--  - whatsapp_broadcast_recipients: estado por destinatario (pending/sent/failed/skipped)
--  - broadcast_job_counts: conteos para refrescar el job tras cada lote
-- Permite trocear el envío en varias invocaciones (cada una < 150s) y saber
-- exactamente a quién se le envió y a quién no, para reintentar los que faltan.

alter table public.whatsapp_broadcast_jobs
  add column if not exists message_payload jsonb not null default '{}'::jsonb,
  add column if not exists last_progress_at timestamptz;

create table if not exists public.whatsapp_broadcast_recipients (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.whatsapp_broadcast_jobs(id) on delete cascade,
  phone text not null,
  name text,
  -- pending: aún por intentar | sent: entregado a Meta | failed: error | skipped: inválido/bloqueado/opt-out
  status text not null default 'pending',
  attempts integer not null default 0,
  error_message text,
  wa_message_id text,
  processed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists whatsapp_broadcast_recipients_job_phone_uidx
  on public.whatsapp_broadcast_recipients (job_id, phone);
create index if not exists whatsapp_broadcast_recipients_job_status_idx
  on public.whatsapp_broadcast_recipients (job_id, status);

alter table public.whatsapp_broadcast_recipients enable row level security;

drop policy if exists "CRM admins manage broadcast recipients" on public.whatsapp_broadcast_recipients;
create policy "CRM admins manage broadcast recipients"
on public.whatsapp_broadcast_recipients for all to authenticated
using (app_private.is_crm_admin()) with check (app_private.is_crm_admin());

drop trigger if exists set_whatsapp_broadcast_recipients_updated_at on public.whatsapp_broadcast_recipients;
create trigger set_whatsapp_broadcast_recipients_updated_at
before update on public.whatsapp_broadcast_recipients
for each row execute function public.set_updated_at();

-- Conteos por estado para refrescar el job (lo invoca la Edge Function con service role).
create or replace function public.broadcast_job_counts(p_job_id uuid)
returns jsonb
language sql
stable
as $$
  select jsonb_build_object(
    'pending', count(*) filter (where status = 'pending'),
    'sent', count(*) filter (where status = 'sent'),
    'failed', count(*) filter (where status = 'failed'),
    'skipped', count(*) filter (where status = 'skipped'),
    'total', count(*)
  )
  from public.whatsapp_broadcast_recipients
  where job_id = p_job_id;
$$;

grant execute on function public.broadcast_job_counts(uuid) to authenticated, service_role;
