// deno-lint-ignore-file no-explicit-any
import { NOTICE_VERSION } from './domain.ts';

type SupabaseClient = any;

export class JobApplicationsError extends Error {
  code: string;
  status: number;
  constructor(message: string, code = 'job_applications', status = 400) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

function bogotaDayStart(value: unknown, nextDay = false): string | null {
  const ymd = typeof value === 'string' ? value.trim() : '';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return null;
  const [year, month, day] = ymd.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day + (nextDay ? 1 : 0), 5, 0, 0)).toISOString();
}

function actorOf(profile: { id: string; email?: string | null }) {
  return {
    kind: 'supabase',
    id: profile.id,
    label: profile.email ?? profile.id,
  };
}

export async function listJobApplications(
  supabase: SupabaseClient,
  params: Record<string, unknown>,
) {
  const limit = Math.min(Math.max(Number(params.limit ?? 50), 1), 100);
  const offset = Math.max(Number(params.offset ?? 0), 0);
  const includeMarian = params.includeMarian === true;
  const stage = typeof params.stage === 'string' ? params.stage : null;
  const cohort = typeof params.cohort === 'string' ? params.cohort : null;
  const assignedTo = typeof params.assignedTo === 'string' ? params.assignedTo : null;
  const search = typeof params.search === 'string' ? params.search.trim() : '';
  const needsReview = params.needsReview === true || params.needsReview === 'true';
  const priorityOnly = params.priorityOnly === true || params.priorityOnly === 'true';
  const needsStageReview = params.needsStageReview === true || params.needsStageReview === 'true';
  const contactedFrom = bogotaDayStart(params.contactedFrom);
  const contactedTo = bogotaDayStart(params.contactedTo, true);
  const cv = params.cv === 'sent' || params.cv === 'missing' ? params.cv : null;
  const stages = Array.isArray(params.stages)
    ? params.stages.map((value) => String(value)).filter(Boolean)
    : [];

  let query = supabase
    .from('job_applications')
    .select(
      `
      id, cohort, stage, assigned_to, needs_review, review_reason, source_channel,
      origin_label, created_by_label, created_at, last_contact_at, hired_at, directory_id,
      team_member_id, team_member_service_id, interview_at, needs_stage_review,
      legacy_stage, fit_rank,
      candidate:job_candidates (
        id, full_name, phone, email, document_number, location_text
      ),
      directory:crm_directory (
        id, full_name, display_name, phone, photo_url, tags
      ),
      sources:job_application_sources (conversation_stable_key)
    `,
      { count: 'exact' },
    )
    .is('deleted_at', null)
    .range(offset, offset + limit - 1);

  query = query.order('last_contact_at', { ascending: false, nullsFirst: false });

  if (!includeMarian && !cohort) query = query.eq('cohort', 'job');
  if (cohort) query = query.eq('cohort', cohort);
  if (stages.length > 0) query = query.in('stage', stages);
  else if (stage) query = query.eq('stage', stage);
  if (assignedTo) query = query.eq('assigned_to', assignedTo);
  if (needsReview) query = query.eq('needs_review', true);
  if (priorityOnly) query = query.eq('fit_rank', 2);
  if (needsStageReview) query = query.eq('needs_stage_review', true);
  if (contactedFrom) query = query.gte('created_at', contactedFrom);
  if (contactedTo) query = query.lt('created_at', contactedTo);
  if (cv === 'sent') query = query.gte('fit_rank', 1);
  if (cv === 'missing') query = query.eq('fit_rank', 0);

  const { data, error, count } = await query;
  if (error) throw new JobApplicationsError(error.message, 'query', 500);

  let items = data ?? [];
  if (search) {
    const needle = search.toLowerCase();
    items = items.filter((row: any) => {
      const candidate = row.candidate ?? {};
      const directory = row.directory ?? {};
      return [candidate.full_name, candidate.phone, candidate.email, directory.full_name, directory.phone]
        .some((value) => String(value ?? '').toLowerCase().includes(needle));
    });
  }

  return { items, total: count ?? items.length, limit, offset };
}

export async function getJobApplication(supabase: SupabaseClient, id: string) {
  const { data, error } = await supabase
    .from('job_applications')
    .select(
      `
      *,
      candidate:job_candidates (*),
      directory:crm_directory (id, full_name, display_name, phone, email, photo_url, tags, internal_notes),
      sources:job_application_sources (*),
      documents:job_application_documents (
        id, role, created_at, asset:document_assets (*)
      ),
      events:job_application_events (*),
      evaluations:job_candidate_evaluations (*)
    `,
    )
    .eq('id', id)
    .is('deleted_at', null)
    .maybeSingle();
  if (error) throw new JobApplicationsError(error.message, 'query', 500);
  if (!data) throw new JobApplicationsError('Solicitud no encontrada', 'not_found', 404);

  const assetIds = (data.documents ?? [])
    .map((doc: any) => doc.asset?.id)
    .filter(Boolean);
  let analyses: unknown[] = [];
  if (assetIds.length > 0) {
    const { data: rows } = await supabase
      .from('document_analysis_results')
      .select('*')
      .in('asset_id', assetIds)
      .order('created_at', { ascending: false });
    analyses = rows ?? [];
  }

  return { application: data, analyses, noticeVersion: NOTICE_VERSION };
}

export async function createManualApplication(
  supabase: SupabaseClient,
  profile: { id: string; email?: string | null },
  body: Record<string, unknown>,
) {
  const directoryId = String(body.directoryId ?? '');
  if (!directoryId) throw new JobApplicationsError('directoryId es requerido');
  const actor = actorOf(profile);
  const { data, error } = await supabase.rpc('ingest_job_application_from_directory', {
    p_directory_id: directoryId,
    p_actor_kind: actor.kind,
    p_actor_id: actor.id,
    p_actor_label: actor.label,
    p_origin: 'manual',
    p_conversation_stable_key: body.conversationStableKey ?? null,
    p_intent: null,
  });
  if (error) throw new JobApplicationsError(error.message, 'rpc', 500);
  return data;
}

export async function mutateApplication(
  supabase: SupabaseClient,
  profile: { id: string; email?: string | null },
  action: string,
  body: Record<string, unknown>,
) {
  const actor = actorOf(profile);
  const id = String(body.id ?? body.applicationId ?? '');
  if (!id && action !== 'backfill' && action !== 'metrics' && action !== 'listTeam' && action !== 'refreshPage') {
    throw new JobApplicationsError('applicationId es requerido');
  }

  switch (action) {
    case 'transition':
      return rpc(supabase, 'transition_job_application_stage', {
        p_application_id: id,
        p_to_stage: body.stage,
        p_actor_kind: actor.kind,
        p_actor_id: actor.id,
        p_actor_label: actor.label,
        p_note: body.note ?? null,
        p_interview_at: body.interviewAt ?? null,
      });
    case 'assign':
      return rpc(supabase, 'assign_job_application', {
        p_application_id: id,
        p_assigned_to: body.assignedTo ?? null,
        p_actor_kind: actor.kind,
        p_actor_id: actor.id,
        p_actor_label: actor.label,
      });
    case 'split':
      return rpc(supabase, 'split_job_application', {
        p_application_id: id,
        p_full_name: body.fullName,
        p_asset_ids: body.assetIds ?? [],
        p_actor_kind: actor.kind,
        p_actor_id: actor.id,
        p_actor_label: actor.label,
        p_phone: body.phone ?? null,
        p_email: body.email ?? null,
        p_document_number: body.documentNumber ?? null,
      });
    case 'merge':
      return rpc(supabase, 'merge_job_applications', {
        p_keep_id: id,
        p_absorb_id: body.absorbId,
        p_actor_kind: actor.kind,
        p_actor_id: actor.id,
        p_actor_label: actor.label,
      });
    case 'hire':
      return rpc(supabase, 'link_job_application_hire', {
        p_application_id: id,
        p_service_id: body.serviceId,
        p_member_id: body.memberId,
        p_actor_kind: actor.kind,
        p_actor_id: actor.id,
        p_actor_label: actor.label,
      });
    case 'delete':
      return rpc(supabase, 'delete_job_application', {
        p_application_id: id,
        p_actor_kind: actor.kind,
        p_actor_id: actor.id,
        p_actor_label: actor.label,
      });
    case 'enqueueMedia':
      return rpc(supabase, 'enqueue_whatsapp_media_for_application', {
        p_application_id: id,
      });
    case 'refreshPage': {
      const ids = Array.isArray(body.ids) ? body.ids.filter((value) => typeof value === 'string') : [];
      return rpc(supabase, 'refresh_job_application_page', { p_ids: ids });
    }
    case 'backfill':
      return rpc(supabase, 'backfill_job_applications', {
        p_dry_run: body.dryRun !== false,
        p_cohort: body.cohort ?? null,
        p_limit: body.limit ?? 200,
      });
    case 'metrics':
      return rpc(supabase, 'job_applications_metrics', {
        p_include_marian: body.includeMarian === true,
      });
    case 'listTeam': {
      const { data, error } = await supabase
        .from('crm_team_members')
        .select('id, service_id, name, email, phone_number, is_active, photo_url')
        .eq('is_active', true)
        .order('name');
      if (error) throw new JobApplicationsError(error.message, 'query', 500);
      return { members: data ?? [] };
    }
    default:
      throw new JobApplicationsError(`Acción no soportada: ${action}`);
  }
}

async function rpc(supabase: SupabaseClient, name: string, args: Record<string, unknown>) {
  const { data, error } = await supabase.rpc(name, args);
  if (error) throw new JobApplicationsError(error.message, name, 400);
  return data;
}
