import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { inboxQueryKeys } from '@/hooks/inboxQueryKeys';
import {
  assignJobApplication,
  backfillJobApplications,
  deleteJobApplication,
  getJobApplication,
  getJobApplicationMetrics,
  hireJobApplication,
  listJobApplications,
  listJobTeamMembers,
  mergeJobApplications,
  splitJobApplication,
  transitionJobApplication,
} from '@/services/jobApplicationsService';

export function useJobApplicationsList(params: {
  stage?: string | null;
  cohort?: string | null;
  assignedTo?: string | null;
  search?: string;
  includeMarian?: boolean;
  needsReview?: boolean;
  limit: number;
  offset: number;
}) {
  return useQuery({
    queryKey: inboxQueryKeys.jobApplicationsList(params),
    queryFn: () => listJobApplications(params),
    staleTime: 15_000,
    placeholderData: (previous) => previous,
  });
}

export function useJobApplicationsMetrics(includeMarian = false) {
  return useQuery({
    queryKey: inboxQueryKeys.jobApplicationsMetrics(includeMarian),
    queryFn: () => getJobApplicationMetrics(includeMarian),
    staleTime: 15_000,
  });
}

export function useJobApplicationDetail(id: string | null) {
  return useQuery({
    queryKey: inboxQueryKeys.jobApplicationDetail(id ?? ''),
    queryFn: () => getJobApplication(id ?? ''),
    enabled: Boolean(id),
    staleTime: 10_000,
  });
}

export function useJobTeamMembers() {
  return useQuery({
    queryKey: inboxQueryKeys.jobTeamMembers(),
    queryFn: listJobTeamMembers,
    staleTime: 60_000,
  });
}

export function useInvalidateJobApplications() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: inboxQueryKeys.jobApplicationsRoot() });
}

export function useJobApplicationMutations() {
  const invalidate = useInvalidateJobApplications();
  const transition = useMutation({
    mutationFn: ({ id, stage, note }: { id: string; stage: string; note?: string }) =>
      transitionJobApplication(id, stage, note),
    onSuccess: invalidate,
  });
  const assign = useMutation({
    mutationFn: ({ id, assignedTo }: { id: string; assignedTo: string | null }) =>
      assignJobApplication(id, assignedTo),
    onSuccess: invalidate,
  });
  const split = useMutation({
    mutationFn: splitJobApplication,
    onSuccess: invalidate,
  });
  const merge = useMutation({
    mutationFn: ({ id, absorbId }: { id: string; absorbId: string }) =>
      mergeJobApplications(id, absorbId),
    onSuccess: invalidate,
  });
  const hire = useMutation({
    mutationFn: ({ id, serviceId, memberId }: { id: string; serviceId: string; memberId: string }) =>
      hireJobApplication(id, serviceId, memberId),
    onSuccess: invalidate,
  });
  const remove = useMutation({
    mutationFn: (id: string) => deleteJobApplication(id),
    onSuccess: invalidate,
  });
  const backfill = useMutation({
    mutationFn: backfillJobApplications,
    onSuccess: invalidate,
  });
  return { transition, assign, split, merge, hire, remove, backfill };
}
