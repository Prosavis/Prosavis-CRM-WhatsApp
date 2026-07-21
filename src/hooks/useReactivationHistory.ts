import { useQuery } from '@tanstack/react-query';
import { getReactivationHistory } from '@/services/reactivationAutomationsService';
import type { ReactivationHistoryResponse } from '@/types/reactivationAutomations';

export function useReactivationHistory(params: {
  dateFrom: string;
  dateTo: string;
  enabled?: boolean;
}) {
  return useQuery<ReactivationHistoryResponse, Error>({
    queryKey: ['reactivation-history', params.dateFrom, params.dateTo],
    queryFn: () => getReactivationHistory(params),
    enabled: params.enabled !== false && Boolean(params.dateFrom && params.dateTo),
    staleTime: 30_000,
  });
}
