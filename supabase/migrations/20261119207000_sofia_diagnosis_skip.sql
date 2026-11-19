-- Un chat cuyo JSON se corta deja de bloquear la cola. No borra la nota.
alter table public.whatsapp_study_chat_reviews
  add column if not exists diagnostico_error text;
