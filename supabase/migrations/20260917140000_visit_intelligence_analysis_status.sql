-- Fichas vivas: cola explícita, progreso atómico y reanálisis del backlog actual.
-- No borra evidencia ni historial.

alter table public.visit_client_intelligence
  add column if not exists analysis_status text not null default 'pending';

alter table public.visit_client_intelligence
  drop constraint if exists visit_client_intelligence_analysis_status_check;
alter table public.visit_client_intelligence
  add constraint visit_client_intelligence_analysis_status_check check (
    analysis_status in ('pending', 'running', 'ready', 'failed')
  );

create index if not exists visit_client_intelligence_queue_idx
  on public.visit_client_intelligence (service_id, analysis_status, last_analyzed_at)
  where analysis_status in ('pending', 'failed') or dirty = true;

create index if not exists visit_client_intelligence_ready_idx
  on public.visit_client_intelligence (service_id, analysis_status, updated_at desc)
  where analysis_status = 'ready';

update public.visit_client_intelligence
set
  analysis_status = 'pending',
  dirty = true
where analysis_status is distinct from 'pending' or dirty is distinct from true;

create or replace function public.visit_intelligence_record_item(
  p_run_id uuid,
  p_outcome text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_run public.visit_intelligence_runs%rowtype;
  v_processed integer;
  v_failed integer;
  v_done integer;
begin
  if p_outcome not in ('processed', 'failed') then
    raise exception 'outcome must be processed or failed';
  end if;

  select * into v_run
  from public.visit_intelligence_runs
  where id = p_run_id
  for update;

  if not found then
    raise exception 'run not found';
  end if;

  v_processed := v_run.processed_count + case when p_outcome = 'processed' then 1 else 0 end;
  v_failed := v_run.failed_count + case when p_outcome = 'failed' then 1 else 0 end;
  v_done := v_processed + v_failed;

  if v_done > v_run.batch_size then
    raise exception 'run already complete';
  end if;

  update public.visit_intelligence_runs
  set
    processed_count = v_processed,
    failed_count = v_failed,
    status = case
      when v_done >= batch_size and v_processed = 0 then 'failed'
      when v_done >= batch_size then 'completed'
      else 'running'
    end,
    started_at = coalesce(started_at, now()),
    completed_at = case
      when v_done >= batch_size then now()
      else null
    end,
    error_message = case
      when v_done >= batch_size and v_processed = 0 then coalesce(error_message, 'Lote sin fichas listas')
      when v_done >= batch_size then null
      else error_message
    end,
    updated_at = now()
  where id = p_run_id
  returning * into v_run;

  return jsonb_build_object(
    'id', v_run.id,
    'status', v_run.status,
    'processed_count', v_run.processed_count,
    'failed_count', v_run.failed_count,
    'batch_size', v_run.batch_size,
    'completed_at', v_run.completed_at
  );
end;
$$;

revoke all on function public.visit_intelligence_record_item(uuid, text)
from public, anon, authenticated;
grant execute on function public.visit_intelligence_record_item(uuid, text) to service_role;
