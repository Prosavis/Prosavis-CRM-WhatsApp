import { supabase } from '@/config/supabase';
import type {
  DirectoryCancellationIncident,
  DirectoryWorkspaceKpis,
  DirectoryWorkspacePageResult,
  DirectoryWorkspaceSegment,
  DirectoryWorkspaceView,
} from '@/utils/directoryWorkspace';
import { emptyDirectoryWorkspaceKpis } from '@/utils/directoryWorkspace';

async function invokeWorkspace<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke<T>('get-directory-workspace', { body });
  if (error) throw new Error(error.message || 'No se pudo consultar el directorio.');
  if (data == null) throw new Error('La función get-directory-workspace no devolvió datos.');
  return data;
}

export async function getDirectoryWorkspaceSummary(serviceId: string): Promise<DirectoryWorkspaceKpis> {
  const payload = await invokeWorkspace<{ kpis?: DirectoryWorkspaceKpis }>({
    action: 'summary',
    serviceId,
  });
  return payload.kpis ?? emptyDirectoryWorkspaceKpis();
}

export async function getDirectoryWorkspacePage(params: {
  serviceId: string;
  view: DirectoryWorkspaceView;
  search?: string;
  segment?: DirectoryWorkspaceSegment | null;
  limit?: number;
  offset?: number;
}): Promise<DirectoryWorkspacePageResult> {
  return invokeWorkspace<DirectoryWorkspacePageResult>({
    action: 'page',
    serviceId: params.serviceId,
    view: params.view,
    search: params.search || null,
    segment: params.segment ?? null,
    limit: params.limit ?? 50,
    offset: params.offset ?? 0,
  });
}

export async function getDirectoryWorkspaceCancellations(params: {
  serviceId: string;
  directoryId: string;
}): Promise<DirectoryCancellationIncident[]> {
  const payload = await invokeWorkspace<{ items?: DirectoryCancellationIncident[] }>({
    action: 'cancellations',
    serviceId: params.serviceId,
    directoryId: params.directoryId,
  });
  return payload.items ?? [];
}
