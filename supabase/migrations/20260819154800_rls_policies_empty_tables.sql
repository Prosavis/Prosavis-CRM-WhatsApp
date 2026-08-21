-- Advisor: RLS enabled without policies on three service_role-only tables.
-- Keep client roles denied; service_role still bypasses RLS.

revoke all on table public.crm_electronic_invoices from public, anon, authenticated;
grant select, insert, update, delete on table public.crm_electronic_invoices to service_role;

drop policy if exists crm_electronic_invoices_no_client on public.crm_electronic_invoices;
create policy crm_electronic_invoices_no_client
on public.crm_electronic_invoices
for all
to anon, authenticated
using (false)
with check (false);

revoke all on table public.whatsapp_ai_suggestion_log from public, anon, authenticated;
grant select, insert, update, delete on table public.whatsapp_ai_suggestion_log to service_role;

drop policy if exists whatsapp_ai_suggestion_log_no_client on public.whatsapp_ai_suggestion_log;
create policy whatsapp_ai_suggestion_log_no_client
on public.whatsapp_ai_suggestion_log
for all
to anon, authenticated
using (false)
with check (false);

revoke all on table public.whatsapp_conversation_ai_memory from public, anon, authenticated;
grant select, insert, update, delete on table public.whatsapp_conversation_ai_memory to service_role;

drop policy if exists whatsapp_conversation_ai_memory_no_client on public.whatsapp_conversation_ai_memory;
create policy whatsapp_conversation_ai_memory_no_client
on public.whatsapp_conversation_ai_memory
for all
to anon, authenticated
using (false)
with check (false);
