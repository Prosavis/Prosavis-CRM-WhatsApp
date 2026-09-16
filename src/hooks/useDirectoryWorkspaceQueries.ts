import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { PROSAVIS_CLEANING_SERVICE_ID } from '@/constants/cleaningService';
import { inboxQueryKeys } from '@/hooks/inboxQueryKeys';
import {
  getDirectoryWorkspaceCancellations,
  getDirectoryWorkspacePage,
  getDirectoryWorkspaceSummary,
} from '@/services/directoryWorkspaceService';
import type { DirectoryWorkspaceSegment, DirectoryWorkspaceView } from '@/utils/directoryWorkspace';

export function useDirectoryWorkspaceSummary() {
  return useQuery({
    queryKey: inboxQueryKeys.directoryWorkspaceSummary(PROSAVIS_CLEANING_SERVICE_ID),
    queryFn: () => getDirectoryWorkspaceSummary(PROSAVIS_CLEANING_SERVICE_ID),
    staleTime: 30_000,
    placeholderData: (previous) => previous,
  });
}

export function useDirectoryWorkspacePage(params: {
  view: DirectoryWorkspaceView;
  search?: string;
  segment?: DirectoryWorkspaceSegment | null;
  limit: number;
  offset: number;
  enabled?: boolean;
}) {
  return useQuery({
    queryKey: inboxQueryKeys.directoryWorkspacePage(
      PROSAVIS_CLEANING_SERVICE_ID,
      params.view,
      params.search ?? '',
      params.segment ?? null,
      params.limit,
      params.offset,
    ),
    queryFn: () =>
      getDirectoryWorkspacePage({
        serviceId: PROSAVIS_CLEANING_SERVICE_ID,
        view: params.view,
        search: params.search,
        segment: params.segment,
        limit: params.limit,
        offset: params.offset,
      }),
    staleTime: 15_000,
    enabled: params.enabled !== false,
    placeholderData: (previous) => previous,
  });
}

export function useDirectoryWorkspaceCancellations(directoryId: string | null) {
  return useQuery({
    queryKey: inboxQueryKeys.directoryWorkspaceCancellations(
      PROSAVIS_CLEANING_SERVICE_ID,
      directoryId ?? '',
    ),
    queryFn: () =>
      getDirectoryWorkspaceCancellations({
        serviceId: PROSAVIS_CLEANING_SERVICE_ID,
        directoryId: directoryId ?? '',
      }),
    enabled: Boolean(directoryId),
    staleTime: 15_000,
  });
}

export function useDirectoryWorkspaceFocusRefetch() {
  const queryClient = useQueryClient();
  useEffect(() => {
    const refetch = () => {
      void queryClient.invalidateQueries({ queryKey: inboxQueryKeys.directoryWorkspaceRoot() });
    };
    const onVisibility = () => {
      if (document.visibilityState === 'visible') refetch();
    };
    window.addEventListener('focus', refetch);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.removeEventListener('focus', refetch);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [queryClient]);
}
