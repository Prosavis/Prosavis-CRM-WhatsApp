-- Covering indexes for new FKs and revoke authenticated execute on write RPCs.
-- Writes stay on Edge Functions (service_role) after requireCrmAdmin.

create index if not exists data_processing_evidence_directory_idx
  on public.data_processing_evidence (directory_id);

create index if not exists document_analysis_results_job_idx
  on public.document_analysis_results (job_id);

create index if not exists job_application_documents_source_idx
  on public.job_application_documents (source_id);

create index if not exists job_application_sources_directory_idx
  on public.job_application_sources (directory_id);

create index if not exists job_applications_split_from_idx
  on public.job_applications (split_from_id);

create index if not exists job_candidate_evaluations_rubric_idx
  on public.job_candidate_evaluations (rubric_id);

revoke all on function public.ingest_job_application_from_directory(uuid, text, text, text, text, text, text) from public, anon, authenticated;
revoke all on function public.ingest_job_application_from_conversation(text, text, text, text, text) from public, anon, authenticated;
revoke all on function public.enqueue_whatsapp_media_for_application(uuid) from public, anon, authenticated;
revoke all on function public.transition_job_application_stage(uuid, text, text, text, text, text) from public, anon, authenticated;
revoke all on function public.assign_job_application(uuid, text, text, text, text) from public, anon, authenticated;
revoke all on function public.split_job_application(uuid, text, uuid[], text, text, text, text, text, text) from public, anon, authenticated;
revoke all on function public.merge_job_applications(uuid, uuid, text, text, text) from public, anon, authenticated;
revoke all on function public.link_job_application_hire(uuid, text, text, text, text, text) from public, anon, authenticated;
revoke all on function public.reconcile_job_hire_from_team_member(text, text, text, text, text) from public, anon, authenticated;
revoke all on function public.delete_job_application(uuid, text, text, text) from public, anon, authenticated;
revoke all on function public.job_applications_metrics(boolean) from public, anon, authenticated;
revoke all on function public.backfill_job_applications(boolean, text, integer) from public, anon, authenticated;

grant execute on function public.ingest_job_application_from_directory(uuid, text, text, text, text, text, text) to service_role;
grant execute on function public.ingest_job_application_from_conversation(text, text, text, text, text) to service_role;
grant execute on function public.enqueue_whatsapp_media_for_application(uuid) to service_role;
grant execute on function public.transition_job_application_stage(uuid, text, text, text, text, text) to service_role;
grant execute on function public.assign_job_application(uuid, text, text, text, text) to service_role;
grant execute on function public.split_job_application(uuid, text, uuid[], text, text, text, text, text, text) to service_role;
grant execute on function public.merge_job_applications(uuid, uuid, text, text, text) to service_role;
grant execute on function public.link_job_application_hire(uuid, text, text, text, text, text) to service_role;
grant execute on function public.reconcile_job_hire_from_team_member(text, text, text, text, text) to service_role;
grant execute on function public.delete_job_application(uuid, text, text, text) to service_role;
grant execute on function public.job_applications_metrics(boolean) to service_role;
grant execute on function public.backfill_job_applications(boolean, text, integer) to service_role;
