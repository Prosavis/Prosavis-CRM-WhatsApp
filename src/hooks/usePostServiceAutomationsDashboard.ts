import { useQuery } from '@tanstack/react-query';
import { getPostServiceAutomationsDashboard } from '@/services/postServiceAutomationsService';
import type { PostServiceAutomationsDashboard } from '@/types/postServiceAutomations';

export const POST_SERVICE_AUTOMATIONS_QUERY_KEY = [
  'post-service-automations-dashboard',
] as const;

export function usePostServiceAutomationsDashboard() {
  return useQuery<PostServiceAutomationsDashboard, Error>({
    queryKey: POST_SERVICE_AUTOMATIONS_QUERY_KEY,
    queryFn: getPostServiceAutomationsDashboard,
    refetchInterval: 60_000,
    staleTime: 20_000,
  });
}
