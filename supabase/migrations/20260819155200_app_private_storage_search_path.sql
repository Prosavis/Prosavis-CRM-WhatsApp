-- Remaining advisor hits: app_private storage-monitor helpers without search_path.
alter function app_private.storage_object_size(jsonb)
  set search_path = public, storage, pg_temp;
alter function app_private.storage_object_mimetype(jsonb, text)
  set search_path = public, storage, pg_temp;
alter function app_private.storage_mime_category(text)
  set search_path = public, storage, pg_temp;
alter function app_private.storage_monitor_thresholds()
  set search_path = public, pg_temp;
