-- Libro de cada llamada de modelo de Sofía. Lo escribe el service role.
-- El gasto anterior a esta tabla está en la consola de Anthropic: estas filas no lo reconstruyen.

create table if not exists public.sofia_llm_usage (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  model text not null,
  purpose text not null,
  run_id text,
  input_tokens integer not null default 0,
  output_tokens integer not null default 0,
  cost_usd numeric(12, 6) not null default 0,
  created_at timestamptz not null default now(),
  constraint sofia_llm_usage_purpose_check
    check (purpose in ('diagnosis', 'exam', 'reviewer', 'triage')),
  constraint sofia_llm_usage_tokens_check
    check (input_tokens >= 0 and output_tokens >= 0 and cost_usd >= 0)
);

create index if not exists sofia_llm_usage_created_idx
  on public.sofia_llm_usage (created_at desc);

alter table public.sofia_llm_usage enable row level security;
revoke all on table public.sofia_llm_usage from public, anon, authenticated;
grant select, insert on table public.sofia_llm_usage to service_role;

create or replace function public.sofia_llm_cost_summary(p_from date, p_to date)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  result jsonb;
begin
  if p_from is null or p_to is null or p_to < p_from or p_to - p_from > 366 then
    raise exception 'rango invalido' using errcode = '22023';
  end if;

  with grouped as (
    select
      provider,
      purpose,
      (created_at at time zone 'America/Bogota')::date as dia,
      sum(input_tokens)::bigint as input_tokens,
      sum(output_tokens)::bigint as output_tokens,
      round(sum(cost_usd), 6) as cost_usd,
      count(*)::int as llamadas
    from public.sofia_llm_usage
    where (created_at at time zone 'America/Bogota')::date between p_from and p_to
    group by provider, purpose, (created_at at time zone 'America/Bogota')::date
  )
  select jsonb_build_object(
    'desde', p_from,
    'hasta', p_to,
    'total_usd', coalesce((select round(sum(cost_usd), 6) from grouped), 0),
    'filas', coalesce((
      select jsonb_agg(to_jsonb(grouped) order by dia, provider, purpose) from grouped
    ), '[]'::jsonb),
    'nota', 'Solo cuenta llamadas hechas después de crear sofia_llm_usage. Lo anterior está en la consola de Anthropic.'
  ) into result;

  return result;
end;
$$;

revoke all on function public.sofia_llm_cost_summary(date, date) from public, anon, authenticated;
grant execute on function public.sofia_llm_cost_summary(date, date) to service_role;
