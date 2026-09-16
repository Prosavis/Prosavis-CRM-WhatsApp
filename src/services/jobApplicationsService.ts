import { supabase } from '@/config/supabase';
import type {
  JobApplicationDetail,
  JobApplicationsListResponse,
  JobApplicationsMetrics,
  JobTeamMember,
} from '@/types/jobApplications';

async function parseInvokeError(error: unknown): Promise<string> {
  const ctx = (error as { context?: Response }).context;
  if (ctx) {
    try {
      const body = (await ctx.json()) as { error?: string };
      if (body.error) return body.error;
    } catch {
      /* ignore */
    }
  }
  return error instanceof Error ? error.message : 'Error en solicitudes de empleo';
}

async function invokeAdmin<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke<T>('job-applications-admin', { body });
  if (error) throw new Error(await parseInvokeError(error));
  if (data == null) throw new Error('Respuesta vacía de job-applications-admin');
  if (typeof data === 'object' && data !== null && 'error' in data) {
    const message = (data as { error?: string }).error;
    if (message) throw new Error(message);
  }
  return data;
}

async function invokeDocuments<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke<T>('document-analysis-admin', { body });
  if (error) throw new Error(await parseInvokeError(error));
  if (data == null) throw new Error('Respuesta vacía de document-analysis-admin');
  if (typeof data === 'object' && data !== null && 'error' in data) {
    const message = (data as { error?: string }).error;
    if (message) throw new Error(message);
  }
  return data;
}

export function listJobApplications(params: {
  stage?: string | null;
  cohort?: string | null;
  assignedTo?: string | null;
  search?: string;
  includeMarian?: boolean;
  needsReview?: boolean;
  limit?: number;
  offset?: number;
}): Promise<JobApplicationsListResponse> {
  return invokeAdmin<JobApplicationsListResponse>({ action: 'list', ...params });
}

export function getJobApplication(id: string): Promise<JobApplicationDetail> {
  return invokeAdmin<JobApplicationDetail>({ action: 'get', id });
}

export function getJobApplicationMetrics(includeMarian = false): Promise<JobApplicationsMetrics> {
  return invokeAdmin<JobApplicationsMetrics>({ action: 'metrics', includeMarian });
}

export function transitionJobApplication(id: string, stage: string, note?: string) {
  return invokeAdmin({ action: 'transition', id, stage, note });
}

export function assignJobApplication(id: string, assignedTo: string | null) {
  return invokeAdmin({ action: 'assign', id, assignedTo });
}

export function splitJobApplication(params: {
  id: string;
  fullName: string;
  assetIds?: string[];
  phone?: string;
  email?: string;
  documentNumber?: string;
}) {
  return invokeAdmin({ action: 'split', ...params });
}

export function mergeJobApplications(id: string, absorbId: string) {
  return invokeAdmin({ action: 'merge', id, absorbId });
}

export function hireJobApplication(id: string, serviceId: string, memberId: string) {
  return invokeAdmin({ action: 'hire', id, serviceId, memberId });
}

export function deleteJobApplication(id: string) {
  return invokeAdmin({ action: 'delete', id });
}

export function backfillJobApplications(params: {
  dryRun?: boolean;
  cohort?: string | null;
  limit?: number;
}) {
  return invokeAdmin({ action: 'backfill', ...params });
}

export function listJobTeamMembers(): Promise<{ members: JobTeamMember[] }> {
  return invokeAdmin<{ members: JobTeamMember[] }>({ action: 'listTeam' });
}

export function enqueueJobApplicationMedia(applicationId: string) {
  return invokeDocuments({ action: 'enqueue', applicationId });
}

export function getJobDocumentSignedUrl(assetId: string): Promise<{ url: string }> {
  return invokeDocuments<{ url: string }>({ action: 'signedUrl', assetId });
}
