import { useQuery } from '@tanstack/react-query';
import { getPostServiceHistory } from '@/services/postServiceAutomationsService';
import type { PostServiceHistoryResponse } from '@/types/postServiceAutomations';

export function usePostServiceHistory(params: {
  dateFrom: string;
  dateTo: string;
  enabled?: boolean;
}) {
  return useQuery<PostServiceHistoryResponse, Error>({
    queryKey: ['post-service-history', params.dateFrom, params.dateTo],
    queryFn: () => getPostServiceHistory(params),
    enabled: params.enabled !== false && Boolean(params.dateFrom && params.dateTo),
    staleTime: 30_000,
  });
}
