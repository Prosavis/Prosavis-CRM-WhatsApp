SELECT indexname, indexdef FROM pg_indexes WHERE tablename = 'crm_directory' AND indexname LIKE '%phone%';
SELECT proname FROM pg_proc WHERE proname = 'upsert_directory_entry';
