import type { DirectoryWorkspaceSegment, DirectoryWorkspaceView } from './directoryWorkspace';
import { isDirectoryWorkspaceSegment } from './directoryWorkspace';

export type DirectoryCrmView = DirectoryWorkspaceView;

export function resolveDirectoryCrmView(search: URLSearchParams): DirectoryCrmView {
  const raw = search.get('dirView');
  if (raw === 'directorio' || raw === 'all') return 'all';
  if (raw === 'cancelados' || raw === 'canceled') return 'canceled';
  return 'scheduled';
}

export function applyDirectoryCrmView(
  search: URLSearchParams,
  view: DirectoryCrmView,
): URLSearchParams {
  const next = new URLSearchParams(search);
  next.set('tab', 'leads');
  next.delete('vista');
  if (view === 'scheduled') next.delete('dirView');
  else next.set('dirView', view === 'all' ? 'directorio' : 'cancelados');
  return next;
}

export function resolveDirectorySegment(
  search: URLSearchParams,
): DirectoryWorkspaceSegment | null {
  const value = search.get('segment');
  return isDirectoryWorkspaceSegment(value) ? value : null;
}

export function applyDirectorySegment(
  search: URLSearchParams,
  segment: DirectoryWorkspaceSegment | null,
): URLSearchParams {
  const next = new URLSearchParams(search);
  if (segment) next.set('segment', segment);
  else next.delete('segment');
  return next;
}

export function applyDirectoryClientId(
  search: URLSearchParams,
  clientId: string | null,
): URLSearchParams {
  const next = new URLSearchParams(search);
  if (clientId) next.set('clientId', clientId);
  else next.delete('clientId');
  return next;
}

export function directoryKpiTarget(
  key: 'total' | 'scheduled' | 'canceledOrRejected' | 'recurring' | 'reactivation',
): { view: DirectoryCrmView; segment: DirectoryWorkspaceSegment | null } {
  switch (key) {
    case 'scheduled':
      return { view: 'scheduled', segment: null };
    case 'canceledOrRejected':
      return { view: 'canceled', segment: null };
    case 'recurring':
      return { view: 'all', segment: 'recurring' };
    case 'reactivation':
      return { view: 'all', segment: 'reactivation' };
    case 'total':
      return { view: 'all', segment: null };
    default: {
      const _never: never = key;
      return _never;
    }
  }
}
