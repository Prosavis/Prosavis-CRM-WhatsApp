-- Carga por lotes del pool crudo. No toca crm_directory.

create or replace function public.import_outreach_leads_batch(p_rows jsonb)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  insert into public.outreach_leads (
    name, phone_key, landline, email, address, municipio, nit, ciiu,
    matricula, organizacion, sectors, sources, wa_status, email_status, exclude_reason
  )
  select
    coalesce(nullif(trim(x.name), ''), ''),
    nullif(trim(x.phone_key), ''),
    nullif(trim(x.landline), ''),
    nullif(lower(trim(x.email)), ''),
    nullif(trim(x.address), ''),
    nullif(trim(x.municipio), ''),
    nullif(trim(x.nit), ''),
    nullif(trim(x.ciiu), ''),
    nullif(trim(x.matricula), ''),
    nullif(trim(x.organizacion), ''),
    coalesce(x.sectors, '{}'::text[]),
    coalesce(x.sources, '{}'::text[]),
    coalesce(nullif(trim(x.wa_status), ''), 'pending'),
    coalesce(nullif(trim(x.email_status), ''), 'pending'),
    nullif(trim(x.exclude_reason), '')
  from jsonb_to_recordset(p_rows) as x(
    name text,
    phone_key text,
    landline text,
    email text,
    address text,
    municipio text,
    nit text,
    ciiu text,
    matricula text,
    organizacion text,
    sectors text[],
    sources text[],
    wa_status text,
    email_status text,
    exclude_reason text
  )
  on conflict do nothing;

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

grant execute on function public.import_outreach_leads_batch(jsonb) to service_role;
