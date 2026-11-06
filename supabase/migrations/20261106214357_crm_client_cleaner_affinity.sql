-- Afinidad cliente ↔ auxiliar (v1). Mapa memberId → entrada por ficha de crm_directory.
-- Tabla aparte (no columna) para que select('*') de crm_directory no la exponga.
-- Solo service_role (Functions) lee y escribe; anon/authenticated sin grants ni políticas.

create table if not exists public.crm_client_cleaner_affinity (
  directory_id uuid not null references public.crm_directory (id) on delete cascade,
  member_id text not null check (length(trim(member_id)) > 0),
  entry jsonb not null check (jsonb_typeof(entry) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (directory_id, member_id)
);

-- Re-key y resúmenes por auxiliar (fase 2) filtran por member_id.
-- Sin GIN sobre entry: nadie busca dentro del jsonb; si la fase 2 filtra por
-- veredicto, basta un índice de expresión sobre (entry ->> 'verdict').
create index if not exists crm_client_cleaner_affinity_member_idx
  on public.crm_client_cleaner_affinity (member_id);

alter table public.crm_client_cleaner_affinity enable row level security;

revoke all on table public.crm_client_cleaner_affinity from public, anon, authenticated;
grant all on table public.crm_client_cleaner_affinity to service_role;

create or replace function public.crm_directory_set_cleaner_affinity(
  p_directory_id uuid,
  p_member_id text,
  p_entry jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_member_id text := btrim(coalesce(p_member_id, ''));
  v_map jsonb;
begin
  if p_directory_id is null then
    raise exception 'directory_id is required' using errcode = '22023';
  end if;
  if v_member_id = '' then
    raise exception 'member_id is required' using errcode = '22023';
  end if;

  if p_entry is null then
    delete from public.crm_client_cleaner_affinity
    where directory_id = p_directory_id
      and member_id = v_member_id;
  else
    if jsonb_typeof(p_entry) <> 'object' then
      raise exception 'entry must be a json object' using errcode = '22023';
    end if;
    if p_entry ? 'overrides' and jsonb_typeof(p_entry -> 'overrides') <> 'array' then
      raise exception 'entry.overrides must be a json array' using errcode = '22023';
    end if;
    if not exists (select 1 from public.crm_directory d where d.id = p_directory_id) then
      raise exception 'crm_directory % not found', p_directory_id using errcode = 'P0002';
    end if;

    insert into public.crm_client_cleaner_affinity as a (directory_id, member_id, entry)
    values (p_directory_id, v_member_id, p_entry)
    on conflict (directory_id, member_id) do update
      set entry = case
            when excluded.entry ? 'overrides' or not (a.entry ? 'overrides') then excluded.entry
            else excluded.entry || jsonb_build_object('overrides', a.entry -> 'overrides')
          end,
          updated_at = now();
  end if;

  select coalesce(jsonb_object_agg(a.member_id, a.entry), '{}'::jsonb)
  into v_map
  from public.crm_client_cleaner_affinity a
  where a.directory_id = p_directory_id;

  return v_map;
end;
$$;

create or replace function public.crm_directory_append_cleaner_affinity_override(
  p_directory_id uuid,
  p_member_id text,
  p_override jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_member_id text := btrim(coalesce(p_member_id, ''));
  v_entry jsonb;
begin
  if p_directory_id is null then
    raise exception 'directory_id is required' using errcode = '22023';
  end if;
  if v_member_id = '' then
    raise exception 'member_id is required' using errcode = '22023';
  end if;
  if p_override is null or jsonb_typeof(p_override) <> 'object' then
    raise exception 'override must be a json object' using errcode = '22023';
  end if;

  update public.crm_client_cleaner_affinity a
  set entry = a.entry || jsonb_build_object(
        'overrides',
        (
          select coalesce(jsonb_agg(o.value order by o.ord), '[]'::jsonb)
          from jsonb_array_elements(
            jsonb_build_array(p_override) ||
            case
              when jsonb_typeof(a.entry -> 'overrides') = 'array' then a.entry -> 'overrides'
              else '[]'::jsonb
            end
          ) with ordinality as o(value, ord)
          where o.ord <= 10
        )
      ),
      updated_at = now()
  where a.directory_id = p_directory_id
    and a.member_id = v_member_id
  returning a.entry into v_entry;

  return v_entry;
end;
$$;

create or replace function public.crm_directory_rekey_cleaner_affinity(
  p_from text,
  p_to text
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_from text := btrim(coalesce(p_from, ''));
  v_to text := btrim(coalesce(p_to, ''));
  v_touched integer := 0;
  r record;
begin
  if v_from = '' or v_to = '' or v_from = v_to then
    return 0;
  end if;

  for r in
    select src.directory_id, src.entry as src_entry, dst.entry as dst_entry
    from public.crm_client_cleaner_affinity src
    left join public.crm_client_cleaner_affinity dst
      on dst.directory_id = src.directory_id
     and dst.member_id = v_to
    where src.member_id = v_from
    for update of src
  loop
    if r.dst_entry is null then
      update public.crm_client_cleaner_affinity
      set member_id = v_to,
          updated_at = now()
      where directory_id = r.directory_id
        and member_id = v_from;
    else
      -- setAt es ISO: comparación byte a byte ("C"); null cuenta como el más viejo.
      -- Empate: se conserva la entrada que ya estaba en p_to.
      if coalesce(r.src_entry ->> 'setAt', '') collate "C"
         > coalesce(r.dst_entry ->> 'setAt', '') collate "C" then
        update public.crm_client_cleaner_affinity
        set entry = r.src_entry,
            updated_at = now()
        where directory_id = r.directory_id
          and member_id = v_to;
      end if;
      delete from public.crm_client_cleaner_affinity
      where directory_id = r.directory_id
        and member_id = v_from;
    end if;
    v_touched := v_touched + 1;
  end loop;

  return v_touched;
end;
$$;

create or replace function public.crm_directory_get_cleaner_affinity(
  p_directory_ids uuid[]
)
returns table (directory_id uuid, member_id text, entry jsonb)
language sql
stable
security definer
set search_path = public
as $$
  select a.directory_id, a.member_id, a.entry
  from public.crm_client_cleaner_affinity a
  where a.directory_id = any (coalesce(p_directory_ids, '{}'::uuid[]))
  order by a.directory_id, a.member_id;
$$;

revoke all on function public.crm_directory_set_cleaner_affinity(uuid, text, jsonb) from public, anon, authenticated;
revoke all on function public.crm_directory_append_cleaner_affinity_override(uuid, text, jsonb) from public, anon, authenticated;
revoke all on function public.crm_directory_rekey_cleaner_affinity(text, text) from public, anon, authenticated;
revoke all on function public.crm_directory_get_cleaner_affinity(uuid[]) from public, anon, authenticated;

grant execute on function public.crm_directory_set_cleaner_affinity(uuid, text, jsonb) to service_role;
grant execute on function public.crm_directory_append_cleaner_affinity_override(uuid, text, jsonb) to service_role;
grant execute on function public.crm_directory_rekey_cleaner_affinity(text, text) to service_role;
grant execute on function public.crm_directory_get_cleaner_affinity(uuid[]) to service_role;
