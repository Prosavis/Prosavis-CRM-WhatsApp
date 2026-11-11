-- Cajón A: resumen persistido para la sugerencia.
-- No aplicar sin el OK de Nicolás. Después de aplicarla, la Edge lee las
-- columnas solo si CRM_DIRECTORY_NOTES_SUMMARY=1.

alter table public.crm_directory
  add column if not exists internal_notes_summary text,
  add column if not exists internal_notes_summary_at timestamptz;

create or replace function public.crm_directory_notes_summary(notes text)
returns text
language plpgsql
immutable
as $$
declare
  vigente text;
  diary text;
  piece text;
  blocks text[] := array[]::text[];
  last_blocks text[] := array[]::text[];
  kept text;
  start_at int;
begin
  if notes is null or btrim(notes) = '' then
    return null;
  end if;

  vigente := substring(notes from '^\[Vigente [^\]]*\][^\n]*');
  start_at := position('## Diario' in notes);
  if start_at = 0 then
    diary := '';
  else
    diary := substr(notes, start_at + length('## Diario'));
  end if;

  if btrim(diary) <> '' then
    foreach piece in array regexp_split_to_array(diary, E'\n') loop
      piece := btrim(piece);
      if piece like '### %' then
        blocks := blocks || piece;
      elsif array_length(blocks, 1) is not null and piece <> '' then
        blocks[array_length(blocks, 1)] := blocks[array_length(blocks, 1)] || E'\n' || piece;
      end if;
    end loop;
  end if;

  if array_length(blocks, 1) is not null then
    last_blocks := blocks[greatest(1, array_length(blocks, 1) - 2):array_length(blocks, 1)];
  end if;
  kept := array_to_string(last_blocks, E'\n\n');

  if coalesce(vigente, '') = '' and coalesce(kept, '') = '' then
    return null;
  end if;
  if coalesce(vigente, '') = '' then
    return kept;
  end if;
  if coalesce(kept, '') = '' then
    return vigente;
  end if;
  return vigente || E'\n\n' || kept;
end;
$$;

create or replace function public.crm_directory_refresh_notes_summary()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'INSERT' or new.internal_notes is distinct from old.internal_notes then
    new.internal_notes_summary := public.crm_directory_notes_summary(new.internal_notes);
    new.internal_notes_summary_at := now();
  end if;
  return new;
end;
$$;

drop trigger if exists crm_directory_notes_summary_trigger on public.crm_directory;

create trigger crm_directory_notes_summary_trigger
before insert or update of internal_notes on public.crm_directory
for each row
execute function public.crm_directory_refresh_notes_summary();
