-- Avisa a syncDirectoryAlgoliaWebhook cuando cambia un campo indexado.
-- La URL y el secreto viven en vault (no en este archivo). Si faltan, no hace nada.
-- pg_net es async: un fallo de Algolia no revierte la fila.

create or replace function public.notify_directory_algolia_sync()
returns trigger
language plpgsql
security definer
set search_path = public, net, vault
as $$
declare
  sync_url text;
  sync_secret text;
  payload jsonb;
  row_id text;
begin
  if TG_OP = 'UPDATE'
     and NEW.full_name is not distinct from OLD.full_name
     and NEW.display_name is not distinct from OLD.display_name
     and NEW.phone is not distinct from OLD.phone
     and NEW.email is not distinct from OLD.email
     and NEW.service_id is not distinct from OLD.service_id
     and NEW.provider_id is not distinct from OLD.provider_id
     and NEW.status is not distinct from OLD.status
     and NEW.classification is not distinct from OLD.classification
     and NEW.tags is not distinct from OLD.tags
  then
    return NEW;
  end if;

  select decrypted_secret into sync_url
  from vault.decrypted_secrets
  where name = 'directory_algolia_sync_url'
  limit 1;

  select decrypted_secret into sync_secret
  from vault.decrypted_secrets
  where name = 'directory_algolia_sync_secret'
  limit 1;

  if sync_url is null or sync_secret is null or length(sync_url) = 0 then
    return coalesce(NEW, OLD);
  end if;

  if TG_OP = 'DELETE' then
    row_id := OLD.id::text;
    payload := jsonb_build_object('op', 'DELETE', 'id', row_id);
  else
    row_id := NEW.id::text;
    payload := jsonb_build_object(
      'op', 'UPSERT',
      'id', row_id,
      'full_name', NEW.full_name,
      'display_name', NEW.display_name,
      'phone', NEW.phone,
      'email', NEW.email,
      'service_id', NEW.service_id,
      'provider_id', NEW.provider_id,
      'status', NEW.status,
      'classification', NEW.classification,
      'tags', coalesce(NEW.tags, '{}'::text[])
    );
  end if;

  begin
    perform net.http_post(
      url := sync_url,
      body := payload,
      params := '{}'::jsonb,
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-sync-secret', sync_secret
      ),
      timeout_milliseconds := 5000
    );
  exception
    when others then
      raise warning 'directory algolia sync skipped: %', sqlerrm;
  end;

  return coalesce(NEW, OLD);
end;
$$;

revoke all on function public.notify_directory_algolia_sync() from public, anon, authenticated;

drop trigger if exists crm_directory_algolia_sync on public.crm_directory;

create trigger crm_directory_algolia_sync
after insert or update or delete on public.crm_directory
for each row
execute function public.notify_directory_algolia_sync();
