import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  createAppAutomation,
  deleteAppAutomation,
  listAppAutomations,
  toggleAppAutomation,
  updateAppAutomation,
} from '@/services/appAutomationsService';
import type {
  CreateAutomationPayload,
  UpdateAutomationPayload,
} from '@/types/automations';

export const APP_AUTOMATIONS_QUERY_KEY = ['app-automations'] as const;

export function useAppAutomations() {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: APP_AUTOMATIONS_QUERY_KEY,
    queryFn: listAppAutomations,
    staleTime: 15_000,
  });

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: APP_AUTOMATIONS_QUERY_KEY });

  const createMutation = useMutation({
    mutationFn: (payload: CreateAutomationPayload) => createAppAutomation(payload),
    onSuccess: () => void invalidate(),
  });

  const updateMutation = useMutation({
    mutationFn: ({
      ruleId,
      payload,
    }: {
      ruleId: string;
      payload: UpdateAutomationPayload;
    }) => updateAppAutomation(ruleId, payload),
    onSuccess: () => void invalidate(),
  });

  const deleteMutation = useMutation({
    mutationFn: (ruleId: string) => deleteAppAutomation(ruleId),
    onSuccess: () => void invalidate(),
  });

  const toggleMutation = useMutation({
    mutationFn: ({ ruleId, isActive }: { ruleId: string; isActive: boolean }) =>
      toggleAppAutomation(ruleId, isActive),
    onSuccess: () => void invalidate(),
  });

  return {
    automations: query.data ?? [],
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    error: query.error,
    refetch: query.refetch,
    createAutomation: createMutation.mutateAsync,
    updateAutomation: (ruleId: string, payload: UpdateAutomationPayload) =>
      updateMutation.mutateAsync({ ruleId, payload }),
    deleteAutomation: deleteMutation.mutateAsync,
    toggleAutomation: (ruleId: string, isActive: boolean) =>
      toggleMutation.mutateAsync({ ruleId, isActive }),
    isCreating: createMutation.isPending,
    isUpdating: updateMutation.isPending,
  };
}
